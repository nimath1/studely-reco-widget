import type { TrackingEvent } from '~/types/analytics'

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
  }
}

/**
 * Liste noire des clés contenant potentiellement des données personnelles (PII).
 * Aucune PII ne doit transiter dans le dataLayer selon la convention RGPD / GA4.
 */
const PII_FORBIDDEN_KEYS = new Set([
  'email',
  'mail',
  'telephone',
  'phone',
  'tel',
  'nom',
  'prenom',
  'name_personal',
  'first_name',
  'last_name',
  'firstname',
  'lastname',
  'password',
  'token',
  'bearer',
  'siret',
  'address_personal'
])

/**
 * Nettoie récursivement un objet pour :
 * 1. Supprimer les clés ayant une valeur `undefined`, `null` ou chaîne vide `""`.
 * 2. Éliminer toute clé contenant des données personnelles (PII).
 */
export function cleanEventPayload<T extends Record<string, unknown>>(
  payload: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(payload)) {
    // Exclusion stricte PII
    if (PII_FORBIDDEN_KEYS.has(key.toLowerCase())) {
      continue
    }

    // Exclusion des valeurs vides ou indéfinies
    if (value === undefined || value === null || value === '') {
      continue
    }

    // Récursion si objet imbriqué (hors tableau ou primitives)
    if (typeof value === 'object' && !Array.isArray(value)) {
      const cleanedNested = cleanEventPayload(value as Record<string, unknown>)
      if (Object.keys(cleanedNested).length > 0) {
        result[key] = cleanedNested
      }
      continue
    }

    result[key] = value
  }

  return result
}

/**
 * Composable DataLayer pour GA4 / GTM
 */
export function useDataLayer() {
  function getPageAttributes(): { page_path: string; page_title: string } {
    let page_path = ''
    try {
      const route = useRoute()
      page_path = route?.fullPath || route?.path || ''
    } catch {
      // Hors contexte Vue Router
    }

    if (!page_path && typeof window !== 'undefined') {
      page_path = window.location.pathname
    }

    let page_title = ''
    if (typeof document !== 'undefined') {
      page_title = document.title
    }
    return { page_path, page_title }
  }

  /**
   * Pousse un événement typé dans window.dataLayer en respectant les conventions du plan.
   */
  function pushEvent<E extends TrackingEvent>(eventData: E): void {
    if (typeof window === 'undefined') return

    // Initialisation conforme : window.dataLayer = window.dataLayer || [];
    window.dataLayer = window.dataLayer || []

    const { page_path, page_title } = getPageAttributes()

    // Base minimale exigée par le plan : event, page_path, page_title
    const basePayload: Record<string, unknown> = {
      page_path,
      page_title,
      ...eventData
    }

    const cleanedPayload = cleanEventPayload(basePayload)

    // Garantie que l'événement a bien son nom
    if (cleanedPayload.event) {
      window.dataLayer.push(cleanedPayload)
    }
  }

  return {
    pushEvent,
    cleanEventPayload,
    getPageAttributes
  }
}
