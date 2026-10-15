import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useChat } from '@ai-sdk/vue'
import { isTextUIPart, type ChatTransport, type UIMessage, type UIMessageChunk } from 'ai'
import type { AssistantContext, AssistantReply, AssistantSlots } from '@learnup/types'

export interface AssistantEntry {
  id?: string
  role: 'user' | 'assistant'
  /** Texte utilisateur, ou `reply.text` pour l'assistant. */
  content: string
  /** Réponse structurée complète — uniquement sur les entrées assistant. */
  reply?: AssistantReply
}

export interface AssistantSendOptions {
  /**
   * Appelé quand l'envoi quitte la file d'attente et part réellement — jamais
   * pour un envoi abandonné (stop, nouvelle recherche). Le message n'est pas
   * encore dans le fil : `entries` reflète l'état juste avant ce tour.
   */
  onStart?: () => void
}

export interface AssistantReplyMeta {
  /** Rang du tour utilisateur ayant produit la réponse (1 = premier message). */
  turn: number
}

export interface UseAssistantOptions {
  /**
   * Réponse structurée reçue de l'API — jamais l'accueil local injecté via
   * `append`. Sert aux jalons analytics du parcours.
   */
  onReply?: (reply: AssistantReply, meta: AssistantReplyMeta) => void
}

/**
 * Message UI SDK : le texte vit dans les parts `text`, la réponse structurée
 * (kind, suggestions, recommandations…) dans une data part `data-assistant`.
 */
type AssistantUIMessage = UIMessage<unknown, { assistant: AssistantReply }>

function textOf(message: AssistantUIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join(' ')
}

function replyOf(message: AssistantUIMessage): AssistantReply | undefined {
  const part = message.parts.find((p) => p.type === 'data-assistant')
  return part?.type === 'data-assistant' ? part.data : undefined
}

function isAssistantReply(value: unknown): value is AssistantReply {
  if (typeof value !== 'object' || value === null) return false
  const reply = value as AssistantReply
  return (
    ['clarify', 'recommend', 'no_results', 'out_of_catalog'].includes(reply.kind) &&
    typeof reply.text === 'string'
  )
}

/**
 * Notre endpoint renvoie une décision structurée en JSON (pas un flux texte) :
 * le transport l'encapsule dans le protocole UIMessage attendu par `useChat`.
 */
function replyStream(reply: AssistantReply): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'start' })
      controller.enqueue({ type: 'text-start', id: 'text-1' })
      if (reply.text) {
        controller.enqueue({ type: 'text-delta', id: 'text-1', delta: reply.text })
      }
      controller.enqueue({ type: 'text-end', id: 'text-1' })
      controller.enqueue({ type: 'data-assistant', data: reply })
      controller.enqueue({ type: 'finish' })
      controller.close()
    }
  })
}

/**
 * Machine à états de la recherche assistée, adossée à `useChat` (AI SDK) :
 * fil de conversation, statut pending / indisponible (E9), retry via
 * `regenerate`, édition utilisateur via `messageId`, annulation via
 * AbortSignal. Le contexte du point d'entrée
 * (ville, formation d'origine, thème) est transmis à chaque tour ; le besoin
 * brut agrégé sert à contextualiser la demande de formation (D1).
 */
export function useAssistant(
  initialContext: MaybeRefOrGetter<AssistantContext> = {},
  options: UseAssistantOptions = {}
) {
  const config = useRuntimeConfig()

  const contextChips = ref<string[]>([])
  const slots = ref<AssistantSlots>({})

  async function callApi(
    message: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    signal?: AbortSignal
  ): Promise<AssistantReply> {
    const apiBase = import.meta.server ? config.apiBase : config.public.apiBase
    const reply = await $fetch<unknown>(`${apiBase}/assistant/message`, {
      method: 'POST',
      body: { message, history, context: toValue(initialContext) },
      headers: internalSsrHeaders(config),
      signal
    })
    if (!isAssistantReply(reply)) throw new Error('Invalid assistant reply')
    return reply
  }

  const transport: ChatTransport<AssistantUIMessage> = {
    async sendMessages({ messages: conversation, abortSignal }) {
      const lastUserIndex = conversation.findLastIndex((m) => m.role === 'user')
      const lastUser = conversation[lastUserIndex]
      // Les messages `local-*` (accueil injecté via `append`) ne partent jamais
      // à l'API : un historique ouvert par un message assistant casserait le
      // premier tour côté Anthropic.
      const history = conversation
        .slice(0, Math.max(lastUserIndex, 0))
        .filter((m) => !m.id.startsWith('local-'))
        .map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: textOf(m)
        }))
      try {
        const reply = await callApi(lastUser ? textOf(lastUser) : '', history, abortSignal)
        return replyStream(reply)
      } catch (error) {
        // Une requête annulée par `stop()` doit être ignorée même si le client
        // HTTP rejette avec une erreur autre que `AbortError`.
        if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError')
        throw error
      }
    },
    reconnectToStream: () => Promise.resolve(null)
  }

  const {
    messages,
    status,
    sendMessage,
    regenerate,
    clearError,
    stop: stopRequest
  } = useChat<AssistantUIMessage>({
    transport,
    onData(part) {
      if (part.type !== 'data-assistant') return
      const reply = part.data
      if (reply.contextChips?.length) contextChips.value = reply.contextChips
      if (reply.slots) slots.value = { ...slots.value, ...reply.slots }
      // Le message utilisateur du tour est déjà dans le fil quand la réponse arrive.
      options.onReply?.(reply, {
        turn: messages.value.filter((m) => m.role === 'user').length
      })
    },
    onError(error) {
      if (import.meta.server) {
        logServerError('[useAssistant] assistant call failed:', error)
      }
    }
  })

  // Envois encore en file applicative (avant que `AbstractChat` n'arme sa
  // requête) : comptés dans `pending` pour qu'un envoi seulement en attente
  // soit visible dès l'appel à `send`.
  const queuedSends = ref(0)
  const pending = computed(
    () => queuedSends.value > 0 || status.value === 'submitted' || status.value === 'streaming'
  )
  const unavailable = computed(() => status.value === 'error')

  const entries = computed<AssistantEntry[]>(() =>
    messages.value.map((m) => ({
      id: m.id,
      role: m.role === 'user' ? 'user' : 'assistant',
      content: textOf(m),
      reply: replyOf(m)
    }))
  )

  const started = computed(() => entries.value.length > 0)

  /** Dernière réponse réelle de l'API — l'accueil local (`append`) ne compte pas. */
  const lastReply = computed<AssistantReply | undefined>(() => {
    const message = messages.value.findLast(
      (m) => m.role === 'assistant' && !m.id.startsWith('local-')
    )
    return message ? replyOf(message) : undefined
  })

  /** Le prochain message utilisateur répond à une question de précision. */
  const awaitingClarification = computed(() => lastReply.value?.kind === 'clarify')

  /** Besoin agrégé tel que décrit — joint à la demande de formation. */
  const needSummary = computed(() =>
    entries.value
      .filter((e) => e.role === 'user')
      .map((e) => e.content)
      .join(' ')
  )

  /** Message local (accueil E1) : injecté dans le fil sans appel API. */
  function append(entry: AssistantEntry) {
    messages.value = [
      ...messages.value,
      {
        id: `local-${messages.value.length}`,
        role: entry.role,
        parts: [
          { type: 'text', text: entry.content },
          ...(entry.reply ? [{ type: 'data-assistant' as const, data: entry.reply }] : [])
        ]
      }
    ]
  }

  // File d'envoi applicative : `AbstractChat` ne sérialise pas les appels
  // `makeRequest` — deux `sendMessage` concurrents lanceraient deux requêtes
  // en parallèle. `generation` invalide les envois encore en file après reset.
  let sendQueue: Promise<unknown> = Promise.resolve()
  let generation = 0

  function enqueueSend(run: () => Promise<void>): Promise<void> {
    const gen = generation
    queuedSends.value += 1
    const queued = sendQueue.then(async () => {
      try {
        if (gen !== generation) return
        await run()
      } finally {
        if (gen === generation) queuedSends.value -= 1
      }
    })
    // Un envoi en échec ne doit pas empoisonner la file.
    sendQueue = queued.then(
      () => undefined,
      () => undefined
    )
    return queued
  }

  function invalidateSends() {
    generation += 1
    sendQueue = Promise.resolve()
    queuedSends.value = 0
  }

  function send(message: string, options: AssistantSendOptions = {}): Promise<void> {
    const text = message.trim()
    if (!text) return Promise.resolve()
    return enqueueSend(() => {
      options.onStart?.()
      // `parts` complet : `{ text }` passerait par la conversion de fichiers
      // (await) avant `pushMessage`/`makeRequest`, ouvrant une fenêtre où un
      // `reset()` laisserait l'envoi hors de portée de `stop()`.
      return sendMessage({ parts: [{ type: 'text', text }] })
    })
  }

  /** Édite un message utilisateur, tronque la suite et relance la réponse. */
  function editAndSend(
    messageId: string,
    message: string,
    options: AssistantSendOptions = {}
  ): Promise<void> {
    const text = message.trim()
    if (!text) return Promise.resolve()
    return enqueueSend(() => {
      options.onStart?.()
      return sendMessage({ messageId, parts: [{ type: 'text', text }] })
    })
  }

  /** Renvoie le dernier message après une indisponibilité (E9 → Réessayer). */
  function retry() {
    if (pending.value) return Promise.resolve()
    return regenerate()
  }

  /** Stop UX : annule la requête active et abandonne les envois encore en file. */
  function stopSending(): Promise<void> {
    invalidateSends()
    return stopRequest()
  }

  function reset() {
    invalidateSends()
    void stopRequest()
    messages.value = []
    contextChips.value = []
    slots.value = {}
    clearError()
  }

  return {
    entries,
    pending,
    unavailable,
    contextChips,
    slots,
    started,
    lastReply,
    awaitingClarification,
    needSummary,
    append,
    send,
    editAndSend,
    retry,
    reset,
    stop: stopSending
  }
}
