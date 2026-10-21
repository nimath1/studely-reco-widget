/**
 * Flux du chat : consentement → saisie → POST /chat → bulles,
 * erreurs, retry, stop, reset, session et jalons `studely:reco`.
 */
import * as StudelyReco from './index'
import { mountWidget, VALID_ATTRS } from './testing/widget.fixture'

const SSE = (text: string, meta: object = {}) =>
  `event: delta\ndata: ${JSON.stringify({ text })}\n\nevent: final\ndata: ${JSON.stringify(meta)}\n\n`

function mockFetch(impl: (...args: unknown[]) => Promise<Partial<Response>>) {
  const spy = vi.fn(impl)
  vi.stubGlobal('fetch', spy)
  return spy
}

const ok = (body: string): Partial<Response> => ({ ok: true, text: async () => body })
const fail = (status: number, headers = new Headers()): Partial<Response> => ({
  ok: false,
  status,
  headers,
  json: async () => null
})

let el: HTMLElement

const consent = () => el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!
const textarea = () => el.querySelector<HTMLTextAreaElement>('[data-reco-input="message"]')!
const pending = () => el.querySelector<HTMLElement>('[data-reco-pending]')!
const errorCard = () => el.querySelector<HTMLElement>('[data-reco-error]')!
const entries = () => [...el.querySelectorAll<HTMLElement>('[data-reco-thread] > [data-reco-msg]')]
const userEntries = () => entries().filter((n) => n.dataset.recoMsg === 'user')
const assistantEntries = () => entries().filter((n) => n.dataset.recoMsg === 'assistant')

/** Coche le consentement et attend que la saisie soit déverrouillée
    (le retrait de `disabled` suit le tick petite-vue). */
async function grant(): Promise<void> {
  consent().checked = true
  consent().dispatchEvent(new Event('change', { bubbles: true }))
  await vi.waitFor(() => {
    expect(el.querySelector<HTMLButtonElement>('[data-reco-action="send"]')!.disabled).toBe(false)
  })
}

/** Tape un message et clique Envoyer. */
async function type(text: string): Promise<void> {
  textarea().value = text
  el.querySelector<HTMLElement>('[data-reco-action="send"]')!.click()
}

async function waitFor(check: () => void): Promise<void> {
  await vi.waitFor(check)
}

beforeEach(() => {
  document.documentElement.lang = 'fr'
  el = mountWidget()
  StudelyReco.init(el)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  sessionStorage.clear()
  delete window.dataLayer
  delete window.Cookiebot
  document.body.innerHTML = ''
})

describe('accueil et consentement', () => {
  it('bulle d’accueil + 5 chips ; état consent tant que la case n’est pas cochée', () => {
    expect(el.dataset.recoState).toBe('consent')
    expect(assistantEntries()).toHaveLength(1)
    expect(el.querySelectorAll('[data-reco-thread] [data-reco-send]')).toHaveLength(5)
    expect(textarea().disabled).toBe(true)
  })

  it('un envoi synthétique sans consentement n’appelle pas l’API', async () => {
    const spy = mockFetch(async () => ok(SSE('x')))
    textarea().value = 'Bonjour'
    textarea().closest('form')!.requestSubmit()
    expect(spy).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(el.querySelector('[data-reco-live]')!.textContent).toContain('Consentement')
    )
  })

  it('coche → état chat + saisie libre ; décoche → retour consent', async () => {
    await grant()
    expect(el.dataset.recoState).toBe('chat')
    await waitFor(() => expect(textarea().disabled).toBe(false))
    consent().checked = false
    consent().dispatchEvent(new Event('change', { bubbles: true }))
    expect(el.dataset.recoState).toBe('consent')
  })
})

describe('envoi et réponse', () => {
  beforeEach(async () => {
    mockFetch(async () =>
      ok(
        SSE('Voici des pistes', {
          session_id: 's1',
          citations: [{ title: 'Lyon', url: 'https://www.studely.com/lyon' }]
        })
      )
    )
    await grant()
  })

  it('bulle user → pending → bulle assistant avec liens filtrés', async () => {
    await type('Je cherche un master')
    expect(userEntries().at(-1)!.textContent).toContain('Je cherche un master')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    const reply = assistantEntries().at(-1)!
    expect(reply.textContent).toContain('Voici des pistes')
    expect(reply.querySelector('[data-reco-field="links"] a')!.textContent).toBe('Lyon')
    expect(pending().hidden).toBe(true)
    expect(textarea().value).toBe('')
  })

  it('session /chat persistée et repostée au tour suivant', async () => {
    const spy = mockFetch(async () => ok(SSE('r', { session_id: 's1' })))
    await type('premier')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    await type('deuxième')
    await waitFor(() => expect(spy.mock.calls).toHaveLength(2))
    const body = JSON.parse((spy.mock.calls[1]![1] as { body: string }).body)
    expect(body.session_id).toBe('s1')
    expect(sessionStorage.getItem('studely.reco.session.mexique')).toBe('s1')
  })

  it('chip suggestion envoie son libellé', async () => {
    const spy = mockFetch(async () => ok(SSE('r')))
    el.querySelector<HTMLElement>('[data-reco-thread] [data-reco-send]')!.click()
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const body = JSON.parse((spy.mock.calls[0]![1] as { body: string }).body)
    expect(body.message).toBe('Bachelor en Europe')
    expect(userEntries().at(-1)!.textContent).toContain('Bachelor en Europe')
  })

  it('réponse HTML reste du texte brut (§7.4)', async () => {
    mockFetch(async () => ok(SSE('<img src=x onerror=alert(1)> piste')))
    await type('x')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    const reply = assistantEntries().at(-1)!
    expect(reply.textContent).toContain('<img')
    expect(reply.querySelector('img')).toBeNull()
  })

  it('out_of_scope → CTA conseiller + jalon empty', async () => {
    mockFetch(async () => ok(SSE('Hors périmètre', { out_of_scope: true })))
    await type('météo ?')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    expect(assistantEntries().at(-1)!.querySelector('[data-reco-action="advisor"]')).not.toBeNull()
    const events = (window.dataLayer ?? []).map((p) => p.event)
    expect(events).toContain('reco_empty')
  })

  it('jalons dataLayer : send + reply avec paramètres communs', async () => {
    await type('master')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    const events = (window.dataLayer ?? []).map((p) => p.event)
    expect(events).toEqual(expect.arrayContaining(['reco_send', 'reco_reply']))
    const reply = (window.dataLayer ?? []).find((p) => p.event === 'reco_reply')
    expect(reply?.reco_origin).toBe('mexique')
    expect(reply?.duration_ms).toBeTypeOf('number')
  })
})

describe('erreurs, retry, stop, reset', () => {
  beforeEach(async () => {
    await grant()
  })

  it('500 → carte erreur en pied de fil + Réessayer reposte le même message', async () => {
    mockFetch(async () => fail(500))
    await type('master')
    await waitFor(() => expect(errorCard().hidden).toBe(false))
    expect(errorCard().querySelector('[data-reco-error-message]')!.textContent).toBe('Serveur')
    expect(pending().hidden).toBe(true)

    mockFetch(async () => ok(SSE('de retour')))
    el.querySelector<HTMLElement>('[data-reco-action="retry"]')!.click()
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    // Pas de nouvelle bulle utilisateur au retry.
    expect(userEntries()).toHaveLength(1)
    expect(errorCard().hidden).toBe(true)
  })

  it('429 → message rate et Réessayer verrouillé pendant Retry-After', async () => {
    mockFetch(async () => fail(429, new Headers({ 'Retry-After': '30' })))
    await type('master')
    await waitFor(() => expect(errorCard().hidden).toBe(false))
    expect(errorCard().querySelector('[data-reco-error-message]')!.textContent).toBe(
      'Trop de demandes'
    )
    await waitFor(() =>
      expect(el.querySelector<HTMLButtonElement>('[data-reco-action="retry"]')!.disabled).toBe(true)
    )
  })

  it('403 → défi relancé et message reposté ; 2e échec → carte captcha', async () => {
    const spy = mockFetch(async () => fail(403))
    await type('master')
    // Premier 403 : repost automatique (le défi est relancé entre-temps).
    await waitFor(() => expect(spy.mock.calls).toHaveLength(2))
    await waitFor(() => expect(errorCard().hidden).toBe(false))
    expect(errorCard().querySelector('[data-reco-error-message]')!.textContent).toBe(
      'Captcha échoué'
    )
  })

  it('« Arrêter » annule l’envoi : ni erreur ni bulle assistant', async () => {
    mockFetch(
      (...args: unknown[]) =>
        new Promise((_resolve, reject) => {
          const signal = (args[1] as { signal: AbortSignal }).signal
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
    )
    await type('master')
    await waitFor(() => expect(pending().hidden).toBe(false))
    el.querySelector<HTMLElement>('[data-reco-action="stop"]')!.click()
    await waitFor(() => expect(pending().hidden).toBe(true))
    expect(errorCard().hidden).toBe(true)
    expect(assistantEntries()).toHaveLength(1) // accueil seul
    expect(userEntries()).toHaveLength(1)
  })

  it('double envoi verrouillé tant que pending', async () => {
    let resolveFetch: (r: Partial<Response>) => void = () => undefined
    mockFetch(
      () =>
        new Promise<Partial<Response>>((resolve) => {
          resolveFetch = resolve
        })
    )
    await type('un')
    await type('deux') // ignoré : pending (bouton désactivé)
    expect(userEntries()).toHaveLength(1)
    resolveFetch(ok(SSE('r')))
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    await vi.waitFor(() =>
      expect(el.querySelector<HTMLButtonElement>('[data-reco-action="send"]')!.disabled).toBe(false)
    )
    await type('deux')
    expect(userEntries()).toHaveLength(2)
  })
})

describe('mise en relation conseiller', () => {
  const handoffForm = () => el.querySelector<HTMLFormElement>('[data-reco-handoff]')

  beforeEach(async () => {
    await grant()
  })

  it('« Parler à un conseiller » ajoute le mini-formulaire au fil', async () => {
    mockFetch(async () => ok(SSE('Hors périmètre', { out_of_scope: true })))
    await type('météo ?')
    await waitFor(() =>
      expect(
        assistantEntries().at(-1)!.querySelector('[data-reco-action="advisor"]')
      ).not.toBeNull()
    )
    assistantEntries().at(-1)!.querySelector<HTMLElement>('[data-reco-action="advisor"]')!.click()
    expect(handoffForm()).not.toBeNull()
    const events = (window.dataLayer ?? []).map((p) => p.event)
    expect(events).toContain('reco_advisor')
  })

  it('formulaire invalide : erreur affichée, rien n’est posté', async () => {
    const spy = mockFetch(async () => ok(SSE('r')))
    mockFetch(async () => ok(SSE('Hors périmètre', { out_of_scope: true })))
    await type('x')
    await waitFor(() =>
      expect(
        assistantEntries().at(-1)!.querySelector('[data-reco-action="advisor"]')
      ).not.toBeNull()
    )
    assistantEntries().at(-1)!.querySelector<HTMLElement>('[data-reco-action="advisor"]')!.click()
    const callsBefore = spy.mock.calls.length
    handoffForm()!.requestSubmit()
    await waitFor(() =>
      expect(el.querySelector<HTMLElement>('[data-reco-field="handoff-error"]')!.hidden).toBe(false)
    )
    expect(spy.mock.calls).toHaveLength(callsBefore)
  })

  it('sans handoff-url : ouvre la page conseiller avec nom + e-mail, bulle confirm', async () => {
    mockFetch(async () => ok(SSE('Hors périmètre', { out_of_scope: true })))
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    await type('x')
    await waitFor(() =>
      expect(
        assistantEntries().at(-1)!.querySelector('[data-reco-action="advisor"]')
      ).not.toBeNull()
    )
    assistantEntries().at(-1)!.querySelector<HTMLElement>('[data-reco-action="advisor"]')!.click()
    handoffForm()!.querySelector<HTMLInputElement>('[data-reco-input="handoff-name"]')!.value =
      'Awa'
    handoffForm()!.querySelector<HTMLInputElement>('[data-reco-input="handoff-email"]')!.value =
      'awa@exemple.com'
    handoffForm()!.requestSubmit()
    await waitFor(() => expect(openSpy).toHaveBeenCalled())
    const url = openSpy.mock.calls[0]![0] as string
    expect(url).toContain('nom=Awa')
    expect(url).toContain('email=awa%40exemple.com')
    await waitFor(() =>
      expect(assistantEntries().at(-1)!.textContent).toContain('conseiller te contactera')
    )
    const events = (window.dataLayer ?? []).map((p) => p.event)
    expect(events).toContain('reco_handoff')
  })

  it('avec handoff-url : POST JSON nom + e-mail puis confirmation', async () => {
    const extra = mountWidget(
      `${VALID_ATTRS} data-reco-handoff-url="https://api.studely.com/handoff"`
    )
    StudelyReco.init(extra)
    const consent2 = extra.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!
    consent2.checked = true
    consent2.dispatchEvent(new Event('change', { bubbles: true }))
    const spy = mockFetch(async (input: unknown) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url === 'https://api.studely.com/handoff') return ok('{}')
      return ok(SSE('Hors périmètre', { out_of_scope: true }))
    })
    await waitFor(() =>
      expect(extra.querySelector<HTMLButtonElement>('[data-reco-action="send"]')!.disabled).toBe(
        false
      )
    )
    const ta = extra.querySelector<HTMLTextAreaElement>('[data-reco-input="message"]')!
    ta.value = 'conseiller'
    extra.querySelector<HTMLElement>('[data-reco-action="send"]')!.click()
    const extraEntries = () => [
      ...extra.querySelectorAll<HTMLElement>('[data-reco-thread] > [data-reco-msg="assistant"]')
    ]
    await waitFor(() =>
      expect(extraEntries().at(-1)!.querySelector('[data-reco-action="advisor"]')).not.toBeNull()
    )
    extraEntries().at(-1)!.querySelector<HTMLElement>('[data-reco-action="advisor"]')!.click()
    const form = extra.querySelector<HTMLFormElement>('[data-reco-handoff]')!
    form.querySelector<HTMLInputElement>('[data-reco-input="handoff-name"]')!.value = 'Awa'
    form.querySelector<HTMLInputElement>('[data-reco-input="handoff-email"]')!.value =
      'awa@exemple.com'
    form.requestSubmit()
    await waitFor(() =>
      expect(
        spy.mock.calls.some(([input]) =>
          (typeof input === 'string' ? input : (input as Request).url).includes('/handoff')
        )
      ).toBe(true)
    )
    const post = spy.mock.calls.find(([input]) =>
      (typeof input === 'string' ? input : (input as Request).url).includes('/handoff')
    )!
    const body = JSON.parse((post[1] as { body: string }).body)
    expect(body).toMatchObject({ name: 'Awa', email: 'awa@exemple.com', origin: 'mexique' })
    await waitFor(() =>
      expect(extraEntries().at(-1)!.textContent).toContain('conseiller te contactera')
    )
  })
})
