/**
 * Handlers MSW du chatbot réel (POST /chat en SSE) — développement local
 * et CI uniquement, jamais dans le bundle de production.
 *
 * Le scénario se choisit sans toucher au code :
 * `?recoMock=<scénario>` dans l'URL, ou `localStorage.setItem('recoMock', …)`.
 */
import { delay, http, HttpResponse } from 'msw'
import { chatReplyFor } from './data'
import type { Locale } from '../src/config'
import type { ChatReply } from '../src/api/types'

export const SCENARIOS = [
  'nominal',
  'empty',
  'field-error',
  'forbidden',
  'rate',
  'server',
  'unavailable',
  'timeout',
  'bad-url',
  'html-reason'
] as const

export type Scenario = (typeof SCENARIOS)[number]

const DEFAULT_SCENARIO: Scenario = 'nominal'

export function currentScenario(): Scenario {
  const param = new URLSearchParams(location.search).get('recoMock')
  const stored = globalThis.localStorage?.getItem('recoMock')
  const value = param ?? stored ?? DEFAULT_SCENARIO
  return (SCENARIOS as readonly string[]).includes(value) ? (value as Scenario) : DEFAULT_SCENARIO
}

const BASE = (): string => import.meta.env.VITE_RECO_API_URL as string

/** Locale lue sur `<html lang>` — le chat envoie du texte libre. */
function localeOf(): Locale {
  const lang = document.documentElement.lang?.split('-')[0]
  return (['fr', 'en', 'es', 'de', 'ar'] as const).includes(lang as Locale)
    ? (lang as Locale)
    : 'fr'
}

/**
 * Flux SSE du contrat : `event: sources` (retrieval list) en premier,
 * puis les chunks `delta` et un `final` de métadonnées — `sources` n'y
 * est pas répété (événement dédié côté API réelle).
 */
function sse(reply: ChatReply): HttpResponse<string> {
  const chunks = reply.text.match(/.{1,80}/gs) ?? []
  const { sources, ...meta } = reply.meta
  const body =
    (sources?.length ? `event: sources\ndata: ${JSON.stringify({ sources })}\n\n` : '') +
    chunks.map((text) => `event: delta\ndata: ${JSON.stringify({ text })}\n\n`).join('') +
    `event: final\ndata: ${JSON.stringify(meta)}\n\n`
  return new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

export const handlers = [
  http.post(`${BASE()}/chat`, async ({ request }) => {
    const scenario = currentScenario()
    const body = (await request.json()) as { message?: string; session_id?: string | null }
    const locale = localeOf()

    switch (scenario) {
      case 'timeout':
        await delay(60_000)
        return sse({ text: '', meta: { session_id: 'mock-session-1' } })
      case 'field-error':
        // Forme FastAPI du contrat : detail[] avec loc body → champ.
        return HttpResponse.json(
          { detail: [{ loc: ['body', 'message'], msg: 'field required', type: 'value_error' }] },
          { status: 422 }
        )
      case 'forbidden':
        return HttpResponse.json({ detail: 'CAPTCHA_FAILED' }, { status: 403 })
      case 'rate':
        return HttpResponse.json(
          { detail: 'RATE_LIMITED' },
          { status: 429, headers: { 'Retry-After': '30' } }
        )
      case 'server':
        return HttpResponse.json({ detail: 'INTERNAL' }, { status: 500 })
      case 'unavailable':
        return HttpResponse.json({ detail: 'UNAVAILABLE' }, { status: 503 })
      case 'empty':
        return sse({ text: '', meta: { session_id: 'mock-session-1' } })
      case 'bad-url':
        // Toutes les citations sortent de studely.com et le texte est vide :
        // tout est écarté, le widget doit basculer en « empty ».
        return sse({
          text: '',
          meta: {
            session_id: 'mock-session-1',
            citations: [
              { title: 'Hors domaine', url: 'https://example.com/hors-studely' },
              { title: 'Script', url: 'javascript:alert(1)' }
            ]
          }
        })
      case 'html-reason':
        // HTML dans le texte : doit rester du texte brut à l'affichage.
        return sse({
          text: '<img src=x onerror=alert(1)> Voici une piste adaptée à ton profil.',
          meta: { session_id: 'mock-session-1' }
        })
      default: {
        await delay(400)
        const reply = chatReplyFor(locale)
        // La session entrante continue ; sinon le mock en ouvre une.
        reply.meta.session_id = body.session_id ?? 'mock-session-1'
        return sse(reply)
      }
    }
  })
]
