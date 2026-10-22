import { emitRecoEvent, RECO_EVENT, trackReco } from './events'

afterEach(() => {
  delete window.dataLayer
  delete window.Cookiebot
  document.body.replaceChildren()
})

describe('emitRecoEvent', () => {
  it('émet un CustomEvent studely:reco qui bouillonne depuis le conteneur', () => {
    document.body.innerHTML = '<main><section data-reco-widget></section></main>'
    const el = document.querySelector<HTMLElement>('[data-reco-widget]')!
    const seen: { target: EventTarget | null; detail: unknown }[] = []
    document.querySelector('main')!.addEventListener(RECO_EVENT, (event) => {
      seen.push({ target: event.target, detail: (event as CustomEvent).detail })
    })

    emitRecoEvent(el, 'next', { from: 'step-1', to: 'step-2' })

    expect(seen).toHaveLength(1)
    expect(seen[0]!.target).toBe(el)
    expect(seen[0]!.detail).toEqual({ name: 'next', from: 'step-1', to: 'step-2' })
  })
})

describe('trackReco', () => {
  const ctx = { locale: 'fr', origin: 'mexique', version: '0.0.1' }

  it('relays transitions to dataLayer with common params when the CMP consents', () => {
    window.Cookiebot = { consent: { statistics: true } }
    const el = document.createElement('section')
    trackReco(el, ctx, new AbortController().signal, {
      getDurationMs: () => 1234,
      getResultCount: () => 3
    })

    emitRecoEvent(el, 'reply', { from: 'chat', to: 'chat' })

    expect(window.dataLayer).toEqual([
      {
        event: 'reco_reply',
        reco_locale: 'fr',
        reco_origin: 'mexique',
        reco_version: '0.0.1',
        from_state: 'chat',
        to_state: 'chat',
        duration_ms: 1234,
        result_count: 3
      }
    ])
  })

  it('times only terminal states: no duration_ms/result_count elsewhere', () => {
    const el = document.createElement('section')
    trackReco(el, ctx, new AbortController().signal, {
      getDurationMs: () => 999,
      getResultCount: () => 7
    })

    emitRecoEvent(el, 'next', { from: 'step-1', to: 'step-2' })

    const pushed = window.dataLayer![0]!
    expect(pushed.event).toBe('reco_next')
    expect(pushed).not.toHaveProperty('duration_ms')
    expect(pushed).not.toHaveProperty('result_count')
  })

  it('statistics consent refused: pushes nothing and creates no dataLayer', () => {
    window.Cookiebot = { consent: { statistics: false } }
    const el = document.createElement('section')
    trackReco(el, ctx, new AbortController().signal)

    emitRecoEvent(el, 'reply', { from: 'chat', to: 'chat' })

    expect(window.dataLayer).toBeUndefined()
  })

  it('no CMP detected: non-blocking, pushes normally', () => {
    const el = document.createElement('section')
    trackReco(el, ctx, new AbortController().signal)
    emitRecoEvent(el, 'consent', { from: 'consent', to: 'chat' })
    expect(window.dataLayer).toHaveLength(1)
  })

  it('abort removes the listener', () => {
    const el = document.createElement('section')
    const controller = new AbortController()
    trackReco(el, ctx, controller.signal)
    controller.abort()

    emitRecoEvent(el, 'next', { from: 'step-1', to: 'step-2' })

    expect(window.dataLayer).toBeUndefined()
  })

  it('never copies entered values from the event detail to dataLayer', () => {
    const el = document.createElement('section')
    trackReco(el, ctx, new AbortController().signal)

    emitRecoEvent(el, 'submit', {
      from: 'step-5',
      to: 'loading',
      goal: 'joindre jean@mail.fr',
      budget: 'lt5k',
      answers: { fields: ['info'] }
    })

    const pushed = window.dataLayer![0]!
    expect(Object.keys(pushed).sort()).toEqual([
      'event',
      'from_state',
      'reco_locale',
      'reco_origin',
      'reco_version',
      'to_state'
    ])
    expect(JSON.stringify(pushed)).not.toContain('jean@mail.fr')
    expect(JSON.stringify(pushed)).not.toContain('lt5k')
    expect(JSON.stringify(pushed)).not.toContain('info')
  })
})
