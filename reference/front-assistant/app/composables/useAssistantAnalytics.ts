import type { AssistantRecommendation } from '@learnup/types'
import type {
  AiAdvisorEscalationEvent,
  AiClarificationAnswerEvent,
  AiClarificationRequestedEvent,
  AiFallbackModeEvent,
  AiNoResultsEvent,
  AiRecommendationCompareEvent,
  AiRecommendationDisplayEvent,
  AiRecommendationSelectEvent,
  AiSearchStartEvent,
  AiSearchSubmitEvent,
  AiUnavailableEvent,
  AssistantEscalationFrom,
  AssistantSelectAction,
  AssistantSubmitVia,
  ChatbotConversationEndEvent,
  ChatbotHandoffToAdvisorEvent,
  ChatbotMessageSentEvent,
  ChatbotOpenEvent,
  ChatbotSuggestedActionClickEvent,
  TrackingEvent
} from '~/types/analytics'
import { useDataLayer } from '~/composables/useDataLayer'

// Les formes des jalons vivent dans le plan de tracking ; ré-exportées pour
// le widget et ses specs.
export type { AssistantEscalationFrom, AssistantSelectAction, AssistantSubmitVia }

/** Paramètres d'un jalon sans son nom d'événement. */
type Params<E extends TrackingEvent> = Omit<E, 'event'>

/** Idem, sans le chemin de page : le dataLayer le fournit. */
type PageParams<E extends TrackingEvent> = Omit<Params<E>, 'page_path'>

export type AssistantSelection = {
  slug: string
  rank: AssistantRecommendation['rank']
  action: AssistantSelectAction
}

export type AssistantTurnParams = Params<AiClarificationRequestedEvent>

/**
 * Attribut porté par chaque lien de sortie conseiller du panneau : l'état
 * d'où il part. `AssistantChat` le lit par délégation au clic — aucune
 * détection par `href`, aucune constante de chemin dupliquée.
 */
export const ADVISOR_ESCALATION_ATTR = 'data-advisor-escalation'

/** États du panneau d'où part une sortie conseiller. */
export const ESCALATION_ORIGINS = [
  'clarify',
  'recommend',
  'no_results',
  'out_of_catalog',
  'unavailable',
  'no_session',
  'compare',
  'degraded'
] as const satisfies readonly AssistantEscalationFrom[]

export function isEscalationFrom(value: string): value is AssistantEscalationFrom {
  return (ESCALATION_ORIGINS as readonly string[]).includes(value)
}

/** Jalons du moteur IA — contrat public, documenté dans `AGENTS.md`. */
export interface AssistantAnalytics {
  /** Le panneau s'ouvre depuis un point d'entrée. */
  searchStart(source?: AiSearchStartEvent['source']): void
  /** Un besoin est exprimé (premier message ou nouveau besoin). */
  searchSubmit(params: Params<AiSearchSubmitEvent>): void
  /** L'assistant demande une précision. */
  clarificationRequested(params: Params<AiClarificationRequestedEvent>): void
  /** Le visiteur répond à la précision demandée (chip ou saisie libre). */
  clarificationAnswer(params: Params<AiClarificationAnswerEvent>): void
  /** Des recommandations sont affichées. */
  recommendationDisplay(params: Params<AiRecommendationDisplayEvent>): void
  /** Un CTA d'une recommandation est cliqué (fiche, sessions, demande). */
  recommendationSelect(params: Params<AiRecommendationSelectEvent>): void
  /** Le tableau comparatif des recommandations est ouvert. */
  recommendationCompare(params: Params<AiRecommendationCompareEvent>): void
  /** Impasse : aucun résultat assez pertinent, ou besoin hors catalogue. */
  noResults(params: Params<AiNoResultsEvent>): void
  /** Le moteur ne répond pas (erreur API) : état indisponible affiché. */
  unavailable(params: Params<AiUnavailableEvent>): void
  /** Réponse produite par la recherche déterministe (IA indisponible). */
  fallbackMode(params: Params<AiFallbackModeEvent>): void
  /** Sortie « conseiller » cliquée depuis un état du panneau. */
  advisorEscalation(params: Params<AiAdvisorEscalationEvent>): void
  /** Module Chatbot du plan : ouverture du panneau. */
  chatbotOpen(params: PageParams<ChatbotOpenEvent>): void
  /** Module Chatbot : message envoyé (rang du message utilisateur). */
  chatbotMessageSent(params: PageParams<ChatbotMessageSentEvent>): void
  /** Module Chatbot : réponse rapide ou CTA de recommandation cliqué. */
  chatbotSuggestedActionClick(params: Params<ChatbotSuggestedActionClickEvent>): void
  /** Module Chatbot : passage au conseiller. */
  chatbotHandoffToAdvisor(params: Params<ChatbotHandoffToAdvisorEvent>): void
  /** Module Chatbot : fin de conversation (fermeture du panneau). */
  chatbotConversationEnd(params: Params<ChatbotConversationEndEvent>): void
}

/**
 * Jalons analytics du moteur IA, poussés dans le dataLayer par `useDataLayer`
 * (plan de tracking GA4 / GTM : `page_path` et `page_title` ajoutés, valeurs
 * vides et clés personnelles retirées). Deux familles : le parcours propre au
 * moteur (`ai_*` — DEV-CORE : ouverture, envoi, clarification, recommandation,
 * sélection ; DEV-EDGE : impasses, indisponibilité, mode dégradé, comparaison,
 * sortie conseiller) et le module Chatbot du plan (`chatbot_*`). Jamais le
 * contenu des messages. Un dataLayer défaillant (surchargé par un script
 * tiers) ne remonte jamais : l'analytics ne doit pas pouvoir casser la
 * conversation.
 */
export function useAssistantAnalytics(): AssistantAnalytics {
  const { pushEvent, getPageAttributes } = useDataLayer()

  function track(event: TrackingEvent): void {
    try {
      pushEvent(event)
    } catch {
      // no-op : l'analytics ne doit jamais casser l'UX.
    }
  }

  // Chemin de page exigé par certains jalons Chatbot : la même valeur que
  // l'attribut de base posé par `pushEvent`, jamais une seconde convention.
  const pagePath = () => getPageAttributes().page_path

  return {
    searchStart: (source) => track({ event: 'ai_search_start', source }),
    searchSubmit: (params) => track({ event: 'ai_search_submit', ...params }),
    clarificationRequested: (params) => track({ event: 'ai_clarification_requested', ...params }),
    clarificationAnswer: (params) => track({ event: 'ai_clarification_answer', ...params }),
    recommendationDisplay: (params) => track({ event: 'ai_recommendation_display', ...params }),
    recommendationSelect: (params) => track({ event: 'ai_recommendation_select', ...params }),
    recommendationCompare: (params) => track({ event: 'ai_recommendation_compare', ...params }),
    noResults: (params) => track({ event: 'ai_no_results', ...params }),
    unavailable: (params) => track({ event: 'ai_unavailable', ...params }),
    fallbackMode: (params) => track({ event: 'ai_fallback_mode', ...params }),
    advisorEscalation: (params) => track({ event: 'ai_advisor_escalation', ...params }),
    chatbotOpen: (params) => track({ event: 'chatbot_open', page_path: pagePath(), ...params }),
    chatbotMessageSent: (params) =>
      track({ event: 'chatbot_message_sent', page_path: pagePath(), ...params }),
    chatbotSuggestedActionClick: (params) =>
      track({ event: 'chatbot_suggested_action_click', ...params }),
    chatbotHandoffToAdvisor: (params) => track({ event: 'chatbot_handoff_to_advisor', ...params }),
    chatbotConversationEnd: (params) => track({ event: 'chatbot_conversation_end', ...params })
  }
}
