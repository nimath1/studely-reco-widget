import type { RouteLocationRaw } from 'vue-router'

/** Page conseiller — cible de toutes les sorties « être accompagné ». */
export const ADVISOR_PATH = '/parler-a-votre-conseiller'
/** Tunnel de demande de formation. */
export const DEMANDE_PATH = '/centres/demande-de-formation'

/** Clé du besoin dans `history.state` de l'entrée de navigation cible. */
export const HANDOFF_STATE_KEY = 'assistantHandoff'

/** Attribut des liens du panneau qui transmettent le besoin à leur destination. */
export const HANDOFF_LINK_ATTR = 'data-assistant-handoff'

/** Longueur maximale du besoin transmis (le fil complet reste dans le panneau). */
export const NEED_MAX_LENGTH = 500

/**
 * Besoin décrit dans la recherche assistée, transmis au tunnel de demande et
 * à la page conseiller **hors URL** (RGPD) : le texte libre du visiteur ne
 * doit apparaître ni dans `page_location` côté analytics, ni dans le
 * `Referer`, ni dans les journaux. Il voyage dans l'état d'historique de la
 * navigation (`router.push({ state })`), conservé au rechargement et au
 * retour arrière, propre à cette entrée d'historique — et par le canal
 * `useAssistantHandoffChannel` pour les pages déjà montées.
 */
export type AssistantHandoff = {
  need: string
  headcount?: number
  location?: string
}

/** Tronque sans couper une paire de substitution (emoji, symboles). */
export function truncateNeed(need: string): string {
  return Array.from(need.trim()).slice(0, NEED_MAX_LENGTH).join('')
}

/** Besoin normalisé — tronqué, champs vides retirés ; `null` sans besoin. */
export function toHandoff(
  need: string | null | undefined,
  headcount?: number | null,
  location?: string | null
): AssistantHandoff | null {
  const text = truncateNeed(need ?? '')
  if (!text) return null
  const handoff: AssistantHandoff = { need: text }
  if (headcount) handoff.headcount = headcount
  if (location) handoff.location = location
  return handoff
}

function stateOf(handoff: AssistantHandoff | null | undefined): Record<string, AssistantHandoff> {
  const value = toHandoff(handoff?.need, handoff?.headcount, handoff?.location)
  return value ? { [HANDOFF_STATE_KEY]: value } : {}
}

/** Lien vers la page conseiller, besoin transmis hors URL s'il existe. */
export function advisorLink(handoff?: AssistantHandoff | null): RouteLocationRaw {
  const state = stateOf(handoff)
  return Object.keys(state).length ? { path: ADVISOR_PATH, state } : ADVISOR_PATH
}

/** Lien vers le tunnel de demande : identifiants en query, besoin hors URL. */
export function demandeLink(
  query: Record<string, string | undefined>,
  handoff?: AssistantHandoff | null
): RouteLocationRaw {
  const cleaned = Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])
  )
  const state = stateOf(handoff)
  return {
    path: DEMANDE_PATH,
    query: cleaned,
    ...(Object.keys(state).length ? { state } : {})
  }
}

function isHandoff(value: unknown): value is AssistantHandoff {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.need === 'string' &&
    (candidate.headcount === undefined || typeof candidate.headcount === 'number') &&
    (candidate.location === undefined || typeof candidate.location === 'string')
  )
}

/**
 * Besoin transmis à l'entrée d'historique courante — client uniquement,
 * `null` côté serveur ou sans transmission.
 */
export function readHandoff(): AssistantHandoff | null {
  if (typeof window === 'undefined') return null
  const state: unknown = window.history.state
  if (typeof state !== 'object' || state === null) return null
  const value = (state as Record<string, unknown>)[HANDOFF_STATE_KEY]
  if (!isHandoff(value)) return null
  return toHandoff(value.need, value.headcount, value.location)
}

/**
 * Inscrit (ou retire) le besoin dans l'entrée d'historique **courante** — pour
 * un lien vers l'URL déjà affichée : le routeur n'y pousse aucune entrée, son
 * état ne porterait donc jamais le nouveau besoin au rechargement.
 */
export function persistHandoff(handoff: AssistantHandoff | null): void {
  if (typeof window === 'undefined') return
  const current: unknown = window.history.state
  const state: Record<string, unknown> =
    typeof current === 'object' && current !== null ? { ...current } : {}
  if (handoff) state[HANDOFF_STATE_KEY] = handoff
  else delete state[HANDOFF_STATE_KEY]
  window.history.replaceState(state, '')
}
