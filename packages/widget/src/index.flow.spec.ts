import { mountStepsWidget } from './testing/widget.fixture'
import { DRAFT_KEY } from './ui/steps'
import { RECO_EVENT } from './tracking/events'
import type { RecoOptions } from './api/types'

type IndexModule = typeof import('./index')

const OPTIONS: RecoOptions = {
  levels: [{ id: 'licence', label: 'Licence' }],
  fields: [
    { id: 'info', label: 'Informatique' },
    { id: 'droit', label: 'Droit' },
    { id: 'sante', label: 'Santé' },
    { id: 'art', label: 'Art' }
  ],
  destinations: [{ id: 'france', label: 'France' }],
  languages: [{ id: 'fr', label: 'Français' }],
  languageLevels: [{ id: 'b2', label: 'B2' }],
  budgets: [{ id: 'lt10k', label: '< 10 k€' }],
  intakes: [{ id: 'sep', label: 'Septembre' }]
}

const RECOS = [
  { type: 'programme', title: 'Licence Info', url: 'https://studely.com/p/1', tags: ['info'] },
  { type: 'programme', title: 'Licence Droit', url: 'https://www.studely.com/p/2', tags: [] }
]

async function load(): Promise<IndexModule> {
  vi.resetModules()
  return import('./index')
}

function mockFetch(handler: (url: string, init?: { headers?: Record<string, string> }) => unknown) {
  const spy = vi.fn(async (url: unknown, init?: { headers?: Record<string, string> }) => {
    const res = handler(String(url), init)
    if (res instanceof Response) return res
    const body = res as { status?: number; json?: unknown }
    return {
      ok: !body.status || body.status < 400,
      status: body.status ?? 200,
      headers: new Headers((body as { headers?: Record<string, string> }).headers),
      json: async () => body.json ?? body
    } as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const optionsResponse = { json: OPTIONS }
const recosResponse = { json: { items: RECOS } }

function click(el: HTMLElement, action: string) {
  el.querySelector<HTMLElement>(`[data-reco-action="${action}"]`)!.click()
}

function fillAll(el: HTMLElement) {
  const check = (field: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`[data-reco-options="${field}"] input`)
    input!.checked = true
    input!.dispatchEvent(new Event('change', { bubbles: true }))
    void value
  }
  check('level', 'licence')
  check('fields', 'info')
  check('destinations', 'france')
  const select = el.querySelector<HTMLSelectElement>('[data-reco-value="fr"] select')!
  select.value = 'b2'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  check('budget', 'lt10k')
  check('intake', 'sep')
}

async function initAndWait(init: IndexModule['init'], el: HTMLElement) {
  init(el)
  await vi.waitFor(() => {
    if (!el.querySelector('[data-reco-options="level"] input'))
      throw new Error('options non rendues')
  })
}

beforeEach(() => {
  mockFetch((url) => (url.includes('/v1/options') ? optionsResponse : recosResponse))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  sessionStorage.clear()
  document.body.replaceChildren()
  document.documentElement.removeAttribute('lang')
})

describe('parcours du questionnaire', () => {
  it('start → step-1 ; next bloqué sans réponse, message sous le champ', async () => {
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)

    click(el, 'start')
    expect(el.dataset.recoState).toBe('step-1')
    expect(
      el.querySelector('[data-reco-panel="steps"]')!.classList.contains('is-reco-active')
    ).toBe(true)

    click(el, 'next')
    expect(el.dataset.recoState).toBe('step-1')
    expect(el.querySelector('[data-reco-error-for="level"]')!.textContent).toBe('Champ requis')
  })

  it('va au bout : 5 étapes, consentement exigé, résultats affichés', async () => {
    const { init } = await load()
    const el = mountStepsWidget()
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>
    await initAndWait(init, el)
    expect(fetchSpy).toHaveBeenCalledTimes(1) // options seulement

    click(el, 'start')
    fillAll(el)
    for (let n = 0; n < 4; n++) click(el, 'next')
    expect(el.dataset.recoState).toBe('step-5')

    click(el, 'submit')
    expect(el.dataset.recoState).toBe('step-5')
    expect(el.querySelector('[data-reco-error-for="consent"]')!.textContent).toBe(
      'Consentement requis'
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1) // aucun POST sans consentement

    const consent = el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!
    consent.checked = true
    consent.dispatchEvent(new Event('change', { bubbles: true }))
    click(el, 'submit')

    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'results') throw new Error('pas results')
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(el.querySelectorAll('[data-reco-results] > article')).toHaveLength(2)

    // Annoncé dans la région live et focus posé sur le titre du panel.
    expect(el.querySelector('[data-reco-live]')!.textContent).toBe('2 recommandations')
    expect(document.activeElement).toBe(el.querySelector('[data-reco-title]'))
  })

  it('restart revient à intro et vide le brouillon', async () => {
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    click(el, 'start')
    fillAll(el)
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeTruthy()

    click(el, 'next')
    click(el, 'restart')
    expect(el.dataset.recoState).toBe('intro')
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(el.querySelectorAll('[data-reco-options] input:checked')).toHaveLength(0)
  })

  it('un 4e domaine est refusé avec message', async () => {
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    const inputs = el.querySelectorAll<HTMLInputElement>('[data-reco-options="fields"] input')
    inputs.forEach((input) => {
      input.checked = true
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(inputs[3]!.checked).toBe(false)
    expect(el.querySelector('[data-reco-error-for="fields"]')!.textContent).toBe('3 maximum')
  })

  it('le brouillon restaure étape et réponses au rechargement', async () => {
    const { init } = await load()
    const el = mountStepsWidget()
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        origin: 'mexique',
        step: 3,
        answers: {
          level: 'licence',
          fields: ['info'],
          destinations: ['france'],
          languages: [],
          budget: '',
          intake: '',
          goal: '',
          consent: false
        }
      })
    )
    await initAndWait(init, el)
    expect(el.dataset.recoState).toBe('step-3')
    expect(el.querySelector<HTMLInputElement>('[data-reco-options="level"] input')!.checked).toBe(
      true
    )
  })
})

describe('erreurs API', () => {
  it('options indisponibles → panel error', async () => {
    mockFetch(() => ({ status: 503 }))
    const { init } = await load()
    const el = mountStepsWidget()
    init(el)
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'error') throw new Error('pas error')
    })
    expect(el.querySelector('[data-reco-error-message]')!.textContent).toBe('Serveur')
  })

  it('429 → error rate, Réessayer désactivé pendant Retry-After', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const spy = mockFetch((url) =>
      url.includes('/v1/options')
        ? optionsResponse
        : { status: 429, headers: { 'Retry-After': '30' } }
    )
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    click(el, 'start')
    fillAll(el)
    for (let n = 0; n < 4; n++) click(el, 'next')
    el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.checked = true
    click(el, 'submit')
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'error') throw new Error('pas error')
    })
    expect(el.querySelector('[data-reco-error-message]')!.textContent).toBe('Trop de demandes')
    const retry = el.querySelector<HTMLButtonElement>('[data-reco-action="retry"]')!
    expect(retry.disabled).toBe(true)
    click(el, 'retry')
    expect(spy).toHaveBeenCalledTimes(2) // options + POST : pas de renvoi
    vi.advanceTimersByTime(30_000)
    expect(retry.disabled).toBe(false)
    vi.useRealTimers()
  })

  it('400 sur profile.fields ramène à l’étape 2', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFetch((url) =>
      url.includes('/v1/options')
        ? optionsResponse
        : { status: 400, json: { field: 'profile.fields' } }
    )
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    click(el, 'start')
    fillAll(el)
    for (let n = 0; n < 4; n++) click(el, 'next')
    el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.checked = true
    click(el, 'submit')
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'step-2') throw new Error('pas step-2')
    })
    expect(el.querySelector('[data-reco-error-for="fields"]')!.textContent).toBe('Saisie invalide')
  })

  it('réponse vide → panel empty', async () => {
    mockFetch((url) => (url.includes('/v1/options') ? optionsResponse : { json: { items: [] } }))
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    click(el, 'start')
    fillAll(el)
    for (let n = 0; n < 4; n++) click(el, 'next')
    el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.checked = true
    click(el, 'submit')
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'empty') throw new Error('pas empty')
    })
  })

  it('retry après un échec options recharge les options', async () => {
    let calls = 0
    mockFetch(() => {
      calls += 1
      return calls === 1 ? { status: 503 } : optionsResponse
    })
    const { init } = await load()
    const el = mountStepsWidget()
    init(el)
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'error') throw new Error('pas error')
    })
    click(el, 'retry')
    await vi.waitFor(() => {
      if (
        el.dataset.recoState !== 'loading' &&
        !el.querySelector('[data-reco-options="level"] input')
      )
        throw new Error('pas rechargé')
    })
  })
})

describe('lien conseiller', () => {
  it('reçoit data-reco-advisor-url dans tous les panels et trace le clic', async () => {
    const { init } = await load()
    const el = mountStepsWidget()
    const events: unknown[] = []
    el.addEventListener(RECO_EVENT, (e) => events.push((e as CustomEvent).detail))
    await initAndWait(init, el)

    el.querySelectorAll<HTMLAnchorElement>('[data-reco-action="advisor"]').forEach((link) => {
      expect(link.href).toContain('/mexique#contact')
    })
    el.querySelector<HTMLAnchorElement>('[data-reco-action="advisor"]')!.click()
    expect(events).toContainEqual({ name: 'advisor', from: 'intro' })
  })
})
