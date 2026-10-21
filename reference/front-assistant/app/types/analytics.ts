/**
 * Types pour le plan de tracking DataLayer (GA4 / GTM)
 * Conforme au plan de tracking LearnUp Academy :
 * - 1_Conventions_Attributs
 * - 2_Evenements_Cartographie
 * - 3_Formulaires
 * - 4_Parcours_Conversion
 * - 5_Pages_Interactions
 * Le module Chatbot est complété par les jalons du moteur IA (`ai_*`,
 * épopée MOTEUR-IA — section 3b).
 */
import type { AssistantMode, AssistantReplyKind, AssistantSource } from '@learnup/types'

export interface BasePageAttributes {
  page_path: string
  page_title: string
}

// ── 1. Événements Réseau & Partenaires ──────────────────────────────────────

export interface ViewRejoindreReseauEvent extends BasePageAttributes {
  event: 'view_rejoindre_reseau_page'
}

export type NetworkProfileType = 'franchise' | 'organisme' | 'formateur'

export interface SelectNetworkProfileEvent {
  event: 'select_network_profile'
  profile_type: NetworkProfileType
  cta_location: string
  page_path: string
}

export interface SubmitNetworkInterestEvent {
  event: 'submit_network_interest'
  profile_type: NetworkProfileType
  form_id: string
  region?: string
}

// ── 2. Événements Formations ────────────────────────────────────────────────

export interface ViewFormationsCatalogEvent extends BasePageAttributes {
  event: 'view_formations_catalog'
  results_count: number
  filters_active_count: number
}

export interface SearchFormationsEvent {
  event: 'search_formations'
  search_term: string
  results_count: number
  page_path: string
}

export interface FilterFormationsEvent {
  event: 'filter_formations'
  filter_type: string
  filter_value: string
  filter_action: 'ajout' | 'retrait'
  results_count: number
}

export interface SortFormationsEvent {
  event: 'sort_formations'
  sort_type: string
  results_count: number
}

export interface SelectFormationCardEvent {
  event: 'select_formation_card'
  formation_id: string
  formation_name: string
  formation_family: string
  list_name: string
  position?: number
}

export interface SelectFormationCentreEvent {
  event: 'select_formation_centre'
  center_id: string
  center_name: string
  center_city?: string
  formation_id: string
  formation_name: string
  formation_family: string
  list_name: string
  position?: number
}

export interface ViewFormationDetailEvent extends BasePageAttributes {
  event: 'view_formation_detail'
  formation_id: string
  formation_name: string
  formation_family: string
  formation_duration?: string
  formation_modality?: string
  formation_certification?: string
  formation_provider?: string
}

export interface ClickCtaConfierFormationEvent {
  event: 'click_cta_confier_formation'
  formation_id?: string
  cta_location: string
  cta_label: string
  page_path: string
}

export interface ClickDownloadProgramEvent {
  event: 'click_download_program'
  formation_id: string
  formation_name: string
  formation_family: string
}

// ── 3. Événements Chatbot ───────────────────────────────────────────────────

export interface ChatbotOpenEvent {
  event: 'chatbot_open'
  page_path: string
  trigger_type: 'manuel' | 'auto'
  conversation_id?: string
}

export interface ChatbotMessageSentEvent {
  event: 'chatbot_message_sent'
  conversation_id: string
  message_index: number
  page_path: string
}

export interface ChatbotSuggestedActionClickEvent {
  event: 'chatbot_suggested_action_click'
  conversation_id: string
  action_type: string
  action_label: string
}

export interface ChatbotHandoffToAdvisorEvent {
  event: 'chatbot_handoff_to_advisor'
  conversation_id: string
  reason?: string
  messages_count: number
}

export interface ChatbotConversationEndEvent {
  event: 'chatbot_conversation_end'
  conversation_id: string
  messages_count: number
  resolved: boolean
  duration_seconds: number
}

// ── 3b. Moteur IA (recherche assistée) ───────────────────────────────────────
// Parcours propre au moteur, en plus du module Chatbot : jamais le texte
// saisi — uniquement le point d'entrée, le rang du tour, le type de réponse,
// le slug de la formation.

/**
 * Comment un message utilisateur est parti : réponse rapide (chip), saisie
 * libre, message transmis par le point d'entrée (champ Home, catalogue) ou
 * modification d'un message précédent.
 */
export type AssistantSubmitVia = 'suggestion' | 'text' | 'entry' | 'edit'

/** CTA cliqué sur une recommandation. */
export type AssistantSelectAction = 'formation' | 'sessions' | 'demande'

/** État du panneau d'où part une sortie conseiller. */
export type AssistantEscalationFrom =
  AssistantReplyKind | 'unavailable' | 'no_session' | 'compare' | 'degraded'

export interface AiSearchStartEvent {
  event: 'ai_search_start'
  source?: AssistantSource
}

export interface AiSearchSubmitEvent {
  event: 'ai_search_submit'
  source?: AssistantSource
  turn: number
  via: AssistantSubmitVia
}

export interface AiClarificationRequestedEvent {
  event: 'ai_clarification_requested'
  source?: AssistantSource
  turn: number
}

export interface AiClarificationAnswerEvent {
  event: 'ai_clarification_answer'
  source?: AssistantSource
  turn: number
  via: AssistantSubmitVia
}

export interface AiRecommendationDisplayEvent {
  event: 'ai_recommendation_display'
  source?: AssistantSource
  turn: number
  count: number
  mode?: AssistantMode
}

export interface AiRecommendationSelectEvent {
  event: 'ai_recommendation_select'
  source?: AssistantSource
  slug: string
  rank: 'primary' | 'alternative'
  action: AssistantSelectAction
}

export interface AiRecommendationCompareEvent {
  event: 'ai_recommendation_compare'
  source?: AssistantSource
  count: number
}

export interface AiNoResultsEvent {
  event: 'ai_no_results'
  source?: AssistantSource
  turn: number
  kind: 'no_results' | 'out_of_catalog'
  mode?: AssistantMode
}

export interface AiUnavailableEvent {
  event: 'ai_unavailable'
  source?: AssistantSource
  turn: number
}

export interface AiFallbackModeEvent {
  event: 'ai_fallback_mode'
  source?: AssistantSource
  turn: number
  kind: AssistantReplyKind
}

export interface AiAdvisorEscalationEvent {
  event: 'ai_advisor_escalation'
  source?: AssistantSource
  from?: AssistantEscalationFrom
  mode?: AssistantMode
}

// ── 4. Événements Centres ───────────────────────────────────────────────────

export interface ViewCentresListEvent {
  event: 'view_centres_list'
  page_path: string
}

export interface FilterCentresDepartmentEvent {
  event: 'filter_centres_department'
  department_code: string
  department_name: string
  results_count: number
}

export interface SearchCentresEvent {
  event: 'search_centres'
  search_term: string
  results_count: number
}

export interface SelectCentreCardEvent {
  event: 'select_centre_card'
  center_id: string
  center_name: string
  center_city?: string
  center_department?: string
  list_name: string
  position?: number
}

export interface ViewCentreDetailEvent {
  event: 'view_centre_detail'
  center_id: string
  center_name: string
  center_city?: string
  center_department?: string
  center_specialties?: string | string[]
  page_path: string
}

export interface ToggleMapViewEvent {
  event: 'toggle_map_view'
  view_type: 'liste' | 'carte'
}

export interface ClickCtaDemandeFormationFromCentreEvent {
  event: 'click_cta_demande_formation_from_centre'
  center_id: string
  cta_location: string
  page_path: string
}

export interface ClickDownloadQualiopiEvent {
  event: 'click_download_qualiopi'
  center_id: string
  center_name: string
}

// ── 5. Événements Actualités ────────────────────────────────────────────────

export interface ViewBlogListEvent {
  event: 'view_blog_list'
  page_path: string
  articles_count: number
}

export interface FilterBlogCategoryEvent {
  event: 'filter_blog_category'
  category_name: string
  results_count: number
}

export interface SelectArticleCardEvent {
  event: 'select_article_card'
  article_id: string
  article_title: string
  article_category?: string
  list_name: string
  position?: number
}

export interface ViewArticleDetailEvent {
  event: 'view_article_detail'
  article_id: string
  article_title: string
  article_category?: string
  publish_date?: string
  page_path: string
}

export interface ShareArticleEvent {
  event: 'share_article'
  article_id: string
  share_channel: string
}

// ── 6. Événements Formulaires ───────────────────────────────────────────────

export type FormId =
  'demande_formation' | 'demande_franchise' | 'demande_organisme' | 'demande_formateur'

export interface FormViewEvent {
  event: 'form_view'
  form_id: FormId
  form_name: string
  form_step: number | string
  form_step_name?: string
  page_path: string
}

export interface FormStartEvent {
  event: 'form_start'
  form_id: FormId
  form_name: string
  form_step: number | string
  field_name: string
}

export interface FormErrorEvent {
  event: 'form_error'
  form_id: FormId
  form_name: string
  form_step: number | string
  field_name: string
  error_type: string
  error_message: string
}

export interface FormAbandonEvent {
  event: 'form_abandon'
  form_id: FormId
  form_name: string
  form_step_reached: number | string
  last_field_filled?: string
  fields_completed_count: number
  fields_total_count: number
  time_spent_seconds: number
}

export interface FormSubmitEvent {
  event: 'form_submit'
  form_id: FormId
  form_name: string
  form_type?: string
  steps_count?: number
  completion_time_seconds?: number
}

// ── 7. Page View Global ─────────────────────────────────────────────────────

export interface PageViewEvent extends BasePageAttributes {
  event: 'page_view'
}

// ── Union de tous les événements ────────────────────────────────────────────

export type TrackingEvent =
  | PageViewEvent
  | ViewRejoindreReseauEvent
  | SelectNetworkProfileEvent
  | SubmitNetworkInterestEvent
  | ViewFormationsCatalogEvent
  | SearchFormationsEvent
  | FilterFormationsEvent
  | SortFormationsEvent
  | SelectFormationCardEvent
  | SelectFormationCentreEvent
  | ViewFormationDetailEvent
  | ClickCtaConfierFormationEvent
  | ClickDownloadProgramEvent
  | ChatbotOpenEvent
  | ChatbotMessageSentEvent
  | ChatbotSuggestedActionClickEvent
  | ChatbotHandoffToAdvisorEvent
  | ChatbotConversationEndEvent
  | AiSearchStartEvent
  | AiSearchSubmitEvent
  | AiClarificationRequestedEvent
  | AiClarificationAnswerEvent
  | AiRecommendationDisplayEvent
  | AiRecommendationSelectEvent
  | AiRecommendationCompareEvent
  | AiNoResultsEvent
  | AiUnavailableEvent
  | AiFallbackModeEvent
  | AiAdvisorEscalationEvent
  | ViewCentresListEvent
  | FilterCentresDepartmentEvent
  | SearchCentresEvent
  | SelectCentreCardEvent
  | ViewCentreDetailEvent
  | ToggleMapViewEvent
  | ClickCtaDemandeFormationFromCentreEvent
  | ClickDownloadQualiopiEvent
  | ViewBlogListEvent
  | FilterBlogCategoryEvent
  | SelectArticleCardEvent
  | ViewArticleDetailEvent
  | ShareArticleEvent
  | FormViewEvent
  | FormStartEvent
  | FormErrorEvent
  | FormAbandonEvent
  | FormSubmitEvent
