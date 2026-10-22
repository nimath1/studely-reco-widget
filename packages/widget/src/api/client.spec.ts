import {
  API_BASE_URL,
  clearChatSession,
  ensureUserId,
  loadChatSession,
  parseSse,
  postChat,
  putProfile,
  RecoApiError,
  requestHandoff,
  requestId,
  saveChatSession
} from './client'

function mockFetch(impl: (...args: unknown[]) => Promise<Partial<Response>>) {
  const spy = vi.fn(impl)
  vi.stubGlobal('fetch', spy)
  return spy
}

const SSE = (text: string, meta: object = {}) =>
  `event: delta\ndata: ${JSON.stringify({ text })}\n\nevent: final\ndata: ${JSON.stringify(meta)}\n\n`

function ok(body: string): Partial<Response> {
  return { ok: true, text: async () => body }
}

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
  localStorage.clear()
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

describe('parseSse', () => {
  it('concatène les delta et garde les métadonnées final', () => {
    const stream =
      'event: delta\ndata: {"text":"Bon"}\n\n' +
      'event: delta\ndata: {"text":"jour"}\n\n' +
      'event: final\ndata: {"session_id":"s1","out_of_scope":false,"citations":[{"title":"P","url":"https://www.studely.com/p"}]}\n\n'
    const reply = parseSse(stream)
    expect(reply.text).toBe('Bonjour')
    expect(reply.meta.session_id).toBe('s1')
    expect(reply.meta.citations).toHaveLength(1)
  })

  it('event: sources avant les delta → meta.sources ; citations final intactes', () => {
    const source = {
      label: 'S1',
      title: 'Guide visa',
      source_url: 'https://support.studely.com/hc/fr/articles/1-guide',
      updated_at: '2025-11-04'
    }
    const stream =
      `event: sources\ndata: ${JSON.stringify({ sources: [source] })}\n\n` +
      'event: delta\ndata: {"text":"Voir [S1]"}\n\n' +
      `event: final\ndata: ${JSON.stringify({ session_id: 's1', citations: [source] })}\n\n`
    const reply = parseSse(stream)
    expect(reply.text).toBe('Voir [S1]')
    expect(reply.meta.sources).toEqual([source])
    expect(reply.meta.citations).toEqual([source])
  })

  it('ignore un payload sources non-tableau', () => {
    const stream =
      'event: sources\ndata: {"sources":"nope"}\n\n' +
      'event: sources\ndata: {"sources":{"label":"S1"}}\n\n' +
      'event: final\ndata: {"session_id":"s1"}\n\n'
    const reply = parseSse(stream)
    expect(reply.meta.session_id).toBe('s1')
    expect(reply.meta.sources).toBeUndefined()
  })

  it('normalise les fins de ligne CRLF', () => {
    const stream =
      'event: delta\r\ndata: {"text":"Bon"}\r\n\r\n' +
      'event: delta\r\ndata: {"text":"jour"}\r\n\r\n' +
      'event: final\r\ndata: {"session_id":"s1"}\r\n\r\n'
    const reply = parseSse(stream)
    expect(reply.text).toBe('Bonjour')
    expect(reply.meta.session_id).toBe('s1')
  })

  it('ignore les chunks non-JSON et les événements inconnus', () => {
    const stream =
      'event: delta\ndata: {oops}\n\n' +
      'event: ping\ndata: {"x":1}\n\n' +
      'event: delta\ndata: {"text":"ok"}\n\n'
    const reply = parseSse(stream)
    expect(reply.text).toBe('ok')
    expect(reply.meta).toEqual({})
  })

  it('flux vide → réponse vide', () => {
    expect(parseSse('')).toEqual({ text: '', meta: {} })
  })
})

describe('session /chat', () => {
  it('persiste, recharge et purge par origine', () => {
    expect(loadChatSession('mexique')).toBeNull()
    saveChatSession('mexique', 's1')
    saveChatSession('bresil', 's2')
    expect(loadChatSession('mexique')).toBe('s1')
    expect(loadChatSession('bresil')).toBe('s2')
    clearChatSession('mexique')
    expect(loadChatSession('mexique')).toBeNull()
    expect(loadChatSession('bresil')).toBe('s2')
  })

  it('ignore un session_id absent', () => {
    saveChatSession('mexique', undefined)
    expect(loadChatSession('mexique')).toBeNull()
  })

  it('renvoie null si storage.getItem lève (SecurityError, mode privé)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Accès refusé', 'SecurityError')
    })
    expect(loadChatSession('mexique')).toBeNull()
    vi.restoreAllMocks()
  })
})

describe('user_id', () => {
  it('stable par origine, uuid v4, indépendant entre origines', () => {
    const a = ensureUserId('mexique')
    const b = ensureUserId('bresil')
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(b).not.toBe(a)
    expect(ensureUserId('mexique')).toBe(a)
  })

  it('storage inaccessible → uuid volatil, jamais null', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Accès refusé', 'SecurityError')
    })
    expect(ensureUserId('mexique')).toMatch(/^[0-9a-f-]{36}$/)
    vi.restoreAllMocks()
  })
})

describe('handoff', () => {
  it('PUT /users/{id} : profil JSON, X-Request-Id', async () => {
    const spy = mockFetch(async () => ok('{}'))
    await putProfile('u-1', { lastname: 'Awa', email: 'awa@exemple.com', lang: 'fr' })
    const [url, init] = spy.mock.calls[0]! as [
      string,
      { method: string; headers: Record<string, string>; body: string }
    ]
    expect(url).toBe(`${API_BASE_URL}/users/u-1`)
    expect(init.method).toBe('PUT')
    expect(init.headers['X-Request-Id']).toMatch(/^.{36}$/)
    expect(JSON.parse(init.body)).toEqual({
      lastname: 'Awa',
      email: 'awa@exemple.com',
      lang: 'fr'
    })
  })

  it('POST /conversations/{id}/handoff : pas de corps', async () => {
    const spy = mockFetch(async () => ok('{}'))
    await requestHandoff('sess-1')
    const [url, init] = spy.mock.calls[0]! as [string, { method: string; body?: string }]
    expect(url).toBe(`${API_BASE_URL}/conversations/sess-1/handoff`)
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
  })

  it('erreurs mappées : 429 → rate, réseau mort → network', async () => {
    mockFetch(async () => ({ ok: false, status: 429, headers: new Headers() }))
    await expect(requestHandoff('s')).rejects.toMatchObject({ kind: 'rate' })
    mockFetch(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(putProfile('u', {})).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('postChat', () => {
  it('POST /chat : message + session_id, X-Request-Id unique et X-Turnstile-Token', async () => {
    const spy = mockFetch(async () => ok(SSE('Salut', { session_id: 's9' })))
    const reply = await postChat('Bonjour', 's8', 'u1', 'tok')
    await postChat('Bonjour', null, 'u1')

    const [url1, init1] = spy.mock.calls[0]! as [
      string,
      { method: string; headers: Record<string, string>; body: string }
    ]
    const [, init2] = spy.mock.calls[1]! as [
      string,
      { headers: Record<string, string>; body: string }
    ]
    expect(url1).toBe(`${API_BASE_URL}/chat`)
    expect(init1.method).toBe('POST')
    expect(init1.headers['Content-Type']).toBe('application/json')
    expect(init1.headers['X-Turnstile-Token']).toBe('tok')
    expect(init1.headers['X-Request-Id']).toMatch(/^.{36}$/)
    expect(init1.headers['X-Request-Id']).not.toBe(init2.headers['X-Request-Id'])
    expect(JSON.parse(init1.body)).toEqual({
      message: 'Bonjour',
      session_id: 's8',
      user_id: 'u1'
    })
    expect(JSON.parse(init2.body)).toEqual({
      message: 'Bonjour',
      session_id: null,
      user_id: 'u1'
    })
    expect(reply).toEqual({ text: 'Salut', meta: { session_id: 's9' } })
  })

  it('omet X-Turnstile-Token sans token', async () => {
    const spy = mockFetch(async () => ok(SSE('x')))
    await postChat('m', null, 'u1')
    const [, init] = spy.mock.calls[0]! as [string, { headers: Record<string, string> }]
    expect(init.headers).not.toHaveProperty('X-Turnstile-Token')
  })

  it('mappe réseau et timeout vers network', async () => {
    mockFetch(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(postChat('m', null, 'u1')).rejects.toMatchObject({ kind: 'network' })
  })

  it('coupe la requête à 20 s (réponse SSE potentiellement longue)', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    mockFetch((...args: unknown[]) => {
      signal = (args[1] as { signal: AbortSignal }).signal
      return new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })
    const pending = postChat('m', null, 'u1')
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'network' })
    await vi.advanceTimersByTimeAsync(19_999)
    expect(signal!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await assertion
    expect(signal!.aborted).toBe(true)
    vi.useRealTimers()
  })

  it('le même délai s’applique à un corps qui piétine (res.text)', async () => {
    vi.useFakeTimers()
    // Headers arrive fast, then the SSE body stalls: the same abort signal
    // must also cover the body read.
    const text = vi.fn()
    mockFetch(async (...args: unknown[]) => {
      const init = args[1] as { signal: AbortSignal }
      text.mockImplementation(
        () =>
          new Promise<string>((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            )
          })
      )
      return { ok: true, text }
    })
    const pending = postChat('m', null, 'u1')
    await vi.advanceTimersByTimeAsync(0) // flush fetch resolution + res.text()
    expect(text).toHaveBeenCalledOnce()
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
    await expect(postChat('m', null, 'u1')).rejects.toMatchObject({ kind: 'rate', retryAfter: 30 })
  })

  it('422 FastAPI → input avec le dernier segment de loc', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ detail: [{ loc: ['body', 'message'], msg: 'field required' }] })
    }))
    await expect(postChat('m', null, 'u1')).rejects.toMatchObject({
      kind: 'input',
      field: 'message'
    })
  })

  it('422 sans corps lisible → input sans champ', async () => {
    mockFetch(async () => ({ ok: false, status: 422, json: async () => null }))
    await expect(postChat('m', null, 'u1')).rejects.toMatchObject({ kind: 'input' })
  })

  it('403 → forbidden (flux Turnstile) ; 503 → server', async () => {
    mockFetch(async () => ({ ok: false, status: 403 }))
    await expect(postChat('m', null, 'u1')).rejects.toMatchObject({ kind: 'forbidden' })
    mockFetch(async () => ({ ok: false, status: 503 }))
    await expect(postChat('m', null, 'u1')).rejects.toMatchObject({ kind: 'server' })
  })

  it('l’erreur porte son nom', () => {
    expect(new RecoApiError('server', 'x').name).toBe('RecoApiError')
  })
})
