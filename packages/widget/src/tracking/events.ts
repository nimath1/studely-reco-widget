/**
 * Plan de tracking (§9.2) : événements reco_* poussés dans dataLayer avec
 * le consentement « mesure d'audience », et CustomEvent studely:reco (§7.6).
 */

export const RECO_EVENT = 'studely:reco'

export interface RecoEventDetail {
  /** Nom du jalon : action utilisateur (start, next…) ou état atteint. */
  name: string
  [key: string]: unknown
}

/**
 * Événement DOM unique du widget, émis sur le conteneur en bouillonnement :
 * la page (ou le dataLayer, §9.2) s'y abonne sans connaître l'interne.
 */
export function emitRecoEvent(
  el: HTMLElement,
  name: string,
  detail: Record<string, unknown> = {}
): void {
  el.dispatchEvent(
    new CustomEvent<RecoEventDetail>(RECO_EVENT, {
      bubbles: true,
      detail: { name, ...detail }
    })
  )
}

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
    Cookiebot?: { consent?: { statistics?: boolean } }
  }
}

/**
 * Consentement « mesure d'audience » de la CMP (§9.2). CMP reconnue :
 * Cookiebot (`statistics`). Aucune CMP détectée → non bloquant : la CMP du
 * site tranchera en production, et le mock/dev restent testables.
 */
export function hasAnalyticsConsent(): boolean {
  const cookiebot = window.Cookiebot
  if (cookiebot?.consent) return cookiebot.consent.statistics === true
  return true
}

export interface TrackContext {
  locale: string
  origin: string
  version: string
}

export interface TrackHooks {
  /** Durée mesurée entre l'envoi du profil et l'état terminal affiché. */
  getDurationMs?: () => number | undefined
  /** Nombre de cartes affichées, pour le jalon reco_results. */
  getResultCount?: () => number | undefined
}

const TIMED_STATES = new Set(['results', 'empty', 'error'])

/**
 * Relaie les transitions `studely:reco` vers window.dataLayer avec les
 * paramètres communs (§9.2). Jamais de valeur saisie : ni domaines, ni
 * budget, ni texte libre — uniquement états et mesures.
 */
export function trackReco(
  el: HTMLElement,
  ctx: TrackContext,
  signal: AbortSignal,
  hooks: TrackHooks = {}
): void {
  el.addEventListener(
    RECO_EVENT,
    (event) => {
      if (!hasAnalyticsConsent()) return
      const detail = (event as CustomEvent<RecoEventDetail>).detail
      const params: Record<string, unknown> = {
        event: `reco_${detail.name}`,
        reco_locale: ctx.locale,
        reco_origin: ctx.origin,
        reco_version: ctx.version
      }
      if (typeof detail.from === 'string') params.from_state = detail.from
      if (typeof detail.to === 'string') params.to_state = detail.to
      if (TIMED_STATES.has(detail.name)) {
        const duration = hooks.getDurationMs?.()
        if (duration !== undefined) params.duration_ms = duration
      }
      if (detail.name === 'results') {
        const count = hooks.getResultCount?.()
        if (count !== undefined) params.result_count = count
      }
      const dataLayer = (window.dataLayer ??= [])
      dataLayer.push(params)
    },
    { signal }
  )
}
