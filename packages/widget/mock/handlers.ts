/**
 * Handlers MSW de l'API de recommandation (§6) — développement local et CI
 * uniquement, jamais dans le bundle de production.
 *
 * Le scénario se choisit sans toucher au code :
 * `?recoMock=<scénario>` dans l'URL, ou `localStorage.setItem('recoMock', …)`.
 */
import { delay, http, HttpResponse } from 'msw'
import { optionsFor, recommendationsFor } from './data'
import { SUPPORTED_LOCALES, type Locale } from '../src/config'
import type { RecommendationsRequest } from '../src/api/types'

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

function localeOf(raw: unknown): Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(raw as Locale) ? (raw as Locale) : 'fr'
}

const BASE = (): string => import.meta.env.VITE_RECO_API_URL as string

export const handlers = [
  http.get(`${BASE()}/v1/options`, async ({ request }) => {
    if (currentScenario() === 'timeout') await delay(60_000)
    const locale = localeOf(new URL(request.url).searchParams.get('locale'))
    return HttpResponse.json(optionsFor(locale))
  }),

  http.post(`${BASE()}/v1/recommendations`, async ({ request }) => {
    const scenario = currentScenario()
    const body = (await request.json()) as RecommendationsRequest
    const locale = localeOf(body.locale)

    switch (scenario) {
      case 'timeout':
        await delay(60_000)
        return HttpResponse.json({ items: [] })
      case 'field-error':
        return HttpResponse.json(
          { error: 'INVALID_FIELD', field: 'profile.fields' },
          { status: 400 }
        )
      case 'forbidden':
        return HttpResponse.json({ error: 'CAPTCHA_FAILED' }, { status: 403 })
      case 'rate':
        return HttpResponse.json(
          { error: 'RATE_LIMITED' },
          {
            status: 429,
            headers: { 'Retry-After': '30' }
          }
        )
      case 'server':
        return HttpResponse.json({ error: 'INTERNAL' }, { status: 500 })
      case 'unavailable':
        return HttpResponse.json({ error: 'UNAVAILABLE' }, { status: 503 })
      case 'empty':
        return HttpResponse.json({ items: [] })
      case 'bad-url': {
        const res = recommendationsFor(locale)
        res.items[0]!.url = 'https://example.com/hors-studely'
        res.items[1]!.url = 'javascript:alert(1)'
        return HttpResponse.json(res)
      }
      case 'html-reason': {
        const res = recommendationsFor(locale)
        res.items[0]!.reason = '<img src=x onerror=alert(1)> Parcours adapté.'
        return HttpResponse.json(res)
      }
      default:
        await delay(400)
        return HttpResponse.json(recommendationsFor(locale))
    }
  })
]
