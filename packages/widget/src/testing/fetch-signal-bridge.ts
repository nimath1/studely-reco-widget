/**
 * Pont de test jsdom ↔ fetch Node : sous Vitest + jsdom, `AbortController`
 * est celui de jsdom alors que `fetch` est celui de Node (undici), qui
 * rejette ce signal (« Expected signal to be an instance of AbortSignal »)
 * — toute requête finit en erreur réseau. Ce pont retire le signal avant
 * l'appel natif et reproduit l'annulation (rejet AbortError). Tests
 * uniquement : dans un navigateur, fetch et AbortController sont alignés.
 */
import { vi } from 'vitest'

export function bridgeFetchSignal(): void {
  const nativeFetch = globalThis.fetch
  vi.stubGlobal('fetch', (...[input, init]: Parameters<typeof fetch>) => {
    const signal = init?.signal
    if (!signal) return nativeFetch(input, init)
    const abortError = () => new DOMException('Aborted', 'AbortError')
    if (signal.aborted) return Promise.reject(abortError())
    return new Promise<Response>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(abortError()), { once: true })
      nativeFetch(input, { ...init, signal: undefined }).then(resolve, reject)
    })
  })
}
