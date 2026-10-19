import { fetchOptions, postRecommendations, RecoApiError, requestId, API_BASE_URL } from './client'
import type { RecommendationsRequest } from './types'

const PAYLOAD: RecommendationsRequest = {
  locale: 'fr',
  origin: 'mexique',
  profile: {
    level: 'licence',
    fields: ['info'],
    destinations: ['france'],
    languages: [{ language: 'fr', level: 'b2' }],
    budget: 'lt10k',
    intake: 'sep'
  },
  consent: { accepted: true, version: '1' }
}

function mockFetch(impl: (...args: unknown[]) => Promise<Partial<Response>>) {
  const spy = vi.fn(impl)
  vi.stubGlobal('fetch', spy)
  return spy
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('requestId', () => {
  it('produit des uuid v4 uniques', () => {
    const ids = new Set(Array.from({ length: 50 }, requestId))
    expect(ids.size).toBe(50)
    expect(requestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })
})

describe('fetchOptions', () => {
  it('appelle /v1/options avec locale et origin', async () => {
    const spy = mockFetch(async () => ({
      ok: true,
      json: async () => ({ levels: [] })
    }))
    const res = await fetchOptions('fr', 'mexique')
    expect(res).toEqual({ levels: [] })
    expect(spy.mock.calls[0]![0]).toBe(`${API_BASE_URL}/v1/options?locale=fr&origin=mexique`)
  })

  it('sert le cache sessionStorage au second appel', async () => {
    const spy = mockFetch(async () => ({ ok: true, json: async () => ({ levels: [1] }) }))
    await fetchOptions('fr', 'mexique')
    const again = await fetchOptions('fr', 'mexique')
    expect(again).toEqual({ levels: [1] })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('ignore un cache corrompu et rappelle l’API', async () => {
    sessionStorage.setItem('studely.reco.options.fr.mexique', '{oops')
    const spy = mockFetch(async () => ({ ok: true, json: async () => ({ ok: 1 }) }))
    await fetchOptions('fr', 'mexique')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('mappe un 503 en erreur server', async () => {
    mockFetch(async () => ({ ok: false, status: 503 }))
    await expect(fetchOptions('fr', 'mexique')).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('postRecommendations', () => {
  it('envoie JSON, X-Request-Id unique et X-Turnstile-Token', async () => {
    const spy = mockFetch(async () => ({
      ok: true,
      json: async () => ({ recommendations: [{ title: 'A' }] })
    }))
    await postRecommendations(PAYLOAD, 'tok')
    await postRecommendations(PAYLOAD, 'tok')

    const [, init1] = spy.mock.calls[0]! as [
      string,
      { method: string; headers: Record<string, string>; body: string }
    ]
    const [, init2] = spy.mock.calls[1]! as [string, { headers: Record<string, string> }]
    expect(init1.method).toBe('POST')
    expect(init1.headers['Content-Type']).toBe(JSON_HEADERS['Content-Type'])
    expect(init1.headers['X-Turnstile-Token']).toBe('tok')
    expect(init1.headers['X-Request-Id']).toMatch(/^.{36}$/)
    expect(init1.headers['X-Request-Id']).not.toBe(init2.headers['X-Request-Id'])
    expect(JSON.parse(init1.body)).toEqual(PAYLOAD)
  })

  it('omet X-Turnstile-Token sans token', async () => {
    const spy = mockFetch(async () => ({ ok: true, json: async () => ({}) }))
    await postRecommendations(PAYLOAD)
    const [, init] = spy.mock.calls[0]! as [string, { headers: Record<string, string> }]
    expect(init.headers).not.toHaveProperty('X-Turnstile-Token')
  })

  it('retourne [] sans champ recommendations', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({}) }))
    expect(await postRecommendations(PAYLOAD)).toEqual([])
  })

  it('mappe réseau et timeout vers network', async () => {
    mockFetch(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(postRecommendations(PAYLOAD)).rejects.toMatchObject({ kind: 'network' })
  })

  it('coupe la requête à 20 s', async () => {
    vi.useFakeTimers()
    mockFetch((...args: unknown[]) => {
      const init = args[1] as { signal: AbortSignal }
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        )
      })
    })
    const pending = postRecommendations(PAYLOAD)
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'network' })
    await vi.advanceTimersByTimeAsync(20_000)
    await assertion
    vi.useRealTimers()
  })

  it('429 → rate avec Retry-After', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '30' })
    }))
    await expect(postRecommendations(PAYLOAD)).rejects.toMatchObject({
      kind: 'rate',
      retryAfter: 30
    })
  })

  it('400 → input avec le champ fautif du corps', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ field: 'profile.fields' })
    }))
    await expect(postRecommendations(PAYLOAD)).rejects.toMatchObject({
      kind: 'input',
      field: 'profile.fields'
    })
  })

  it('400 sans corps lisible → input sans champ', async () => {
    mockFetch(async () => ({ ok: false, status: 400, json: async () => null }))
    await expect(postRecommendations(PAYLOAD)).rejects.toMatchObject({ kind: 'input' })
  })

  it('403 → forbidden (flux Turnstile)', async () => {
    mockFetch(async () => ({ ok: false, status: 403 }))
    await expect(postRecommendations(PAYLOAD)).rejects.toMatchObject({ kind: 'forbidden' })
  })

  it('l’erreur porte son nom', () => {
    expect(new RecoApiError('server', 'x').name).toBe('RecoApiError')
  })
})
