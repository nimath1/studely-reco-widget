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
