/**
 * Tracking plan (§9.2): `reco_*` events pushed to the dataLayer with the
 * "audience measurement" consent, plus the `studely:reco` CustomEvent (§7.6).
 */

export const RECO_EVENT = 'studely:reco'

export interface RecoEventDetail {
  /** Milestone name: user action (start, next…) or reached state. */
  name: string
  [key: string]: unknown
}

/**
 * The widget's single DOM event, emitted bubbling from the container: the
 * host page (or the dataLayer, §9.2) subscribes without knowing internals.
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
 * CMP "audience measurement" consent (§9.2). Recognized CMP: Cookiebot
 * (`statistics`). No CMP detected -> non-blocking: the site's CMP will
 * decide in production, and mock/dev stay testable.
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
  /** Duration measured between message send and rendered reply. */
  getDurationMs?: () => number | undefined
  /** Number of links/pieces displayed, for the reco_reply milestone. */
  getResultCount?: () => number | undefined
}

const TIMED_STATES = new Set(['reply', 'empty', 'error'])

/**
 * Relays `studely:reco` transitions to window.dataLayer with the common
 * parameters (§9.2). Never an entered value: no domains, budget, or free
 * text — states and measurements only.
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
      if (detail.name === 'reply') {
        const count = hooks.getResultCount?.()
        if (count !== undefined) params.result_count = count
      }
      const dataLayer = (window.dataLayer ??= [])
      dataLayer.push(params)
    },
    { signal }
  )
}
