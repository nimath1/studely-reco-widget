/**
 * Client de l'API chatbot (contrat réel « AI Mobility Coach ») : POST /chat
 * en SSE — chunks `event: delta` (texte) puis `event: final` (métadonnées
 * dont `session_id` et `citations`). Le corps est lu d'un coup (`text()`) :
 * l'UI n'affiche que l'état loading pendant la réponse, pas de rendu
 * progressif.
 */
import type { ChatDelta, ChatFinal, ChatReply } from './types'

/** Injectée au build par environnement (`VITE_RECO_API_URL`), jamais lue depuis la page. */
export const API_BASE_URL: string = import.meta.env.VITE_RECO_API_URL

// Global /chat call timeout (spec §7.4: 20 s), headers and body included.
const TIMEOUT_MS = 20_000
const SESSION_KEY_PREFIX = 'studely.reco.session.'

/** Familles d'erreurs du §5.3 : chacune a sa clé i18n et son comportement. */
export type RecoErrorKind = 'network' | 'rate' | 'server' | 'input' | 'forbidden'

export class RecoApiError extends Error {
  constructor(
    readonly kind: RecoErrorKind,
    message: string,
    /** Champ fautif renvoyé par un 4xx (`loc` FastAPI → retour à l'étape). */
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
  if (res.status === 400 || res.status === 422) {
    // FastAPI renvoie `detail: [{loc, msg, type}]` — le champ fautif est le
    // dernier segment du chemin (ex. « body » → « message »).
    const body = (await res.json().catch(() => null)) as {
      detail?: { loc?: (string | number)[] }[] | string
    } | null
    const first = Array.isArray(body?.detail) ? body?.detail[0] : undefined
    // Dernier segment texte de `loc` (`findLast` exigerait iOS 15.4+).
    const field = first?.loc?.reduce<string | undefined>(
      (found, p) => (typeof p === 'string' ? p : found),
      undefined
    )
    return new RecoApiError('input', String(res.status), field)
  }
  if (res.status === 403) return new RecoApiError('forbidden', '403')
  if (res.status >= 500) return new RecoApiError('server', String(res.status))
  return new RecoApiError('input', String(res.status))
}

/** Parses an SSE stream read in one shot: concatenates `delta`, keeps
    `final`. CRLF normalized to LF: some proxies/servers emit `\r\n`. */
export function parseSse(stream: string): ChatReply {
  let text = ''
  let meta: ChatFinal = {}
  for (const block of stream.replaceAll('\r\n', '\n').split('\n\n')) {
    let event = ''
    let data = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (!data) continue
    try {
      const parsed = JSON.parse(data) as ChatDelta & ChatFinal
      if (event === 'delta') text += parsed.text ?? ''
      else if (event === 'final') meta = parsed
    } catch {
      // Chunk non-JSON ignoré : le flux reste utilisable.
    }
  }
  return { text, meta }
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

/** `session_id` /chat persisté par origine : les envois suivants continuent la conversation. */
export function loadChatSession(origin: string): string | null {
  try {
    // getItem itself can throw (SecurityError, strict private mode).
    return storage()?.getItem(`${SESSION_KEY_PREFIX}${origin}`) ?? null
  } catch {
    return null
  }
}

export function saveChatSession(origin: string, sessionId: string | undefined): void {
  if (!sessionId) return
  try {
    storage()?.setItem(`${SESSION_KEY_PREFIX}${origin}`, sessionId)
  } catch {
    // Quota ou mode privé : la session repartira anonyme.
  }
}

export function clearChatSession(origin: string): void {
  try {
    storage()?.removeItem(`${SESSION_KEY_PREFIX}${origin}`)
  } catch {
    // Sans importance : la clé expirera avec la session navigateur.
  }
}

/**
 * POST /chat : message + session courante ; renvoie le texte reconstitué
 * et les métadonnées `final`. Réseau mort et timeout mènent à 'network' ;
 * un 429 garde son Retry-After ; 400/422 → 'input' avec le champ fautif.
 */
export async function postChat(
  message: string,
  sessionId: string | null,
  turnstileToken?: string
): Promise<ChatReply> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId()
  }
  if (turnstileToken) headers['X-Turnstile-Token'] = turnstileToken
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, session_id: sessionId }),
      signal: controller.signal
    })
    if (!res.ok) throw await toApiError(res)
    // Le délai couvre en-têtes ET corps : une réponse SSE qui piétine
    // doit être coupée comme une réponse qui n'arrive jamais.
    return parseSse(await res.text())
  } catch (error) {
    if (error instanceof RecoApiError) throw error
    throw new RecoApiError('network', 'API injoignable ou délai dépassé')
  } finally {
    clearTimeout(timer)
  }
}
