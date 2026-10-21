import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import type { AssistantContext, AssistantReply } from '@learnup/types'
import type { AssistantEntry, AssistantSendOptions } from '~/composables/useAssistant'
import { useAssistantTracking } from '~/composables/useAssistantTracking'

/**
 * Conversation factice : seuls les signaux observés par le suivi existent.
 * Par défaut un envoi démarre aussitôt (`onStart`) ; `deferStarts` le laisse
 * en file pour simuler des messages qui attendent leur tour.
 */
function fakeAssistant(entries: AssistantEntry[] = [], options: { deferStarts?: boolean } = {}) {
  const list = ref(entries)
  const pending = ref(false)
  const unavailable = ref(false)
  const awaiting = ref(false)
  const lastReply = ref<AssistantReply>()
  const starts: (() => void)[] = []
  const start = (sendOptions?: AssistantSendOptions) => {
    if (options.deferStarts) starts.push(() => sendOptions?.onStart?.())
    else sendOptions?.onStart?.()
    return Promise.resolve()
  }
  return {
    list,
    starts,
    pendingState: pending,
    unavailableState: unavailable,
    awaitingState: awaiting,
    lastReplyState: lastReply,
    assistant: {
      entries: computed(() => list.value),
      pending: computed(() => pending.value),
      unavailable: computed(() => unavailable.value),
      lastReply: computed(() => lastReply.value),
      awaitingClarification: computed(() => awaiting.value),
      send: vi.fn((_message: string, sendOptions?: AssistantSendOptions) => start(sendOptions)),
      editAndSend: vi.fn((_id: string, _message: string, sendOptions?: AssistantSendOptions) =>
        start(sendOptions)
      )
    }
  }
}

const userTurn = (id: string, content: string): AssistantEntry => ({ id, role: 'user', content })
const assistantTurn = (id: string, reply: AssistantReply): AssistantEntry => ({
  id,
  role: 'assistant',
  content: reply.text,
  reply
})

type Pushed = Record<string, unknown> & { event: string }

function pushed(): Pushed[] {
  return (window.dataLayer ?? []) as Pushed[]
}

// Le chemin de page est posé par le dataLayer (spec de useAssistantAnalytics) :
// les jalons sont comparés sans lui.
const withoutPage = ({ page_path: _page, ...event }: Pushed) => event

/** Jalons `ai_*` poussés. */
function events(): unknown[] {
  return pushed()
    .filter((e) => e.event.startsWith('ai_'))
    .map(withoutPage)
}

/** Jalons du module Chatbot. */
function chatbotEvents(): Record<string, unknown>[] {
  return pushed()
    .filter((e) => e.event.startsWith('chatbot_'))
    .map(withoutPage)
}

beforeEach(() => {
  window.dataLayer = []
})

afterEach(() => {
  delete window.dataLayer
})

describe('useAssistantTracking', () => {
  it('classe un message comme réponse à une précision seulement quand elle est attendue', async () => {
    const { assistant, awaitingState } = fakeAssistant([userTurn('u1', 'sst')])
    const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'home' }))

    await tracking.submit('8 salariés', 'suggestion')
    awaitingState.value = true
    await tracking.submit('à Créteil', 'text')

    expect(events()).toEqual([
      { event: 'ai_search_submit', source: 'home', turn: 2, via: 'suggestion' },
      { event: 'ai_clarification_answer', source: 'home', turn: 2, via: 'text' }
    ])
    expect(assistant.send).toHaveBeenCalledTimes(2)
  })

  it("compte un message de point d'entrée comme nouveau besoin, même en attente de précision", async () => {
    const { assistant, awaitingState, pendingState } = fakeAssistant([userTurn('u1', 'sst')])
    const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'catalogue' }))
    awaitingState.value = true
    pendingState.value = true

    // Le message d'entrée rejoint la file d'envoi même pendant l'analyse.
    await tracking.submit('un autre besoin', 'entry')

    expect(events()).toEqual([
      { event: 'ai_search_submit', source: 'catalogue', turn: 2, via: 'entry' }
    ])
    expect(assistant.send).toHaveBeenCalledWith('un autre besoin', expect.any(Object))
  })

  it("ignore les envois vides et ceux du panneau pendant l'analyse", async () => {
    const { assistant, pendingState } = fakeAssistant()
    const tracking = useAssistantTracking(assistant, ref<AssistantContext>({}))

    await tracking.submit('   ', 'text')
    pendingState.value = true
    await tracking.submit('pendant', 'text')
    await tracking.submit('pendant', 'suggestion')

    expect(pushed()).toEqual([])
    expect(assistant.send).not.toHaveBeenCalled()
  })

  it('numérote les messages en file par le tour qu’ils prennent réellement', async () => {
    // Un tour est en cours ; deux besoins arrivent de points d'entrée.
    const { assistant, list, starts, pendingState } = fakeAssistant([userTurn('u1', 'premier')], {
      deferStarts: true
    })
    const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'home' }))
    pendingState.value = true

    void tracking.submit('deuxième', 'entry')
    void tracking.submit('troisième', 'entry')
    // Rien n'est compté tant que les envois attendent en file.
    expect(pushed()).toEqual([])

    starts[0]!()
    list.value = [...list.value, userTurn('u2', 'deuxième')]
    starts[1]!()

    expect(events()).toEqual([
      { event: 'ai_search_submit', source: 'home', turn: 2, via: 'entry' },
      { event: 'ai_search_submit', source: 'home', turn: 3, via: 'entry' }
    ])
    expect(chatbotEvents().map((e) => e.message_index)).toEqual([2, 3])
  })

  it('ne compte pas un envoi abandonné avant son départ', async () => {
    // `onStart` n'est jamais appelé pour un envoi retiré de la file (stop, reset).
    const { assistant } = fakeAssistant([], { deferStarts: true })
    const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'home' }))

    await tracking.submit('abandonné', 'text')

    expect(assistant.send).toHaveBeenCalledOnce()
    expect(pushed()).toEqual([])
  })

  it("ne compte un début de recherche qu'à l'ouverture d'une conversation vierge ou sur message d'entrée", () => {
    const { assistant, list } = fakeAssistant()
    const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'header' }))

    tracking.onOpen()
    list.value = [userTurn('u1', 'sst')]
    tracking.onOpen()
    tracking.onOpen({ entryMessage: true })

    expect(events()).toEqual([
      { event: 'ai_search_start', source: 'header' },
      { event: 'ai_search_start', source: 'header' }
    ])
  })

  it('garde la source de la recherche en cours quand le panneau est rouvert ailleurs', async () => {
    const { assistant, list } = fakeAssistant()
    const context = ref<AssistantContext>({ source: 'home' })
    const tracking = useAssistantTracking(assistant, context)

    tracking.onOpen()
    await tracking.submit('former au SST', 'text')
    list.value = [userTurn('u1', 'former au SST')]

    // Le lanceur remplace le contexte : la recherche commencée reste « home ».
    context.value = { source: 'header' }
    tracking.onOpen()
    tracking.onReply({ kind: 'recommend', text: 'ok', recommendations: [] }, { turn: 1 })
    tracking.select({ slug: 'sst', rank: 'primary', action: 'formation' })
    tracking.escalate('recommend')

    expect(events().slice(2)).toEqual([
      { event: 'ai_recommendation_display', source: 'home', turn: 1, count: 0 },
      {
        event: 'ai_recommendation_select',
        slug: 'sst',
        rank: 'primary',
        action: 'formation',
        source: 'home'
      },
      { event: 'ai_advisor_escalation', source: 'home', from: 'recommend' }
    ])

    // Un nouveau besoin transmis par un point d'entrée ouvre une recherche : la source suit.
    context.value = { source: 'catalogue' }
    tracking.onOpen({ entryMessage: true })
    await tracking.submit('autre besoin', 'entry')

    expect(events().slice(-2)).toEqual([
      { event: 'ai_search_start', source: 'catalogue' },
      { event: 'ai_search_submit', source: 'catalogue', turn: 2, via: 'entry' }
    ])
  })

  it('attribue une édition au rang du message modifié et ignore un identifiant inconnu', async () => {
    const { assistant } = fakeAssistant([userTurn('u1', 'sst'), userTurn('u2', '8 salariés')])
    const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'home' }))

    await tracking.edit('u1', 'sst pour 8 salariés')
    await tracking.edit('nope', 'x')
    await tracking.edit('u2', '   ')

    expect(events()).toEqual([{ event: 'ai_search_submit', source: 'home', turn: 1, via: 'edit' }])
    expect(chatbotEvents()).toEqual([
      { event: 'chatbot_message_sent', conversation_id: expect.any(String), message_index: 1 }
    ])
    expect(assistant.editAndSend).toHaveBeenCalledTimes(1)
    expect(assistant.editAndSend).toHaveBeenCalledWith(
      'u1',
      'sst pour 8 salariés',
      expect.any(Object)
    )
  })

  it('relaie les réponses et les sélections avec la source', () => {
    const { assistant } = fakeAssistant()
    const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'formation' }))

    tracking.onReply({ kind: 'clarify', text: 'Précisez.' }, { turn: 1 })
    tracking.onReply(
      { kind: 'recommend', text: 'ok', mode: 'ai', recommendations: [] },
      { turn: 2 }
    )
    tracking.onReply({ kind: 'no_results', text: 'rien' }, { turn: 3 })
    tracking.select({ slug: 'sst', rank: 'primary', action: 'formation' })

    expect(events()).toEqual([
      { event: 'ai_clarification_requested', source: 'formation', turn: 1 },
      { event: 'ai_recommendation_display', source: 'formation', turn: 2, count: 0, mode: 'ai' },
      { event: 'ai_no_results', source: 'formation', turn: 3, kind: 'no_results' },
      {
        event: 'ai_recommendation_select',
        slug: 'sst',
        rank: 'primary',
        action: 'formation',
        source: 'formation'
      }
    ])
  })

  it('trace les impasses et les réponses produites en mode dégradé', () => {
    const { assistant } = fakeAssistant()
    const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'home' }))

    tracking.onReply({ kind: 'no_results', text: 'rien', mode: 'ai' }, { turn: 1 })
    tracking.onReply(
      { kind: 'recommend', text: 'ok', mode: 'fallback', recommendations: [] },
      { turn: 2 }
    )

    expect(events()).toEqual([
      { event: 'ai_no_results', source: 'home', turn: 1, kind: 'no_results', mode: 'ai' },
      { event: 'ai_recommendation_display', source: 'home', turn: 2, count: 0, mode: 'fallback' },
      { event: 'ai_fallback_mode', source: 'home', turn: 2, kind: 'recommend' }
    ])
  })

  it("trace l'indisponibilité du moteur au tour courant", async () => {
    const { assistant, unavailableState } = fakeAssistant([userTurn('u1', 'sst')])
    useAssistantTracking(assistant, ref<AssistantContext>({ source: 'centre' }))

    unavailableState.value = true
    await nextTick()
    unavailableState.value = false
    await nextTick()

    expect(events()).toEqual([{ event: 'ai_unavailable', source: 'centre', turn: 1 }])
  })

  it("trace la comparaison et la sortie conseiller avec son état d'origine", () => {
    const { assistant, lastReplyState } = fakeAssistant()
    const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'home' }))
    lastReplyState.value = { kind: 'recommend', text: 'ok', mode: 'fallback' }

    tracking.compare(3)
    tracking.escalate('degraded')
    // Un état inconnu n'est pas transmis : le jalon part sans origine.
    tracking.escalate('nope')

    expect(events()).toEqual([
      { event: 'ai_recommendation_compare', source: 'home', count: 3 },
      { event: 'ai_advisor_escalation', source: 'home', from: 'degraded', mode: 'fallback' },
      { event: 'ai_advisor_escalation', source: 'home', mode: 'fallback' }
    ])
  })

  describe('module Chatbot du plan de tracking', () => {
    it("trace l'ouverture, la durée et l'issue de la conversation", async () => {
      let now = 10_000
      const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
      try {
        const { assistant, list } = fakeAssistant()
        const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'home' }))

        // Fermeture sans ouverture : rien à conclure.
        tracking.panelClosed()
        tracking.panelOpened('manuel')
        await tracking.submit('former au SST', 'text')
        list.value = [
          userTurn('u1', 'former au SST'),
          assistantTurn('a1', { kind: 'recommend', text: 'ok', recommendations: [] })
        ]
        now += 42_000
        tracking.panelClosed()
        // Une seule fin par ouverture.
        tracking.panelClosed()
      } finally {
        clock.mockRestore()
      }

      const [open, sent, end] = chatbotEvents()
      expect(open).toEqual({
        event: 'chatbot_open',
        trigger_type: 'manuel',
        conversation_id: expect.any(String)
      })
      expect(sent).toEqual({
        event: 'chatbot_message_sent',
        conversation_id: open!.conversation_id,
        message_index: 1
      })
      expect(end).toEqual({
        event: 'chatbot_conversation_end',
        conversation_id: open!.conversation_id,
        messages_count: 2,
        resolved: true,
        duration_seconds: 42
      })
      expect(chatbotEvents()).toHaveLength(3)
    })

    it('ré-émet les réponses rapides, les sélections et le passage conseiller', async () => {
      const { assistant, list } = fakeAssistant([userTurn('u1', 'sst')])
      const tracking = useAssistantTracking(assistant, ref<AssistantContext>({ source: 'home' }))

      await tracking.submit('8 salariés', 'suggestion')
      list.value = [...list.value, userTurn('u2', '8 salariés')]
      tracking.select({ slug: 'sst', rank: 'primary', action: 'formation' })
      tracking.escalate('compare')
      tracking.escalate('unavailable')
      tracking.escalate('recommend')
      // Un état inconnu : passage sans motif.
      tracking.escalate('nope')

      const id = chatbotEvents()[0]!.conversation_id
      expect(chatbotEvents()).toEqual([
        {
          event: 'chatbot_suggested_action_click',
          conversation_id: id,
          action_type: 'suggestion',
          action_label: '8 salariés'
        },
        { event: 'chatbot_message_sent', conversation_id: id, message_index: 2 },
        {
          event: 'chatbot_suggested_action_click',
          conversation_id: id,
          action_type: 'recommendation_formation',
          action_label: 'sst'
        },
        {
          event: 'chatbot_handoff_to_advisor',
          conversation_id: id,
          reason: 'compare_advisor',
          messages_count: 2
        },
        {
          event: 'chatbot_handoff_to_advisor',
          conversation_id: id,
          reason: 'error_advisor',
          messages_count: 2
        },
        {
          event: 'chatbot_handoff_to_advisor',
          conversation_id: id,
          reason: 'recommend',
          messages_count: 2
        },
        { event: 'chatbot_handoff_to_advisor', conversation_id: id, messages_count: 2 }
      ])
    })

    it("renouvelle l'identifiant de conversation à la nouvelle recherche", async () => {
      const { assistant } = fakeAssistant()
      const tracking = useAssistantTracking(assistant, ref<AssistantContext>({}))

      tracking.panelOpened('auto')
      tracking.newConversation()
      await tracking.submit('autre besoin', 'text')

      const [open, sent] = chatbotEvents()
      expect(open).toMatchObject({ event: 'chatbot_open', trigger_type: 'auto' })
      expect(sent).toMatchObject({ event: 'chatbot_message_sent', message_index: 1 })
      expect(sent!.conversation_id).not.toBe(open!.conversation_id)
    })
  })
})
