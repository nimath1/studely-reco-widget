import { watch, type Ref } from 'vue'
import type { AssistantContext, AssistantReply, AssistantSource } from '@learnup/types'
import type { AssistantReplyMeta, useAssistant } from '~/composables/useAssistant'
import {
  isEscalationFrom,
  useAssistantAnalytics,
  type AssistantEscalationFrom,
  type AssistantSelection,
  type AssistantSubmitVia
} from '~/composables/useAssistantAnalytics'

/** Ce que le suivi observe et déclenche sur la conversation. */
export type TrackedAssistant = Pick<
  ReturnType<typeof useAssistant>,
  | 'entries'
  | 'pending'
  | 'unavailable'
  | 'lastReply'
  | 'awaitingClarification'
  | 'send'
  | 'editAndSend'
>

/** Déclencheur de l'ouverture du panneau (module Chatbot). */
export type PanelTrigger = 'manuel' | 'auto'

// Motifs de passage au conseiller du module Chatbot : les libellés que le
// plan de tracking nomme déjà sont repris, les autres états gardent leur nom.
const HANDOFF_REASONS: Partial<Record<AssistantEscalationFrom, string>> = {
  compare: 'compare_advisor',
  unavailable: 'error_advisor'
}

function newConversationId(): string {
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Classification analytics du parcours (DEV-CORE), des états limites
 * (DEV-EDGE) et du module Chatbot du plan de tracking, séparée du widget :
 * le composant ne fait que relayer les actions, le composable décide du
 * jalon. Testable sans monter `AssistantChat`.
 */
export function useAssistantTracking(assistant: TrackedAssistant, context: Ref<AssistantContext>) {
  const analytics = useAssistantAnalytics()
  const userTurns = () => assistant.entries.value.filter((e) => e.role === 'user').length

  // Source de la recherche en cours, figée à son début : rouvrir le panneau
  // depuis un autre point d'entrée remplace le contexte du lanceur, pas
  // l'origine d'une recherche déjà commencée — sinon ses réponses et ses
  // sélections seraient attribuées à une seconde source.
  let activeSource: AssistantSource | undefined = context.value.source
  const source = () => activeSource

  // Module Chatbot : une conversation = un identifiant, renouvelé par
  // « Nouvelle recherche » ; sa durée court depuis l'ouverture du panneau.
  let conversationId = newConversationId()
  let openedAt: number | null = null

  /** Le panneau s'ouvre : à la main, ou de lui-même sur un message d'entrée. */
  function panelOpened(trigger: PanelTrigger): void {
    openedAt = Date.now()
    analytics.chatbotOpen({ trigger_type: trigger, conversation_id: conversationId })
  }

  /** Le panneau se ferme : fin de conversation pour le module Chatbot. */
  function panelClosed(): void {
    if (openedAt === null) return
    const entries = assistant.entries.value
    analytics.chatbotConversationEnd({
      conversation_id: conversationId,
      messages_count: entries.length,
      resolved: entries.some((e) => e.reply?.kind === 'recommend'),
      duration_seconds: Math.round((Date.now() - openedAt) / 1000)
    })
    openedAt = null
  }

  /** « Nouvelle recherche » : la conversation suivante a son propre identifiant. */
  function newConversation(): void {
    conversationId = newConversationId()
  }

  function messageSent(turn: number): void {
    analytics.chatbotMessageSent({ conversation_id: conversationId, message_index: turn })
  }

  /**
   * Ouverture du panneau : début de recherche seulement pour une conversation
   * sans tour utilisateur, ou quand un point d'entrée transmet un nouveau
   * besoin — rouvrir une conversation en cours n'en est pas un et garde sa
   * source.
   */
  function onOpen(options: { entryMessage?: boolean } = {}): void {
    if (!options.entryMessage && userTurns() > 0) return
    activeSource = context.value.source
    analytics.searchStart(activeSource)
  }

  /**
   * Jalons côté réponse : précision demandée, recommandations affichées,
   * impasses (aucun résultat, hors catalogue) et réponses produites en mode
   * dégradé.
   */
  function onReply(reply: AssistantReply, { turn }: AssistantReplyMeta): void {
    const params = { source: source(), turn }
    if (reply.kind === 'clarify') {
      analytics.clarificationRequested(params)
    } else if (reply.kind === 'recommend') {
      analytics.recommendationDisplay({
        ...params,
        count: reply.recommendations?.length ?? 0,
        mode: reply.mode
      })
    } else {
      analytics.noResults({ ...params, kind: reply.kind, mode: reply.mode })
    }
    if (reply.mode === 'fallback') analytics.fallbackMode({ ...params, kind: reply.kind })
  }

  // Moteur indisponible (E9) après un tour : jalon d'impasse.
  watch(assistant.unavailable, (value) => {
    if (value) analytics.unavailable({ source: source(), turn: userTurns() })
  })

  /**
   * Envoi tracé. Un message du panneau pendant l'analyse est ignoré (le
   * composer est désactivé, les chips aussi) ; un message de point d'entrée
   * est toujours un nouveau besoin, même après une question de précision, et
   * rejoint la file d'envoi.
   *
   * Le jalon part quand l'envoi quitte la file et démarre réellement
   * (`onStart`) : le rang est alors celui que portera sa réponse — deux
   * messages en file ne partagent plus le même tour — et un envoi abandonné
   * (stop, nouvelle recherche) n'est jamais compté.
   */
  function submit(message: string, via: AssistantSubmitVia = 'text'): Promise<void> {
    if (!message.trim()) return Promise.resolve()
    if (assistant.pending.value && via !== 'entry') return Promise.resolve()
    return assistant.send(message, {
      onStart: () => {
        const turn = userTurns() + 1
        const params = { source: source(), turn, via }
        if (via !== 'entry' && assistant.awaitingClarification.value) {
          analytics.clarificationAnswer(params)
        } else {
          analytics.searchSubmit(params)
        }
        // Le libellé d'une réponse rapide est un texte proposé par
        // l'assistant, jamais une saisie du visiteur.
        if (via === 'suggestion') {
          analytics.chatbotSuggestedActionClick({
            conversation_id: conversationId,
            action_type: 'suggestion',
            action_label: message
          })
        }
        messageSent(turn)
      }
    })
  }

  /** Édition d'un tour : nouveau besoin au rang du message modifié. */
  function edit(id: string, message: string): Promise<void> {
    if (!message.trim()) return Promise.resolve()
    const index = assistant.entries.value
      .filter((e) => e.role === 'user')
      .findIndex((e) => e.id === id)
    // Tour introuvable : rien à modifier ni à attribuer.
    if (index < 0) return Promise.resolve()
    return assistant.editAndSend(id, message, {
      onStart: () => {
        analytics.searchSubmit({ source: source(), turn: index + 1, via: 'edit' })
        messageSent(index + 1)
      }
    })
  }

  function select(selection: AssistantSelection): void {
    analytics.recommendationSelect({ ...selection, source: source() })
    analytics.chatbotSuggestedActionClick({
      conversation_id: conversationId,
      action_type: `recommendation_${selection.action}`,
      action_label: selection.slug
    })
  }

  /** Tableau comparatif ouvert (nombre de formations comparées). */
  function compare(count: number): void {
    analytics.recommendationCompare({ source: source(), count })
  }

  /**
   * Sortie conseiller cliquée : `from` est l'état porté par le lien
   * (`data-advisor-escalation`), le mode celui de la dernière réponse.
   */
  function escalate(from: string): void {
    const origin = isEscalationFrom(from) ? from : undefined
    analytics.advisorEscalation({
      source: source(),
      from: origin,
      mode: assistant.lastReply.value?.mode
    })
    analytics.chatbotHandoffToAdvisor({
      conversation_id: conversationId,
      reason: origin && (HANDOFF_REASONS[origin] ?? origin),
      messages_count: assistant.entries.value.length
    })
  }

  return {
    panelOpened,
    panelClosed,
    newConversation,
    onOpen,
    onReply,
    submit,
    edit,
    select,
    compare,
    escalate
  }
}
