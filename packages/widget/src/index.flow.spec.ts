import { mountStepsWidget } from './testing/widget.fixture'
import { DRAFT_KEY } from './ui/steps'
import { RECO_EVENT } from './tracking/events'

type IndexModule = typeof import('./index')

async function load(): Promise<IndexModule> {
  vi.resetModules()
  return import('./index')
}

/** Réponse SSE du contrat /chat : chunks delta puis un final. */
function sse(text: string, meta: object = {}): Response {
  const body =
    `event: delta\ndata: ${JSON.stringify({ text })}\n\n` +
    `event: final\ndata: ${JSON.stringify(meta)}\n\n`
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

type FetchInit = { headers?: Record<string, string>; body?: string }

function mockFetch(handler: (url: string, init?: FetchInit) => Response) {
  const spy = vi.fn(async (url: unknown, init?: FetchInit) => handler(String(url), init))
  vi.stubGlobal('fetch', spy)
  return spy
}

const NOMINAL = {
  session_id: 's1',
  citations: [
    { title: 'Licence Info', url: 'https://www.studely.com/p/1' },
    { title: 'Bachelor Business', url: 'https://www.studely.com/p/2' }
  ]
}

const chatOk = () => sse('Voici trois pistes adaptées à ton profil.', NOMINAL)

function click(el: HTMLElement, action: string) {
  el.querySelector<HTMLElement>(`[data-reco-action="${action}"]`)!.click()
}

function fillAll(el: HTMLElement) {
  const check = (field: string) => {
    const input = el.querySelector<HTMLInputElement>(`[data-reco-options="${field}"] input`)
    input!.checked = true
    input!.dispatchEvent(new Event('change', { bubbles: true }))
  }
  check('level')
  check('fields')
  check('destinations')
  const select = el.querySelector<HTMLSelectElement>('[data-reco-options="languages"] select')!
  select.value = select.options[1]!.value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  check('budget')
  check('intake')
}

async function initAndWait(init: IndexModule['init'], el: HTMLElement) {
  init(el)
  await vi.waitFor(() => {
    if (!el.querySelector('[data-reco-options="level"] input'))
      throw new Error('options non rendues')
  })
}

beforeEach(() => {
  mockFetch(chatOk)
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

  it('va au bout : 5 étapes, consentement exigé, réponse /chat affichée', async () => {
    const { init } = await load()
    const el = mountStepsWidget()
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>
    await initAndWait(init, el)
    expect(fetchSpy).not.toHaveBeenCalled() // options statiques : aucun fetch

    click(el, 'start')
    fillAll(el)
    for (let n = 0; n < 4; n++) click(el, 'next')
    expect(el.dataset.recoState).toBe('step-5')

    click(el, 'submit')
    expect(el.dataset.recoState).toBe('step-5')
    expect(el.querySelector('[data-reco-error-for="consent"]')!.textContent).toBe(
      'Consentement requis'
    )
    expect(fetchSpy).not.toHaveBeenCalled() // aucun POST sans consentement

    const consent = el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!
    consent.checked = true
    consent.dispatchEvent(new Event('change', { bubbles: true }))
    click(el, 'submit')

    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'results') throw new Error('pas results')
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Texte du bot + liens de citations ; session persistée pour la suite.
    expect(el.querySelector('[data-reco-field="text"]')!.textContent).toContain('trois pistes')
    expect(el.querySelectorAll('[data-reco-field="links"] a')).toHaveLength(2)
    expect(sessionStorage.getItem('studely.reco.session.mexique')).toBe('s1')

    // Annoncé dans la région live et focus posé sur le titre du panel.
    expect(el.querySelector('[data-reco-live]')!.textContent).toBe('2 recommandations')
    expect(document.activeElement).toBe(el.querySelector('[data-reco-title]'))
  })

  it('restart revient à intro, vide le brouillon et réinitialise la session', async () => {
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    sessionStorage.setItem('studely.reco.session.mexique', 's-old')
    click(el, 'start')
    fillAll(el)
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeTruthy()

    click(el, 'next')
    click(el, 'restart')
    expect(el.dataset.recoState).toBe('intro')
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(sessionStorage.getItem('studely.reco.session.mexique')).toBeNull()
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
    expect(
      el.querySelector<HTMLInputElement>('[data-reco-options="level"] input[value="licence"]')!
        .checked
    ).toBe(true)
  })
})

describe('erreurs API', () => {
  async function submitFullForm(el: HTMLElement) {
    click(el, 'start')
    fillAll(el)
    for (let n = 0; n < 4; n++) click(el, 'next')
    el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.checked = true
    click(el, 'submit')
  }

  it('chat indisponible au submit → panel error', async () => {
    mockFetch(() => new Response('{"detail":"UNAVAILABLE"}', { status: 503 }))
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    await submitFullForm(el)
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'error') throw new Error('pas error')
    })
    expect(el.querySelector('[data-reco-error-message]')!.textContent).toBe('Serveur')
  })

  it('429 → error rate, Réessayer désactivé pendant Retry-After', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const spy = mockFetch(
      () =>
        new Response('{"detail":"RATE_LIMITED"}', {
          status: 429,
          headers: { 'Retry-After': '30' }
        })
    )
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    await submitFullForm(el)
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'error') throw new Error('pas error')
    })
    expect(el.querySelector('[data-reco-error-message]')!.textContent).toBe('Trop de demandes')
    const retry = el.querySelector<HTMLButtonElement>('[data-reco-action="retry"]')!
    expect(retry.disabled).toBe(true)
    click(el, 'retry')
    expect(spy).toHaveBeenCalledTimes(1) // pas de renvoi pendant le verrou
    vi.advanceTimersByTime(30_000)
    expect(retry.disabled).toBe(false)
    vi.useRealTimers()
  })

  it('422 FastAPI sur le message → panel error « saisie invalide »', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ detail: [{ loc: ['body', 'message'], msg: 'field required' }] }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        )
    )
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    await submitFullForm(el)
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'error') throw new Error('pas error')
    })
    expect(el.querySelector('[data-reco-error-message]')!.textContent).toBe('Saisie invalide')
  })

  it('réponse vide → panel empty', async () => {
    mockFetch(() => sse('', { session_id: 's1' }))
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    await submitFullForm(el)
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'empty') throw new Error('pas empty')
    })
    expect(el.querySelector('[data-reco-panel="empty"]')!.classList).toContain('is-reco-active')
  })

  it('retry après un échec /chat renvoie la demande avec la même session', async () => {
    let calls = 0
    const spy = mockFetch(() => {
      calls += 1
      return calls === 1
        ? new Response('{"detail":"INTERNAL"}', { status: 500 })
        : sse('Voici des pistes.', { session_id: 's2' })
    })
    const { init } = await load()
    const el = mountStepsWidget()
    await initAndWait(init, el)
    await submitFullForm(el)
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'error') throw new Error('pas error')
    })
    click(el, 'retry')
    await vi.waitFor(() => {
      if (el.dataset.recoState !== 'results') throw new Error('pas results')
    })
    expect(spy).toHaveBeenCalledTimes(2)
    // Le corps du retry renvoie le même message profil.
    const second = spy.mock.calls[1]![1] as { body: string }
    expect(JSON.parse(second.body).message).toContain('Mon profil')
  })

  describe('refus hors périmètre', () => {
    // Rejected replies never count as recommendations, even when their
    // text/citations look supported.
    it.each([
      { intent: 'faq', out_of_scope: true, citations: NOMINAL.citations },
      { intent: 'out_of_scope' }
    ])('meta %j → panel empty, pas de comptage', async (meta) => {
      mockFetch(() => sse('Voici une piste <b>refus</b> littérale.', { session_id: 's1', ...meta }))
      const { init } = await load()
      const el = mountStepsWidget()
      const events: unknown[] = []
      el.addEventListener(RECO_EVENT, (e) => events.push((e as CustomEvent).detail))
      await initAndWait(init, el)
      await submitFullForm(el)
      await vi.waitFor(() => {
        if (el.dataset.recoState !== 'empty') throw new Error('pas empty')
      })
      expect(el.querySelector('[data-reco-panel="empty"]')!.classList).toContain('is-reco-active')
      // The live region says empty, not a recommendation count.
      expect(el.querySelector('[data-reco-live]')!.textContent).toBe('Aucun parcours')
      expect(events).toContainEqual(expect.objectContaining({ name: 'empty' }))
      expect(window.dataLayer?.some((p) => p.event === 'reco_empty')).toBe(true)
      // Refusal text injected as plain text — markup stays literal.
      const reason = el.querySelector<HTMLElement>('[data-reco-empty-reason]')!
      expect(reason.hidden).toBe(false)
      expect(reason.textContent).toBe('Voici une piste <b>refus</b> littérale.')
      expect(reason.querySelector('b')).toBeNull()
      expect(el.querySelector<HTMLElement>('[data-reco-empty-default]')!.hidden).toBe(true)
    })

    it('edit → retry accepté : résultats affichés, motif effacé ; refus suivant les vide', async () => {
      let refused = true
      mockFetch(() =>
        refused
          ? sse('Je ne peux pas répondre à cela.', { intent: 'out_of_scope' })
          : sse('Voici trois pistes adaptées à ton profil.', NOMINAL)
      )
      const { init } = await load()
      const el = mountStepsWidget()
      await initAndWait(init, el)
      await submitFullForm(el)
      await vi.waitFor(() => {
        if (el.dataset.recoState !== 'empty') throw new Error('pas empty')
      })
      const reason = el.querySelector<HTMLElement>('[data-reco-empty-reason]')!
      const generic = el.querySelector<HTMLElement>('[data-reco-empty-default]')!
      expect(reason.textContent).toBe('Je ne peux pas répondre à cela.')

      // Edit goes back to step-1; revalidate steps and resubmit — accepted
      // reply shows results and clears the refusal reason.
      refused = false
      click(el, 'edit')
      expect(el.dataset.recoState).toBe('step-1')
      for (let n = 0; n < 4; n++) click(el, 'next')
      el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.checked = true
      click(el, 'submit')
      await vi.waitFor(() => {
        if (el.dataset.recoState !== 'results') throw new Error('pas results')
      })
      expect(reason.hidden).toBe(true)
      expect(reason.textContent).toBe('')
      expect(generic.hidden).toBe(false)

      // A later refusal clears the rendered results again.
      refused = true
      click(el, 'edit')
      for (let n = 0; n < 4; n++) click(el, 'next')
      el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.checked = true
      click(el, 'submit')
      await vi.waitFor(() => {
        if (el.dataset.recoState !== 'empty') throw new Error('pas empty (2e)')
      })
      expect(el.querySelector('[data-reco-results]')!.children).toHaveLength(0)
    })

    it('ancien gabarit sans hooks empty : le refus atteint quand même empty', async () => {
      mockFetch(() => sse('Hors sujet.', { intent: 'out_of_scope' }))
      const { init } = await load()
      const el = mountStepsWidget()
      el.querySelector('[data-reco-empty-reason]')!.remove()
      el.querySelector('[data-reco-empty-default]')!.remove()
      await initAndWait(init, el)
      await submitFullForm(el)
      await vi.waitFor(() => {
        if (el.dataset.recoState !== 'empty') throw new Error('pas empty')
      })
      expect(el.querySelector('[data-reco-panel="empty"]')!.classList).toContain('is-reco-active')
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
