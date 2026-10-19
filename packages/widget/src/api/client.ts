/**
 * Client de l'API de recommandation (§6) : GET /v1/options et
 * POST /v1/recommendations, timeout 20 s, mapping des erreurs (§5.3).
 */
import type {
  RecoOptions,
  RecoRecommendation,
  RecommendationsRequest,
  RecommendationsResponse
} from './types'

/** Injectée au build par environnement (`VITE_RECO_API_URL`), jamais lue depuis la page. */
export const API_BASE_URL: string = import.meta.env.VITE_RECO_API_URL

const TIMEOUT_MS = 20_000
const OPTIONS_CACHE_PREFIX = 'studely.reco.options.'

/** Familles d'erreurs du §5.3 : chacune a sa clé i18n et son comportement. */
export type RecoErrorKind = 'network' | 'rate' | 'server' | 'input' | 'forbidden'

export class RecoApiError extends Error {
  constructor(
    readonly kind: RecoErrorKind,
    message: string,
    /** Champ fautif renvoyé par un 400 (`profile.fields` → retour à l'étape). */
    readonly field?: string,
    /** Délai Retry-After d'un 429, en secondes. */
    readonly retryAfter?: number
  ) {
    super(message)
    this.name = 'RecoApiError'
  }
}

/**
 * uuid v4 sans `crypto.randomUUID` (absent avant Safari 15.4, la cible est
 * iOS 15+) : repli sur getRandomValues, présent partout en contexte sécurisé.
 */
export function requestId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

async function toApiError(res: Response): Promise<RecoApiError> {
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After'))
    return new RecoApiError('rate', '429', undefined, Number.isFinite(retryAfter) ? retryAfter : 0)
  }
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { field?: string } | null
    return new RecoApiError('input', '400', body?.field)
  }
  if (res.status === 403) return new RecoApiError('forbidden', '403')
  if (res.status >= 500) return new RecoApiError('server', String(res.status))
  return new RecoApiError('input', String(res.status))
}

/** Fetch avec coupure à 20 s : réseau mort et timeout mènent tous deux à 'network'. */
async function request<T>(
  path: string,
  init: NonNullable<Parameters<typeof fetch>[1]> = {}
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal })
  } catch {
    throw new RecoApiError('network', 'API injoignable ou délai dépassé')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw await toApiError(res)
  return (await res.json()) as T
}

function sessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

/**
 * GET /v1/options, cachée en sessionStorage par couple locale+origin : un
 * second chargement dans la même session ne rappelle pas l'API.
 */
export async function fetchOptions(locale: string, origin: string): Promise<RecoOptions> {
  const storage = sessionStorage()
  const key = `${OPTIONS_CACHE_PREFIX}${locale}.${origin}`
  const cached = storage?.getItem(key)
  if (cached) {
    try {
      return JSON.parse(cached) as RecoOptions
    } catch {
      storage?.removeItem(key)
    }
  }
  const options = await request<RecoOptions>(
    `/v1/options?locale=${encodeURIComponent(locale)}&origin=${encodeURIComponent(origin)}`
  )
  try {
    storage?.setItem(key, JSON.stringify(options))
  } catch {
    // Quota ou mode privé : le cache est un bonus, pas une exigence.
  }
  return options
}

/** POST /v1/recommendations avec X-Turnstile-Token et X-Request-Id unique. */
export async function postRecommendations(
  payload: RecommendationsRequest,
  turnstileToken?: string
): Promise<RecoRecommendation[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId()
  }
  if (turnstileToken) headers['X-Turnstile-Token'] = turnstileToken
  const res = await request<RecommendationsResponse>('/v1/recommendations', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })
  return res.recommendations ?? []
}
