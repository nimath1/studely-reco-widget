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
  localStorage.clear()
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

describe('consentement passif (continuation)', () => {
  /** Remplace la case par la notice « continuation » puis ré-initialise. */
  function useContinuationMarkup(): void {
    const notice = document.createElement('p')
    notice.dataset.recoConsent = 'continuation'
    notice.dataset.recoField = 'consent-label'
    notice.textContent =
      'En continuant, vous acceptez l’analyse automatique de vos messages pour vous proposer des parcours.'
    el.querySelector('[data-reco-consent]')!.replaceWith(notice)
    StudelyReco.init(el)
  }

  const consentEvents = () => (window.dataLayer ?? []).filter((p) => p.event === 'reco_consent')

  it('saisie libre dès l’ouverture, aucun consentement émis avant interaction', async () => {
    useContinuationMarkup()
    await waitFor(() => expect(textarea().disabled).toBe(false))
    expect(el.querySelector<HTMLButtonElement>('[data-reco-action="send"]')!.disabled).toBe(false)
    expect(el.querySelector('[data-reco-input="consent"]')).toBeNull()
    expect(consentEvents()).toHaveLength(0)
  })

  it('premier chip : envoie son libellé une fois et accorde le consentement', async () => {
    const spy = mockFetch(async () => ok(SSE('r')))
    useContinuationMarkup()
    await waitFor(() =>
      expect(el.querySelector<HTMLButtonElement>('[data-reco-action="send"]')!.disabled).toBe(false)
    )
    el.querySelector<HTMLElement>('[data-reco-thread] [data-reco-send]')!.click()
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    const body = JSON.parse((spy.mock.calls[0]![1] as { body: string }).body)
    expect(body.message).toBe('Bachelor en Europe')
    expect(userEntries().at(-1)!.textContent).toContain('Bachelor en Europe')
    expect(el.dataset.recoState).toBe('chat')
    expect(consentEvents()).toHaveLength(1)
  })

  it('premier envoi texte : un seul POST, puis pas de jalon consentement en plus', async () => {
    const spy = mockFetch(async () => ok(SSE('r', { session_id: 's1' })))
    useContinuationMarkup()
    await waitFor(() => expect(textarea().disabled).toBe(false))
    await type('Je cherche un master')
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    expect(consentEvents()).toHaveLength(1)
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    await type('deuxième message')
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
    expect(consentEvents()).toHaveLength(1)
  })

  it('soumission vide : ni consentement ni POST', async () => {
    const spy = mockFetch(async () => ok(SSE('r')))
    useContinuationMarkup()
    await waitFor(() => expect(textarea().disabled).toBe(false))
    textarea().value = '   '
    textarea().closest('form')!.requestSubmit()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(spy).not.toHaveBeenCalled()
    expect(consentEvents()).toHaveLength(0)
    expect(el.dataset.recoState).toBe('consent')
  })

  it('sans case ni marqueur : blocage hérité, annonce consentement', async () => {
    const spy = mockFetch(async () => ok(SSE('r')))
    el.querySelector('[data-reco-consent]')!.remove()
    StudelyReco.init(el)
    await waitFor(() =>
      expect(el.querySelector<HTMLButtonElement>('[data-reco-action="send"]')!.disabled).toBe(true)
    )
    textarea().value = 'Bonjour'
    textarea().closest('form')!.requestSubmit()
    expect(spy).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(el.querySelector('[data-reco-live]')!.textContent).toContain('Consentement')
    )
    expect(consentEvents()).toHaveLength(0)
  })

  it('la case héritée garde son blocage puis sa révocation', async () => {
    await grant()
    expect(el.dataset.recoState).toBe('chat')
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

  it('le focus revient au composer quand la réponse arrive', async () => {
    textarea().focus()
    await type('x')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(document.activeElement).toBe(textarea()))
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

  it('pouces : le choix peut être changé, re-cliquer le même ne reposte pas', async () => {
    mockFetch(async () => ok(SSE('r', { session_id: 's1', turn_id: 't1' })))
    await type('Je cherche un master')
    await waitFor(() => expect(el.querySelector('[data-reco-turn-id="t1"]')).not.toBeNull())
    const row = el.querySelector<HTMLElement>('[data-reco-turn-id="t1"]')!
    const button = (r: string) => row.querySelector<HTMLButtonElement>(`[data-reco-rating="${r}"]`)!
    const spy = mockFetch(async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => '{}'
    }))

    button('up').click()
    await waitFor(() => expect(row.dataset.recoChosen).toBe('up'))
    await waitFor(() => expect(button('down').disabled).toBe(false))
    expect(button('up').getAttribute('aria-pressed')).toBe('true')

    button('up').click()
    expect(spy).toHaveBeenCalledTimes(1)

    button('down').click()
    await waitFor(() => expect(row.dataset.recoChosen).toBe('down'))
    expect(spy).toHaveBeenCalledTimes(2)
    expect(JSON.parse((spy.mock.calls[1]![1] as { body: string }).body).rating).toBe('down')
    expect(button('up').getAttribute('aria-pressed')).toBe('false')
  })

  it('citation = lien externe : un clic n’envoie aucun message', async () => {
    await type('Je cherche un master')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    const spy = mockFetch(async () => ok(SSE('r')))
    const link = assistantEntries()
      .at(-1)!
      .querySelector<HTMLAnchorElement>('[data-reco-field="links"] a')!
    expect(link.href).toBe('https://www.studely.com/lyon')
    expect(link.target).toBe('_blank')
    // jsdom ne navigue pas : on vérifie seulement qu'aucune question ne part.
    link.addEventListener('click', (e) => e.preventDefault())
    link.click()
    await new Promise((r) => setTimeout(r, 50))
    expect(spy).not.toHaveBeenCalled()
    expect(userEntries()).toHaveLength(1)
  })

  it('réponse HTML reste du texte brut (§7.4)', async () => {
    mockFetch(async () => ok(SSE('<img src=x onerror=alert(1)> piste')))
    await type('x')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    const reply = assistantEntries().at(-1)!
    expect(reply.textContent).toContain('<img')
    expect(reply.querySelector('img')).toBeNull()
  })

  it('Markdown reply → DOM structure (bold + list), marqueur [S1] retiré', async () => {
    mockFetch(async () =>
      ok(SSE('Voici deux pistes :\n\n- **Via application** : dépose en ligne [S1]'))
    )
    await type('x')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    const reply = assistantEntries().at(-1)!
    const scope = reply.querySelector('[data-reco-field="text"]')!
    expect(scope.querySelector('p')!.textContent).toBe('Voici deux pistes :')
    const item = scope.querySelector('ul > li')!
    expect(item.querySelector('strong')!.textContent).toBe('Via application')
    expect(item.textContent).toContain('dépose en ligne')
    expect(item.textContent).not.toContain('[S1]')
    expect(scope.querySelectorAll('a')).toHaveLength(0)
  })

  it('event: sources + citations subset → seule la citation retenue, marqueur [S3] retiré', async () => {
    const sources = [
      {
        label: 'S1',
        title: 'Piste Lyon',
        source_url: 'https://support.studely.com/hc/fr/articles/1-lyon'
      },
      {
        label: 'S2',
        title: 'Piste Louvain',
        source_url: 'https://support.studely.com/hc/fr/articles/2-louvain'
      },
      {
        label: 'S3',
        title: 'Piste Hambourg',
        source_url: 'https://support.studely.com/hc/fr/articles/3-hambourg'
      }
    ]
    mockFetch(async () =>
      ok(
        `event: sources\ndata: ${JSON.stringify({ sources })}\n\n` +
          SSE('Une piste détaillée ici [S3]', { session_id: 's1', citations: [sources[2]] })
      )
    )
    await type('x')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    const reply = assistantEntries().at(-1)!
    // The [S3] marker is stripped: no marker, no anchor inside the text.
    const scope = reply.querySelector('[data-reco-field="text"]')!
    expect(scope.textContent).toContain('Une piste détaillée ici')
    expect(scope.textContent).not.toContain('[S3]')
    expect(scope.querySelectorAll('a')).toHaveLength(0)
    const links = [...reply.querySelectorAll<HTMLAnchorElement>('[data-reco-field="links"] a')]
    expect(links).toHaveLength(1)
    expect(links[0]!.textContent).toBe('Piste Hambourg')
    expect(links[0]!.href).toBe('https://support.studely.com/hc/fr/articles/3-hambourg')
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
    const send = el.querySelector<HTMLButtonElement>('[data-reco-action="send"]')!
    const stop = el.querySelector<HTMLButtonElement>('[data-reco-action="stop"]')!
    expect(stop.hidden).toBe(true)
    expect(stop.getAttribute('aria-label')).toBe('Arrêter')
    await type('master')
    await waitFor(() => expect(pending().hidden).toBe(false))
    // Pendant la réponse, « Arrêter » prend la place d'« Envoyer » dans le composer.
    await waitFor(() => expect(stop.hidden).toBe(false))
    expect(send.hidden).toBe(true)
    stop.click()
    await waitFor(() => expect(pending().hidden).toBe(true))
    await waitFor(() => expect(send.hidden).toBe(false))
    expect(stop.hidden).toBe(true)
    expect(errorCard().hidden).toBe(true)
    expect(assistantEntries()).toHaveLength(1) // accueil seul
    expect(userEntries()).toHaveLength(1)
  })

  it('double envoi verrouillé tant que pending', async () => {
    let resolveFetch = (_r: Partial<Response>): void => {}
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
  const handoffForm = () =>
    el.querySelector<HTMLFormElement>('[data-reco-thread] [data-reco-handoff]')
  const urlOf = (input: unknown) => (typeof input === 'string' ? input : (input as Request).url)
  const json = (body: unknown): Partial<Response> => ({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body)
  })
  /** Formulaire ouvert et pré-remplissage terminé (aria-busy retiré). */
  const formReady = (form = handoffForm) =>
    waitFor(() => {
      expect(form()).not.toBeNull()
      expect(form()!.hasAttribute('aria-busy')).toBe(false)
    })
  function fillValid(form: HTMLFormElement): void {
    const values: Record<string, string> = {
      subject: 'Mise en relation',
      description: 'Je souhaite parler à un conseiller.',
      first: 'Awa',
      last: 'Diop',
      email: 'awa@exemple.com',
      phone: '+221 77 123 45 67',
      country: 'Sénégal'
    }
    for (const [name, value] of Object.entries(values)) {
      form.querySelector<HTMLInputElement>(`[data-reco-input="handoff-${name}"]`)!.value = value
    }
  }
  async function openViaAdvisor(): Promise<void> {
    await waitFor(() =>
      expect(
        assistantEntries().at(-1)!.querySelector('[data-reco-action="advisor"]')
      ).not.toBeNull()
    )
    assistantEntries().at(-1)!.querySelector<HTMLElement>('[data-reco-action="advisor"]')!.click()
    await formReady()
  }

  beforeEach(async () => {
    await grant()
  })

  it('« Parler à un conseiller » ajoute le formulaire complet au fil', async () => {
    mockFetch(async () => ok(SSE('Hors périmètre', { out_of_scope: true })))
    await type('météo ?')
    await openViaAdvisor()
    for (const f of ['subject', 'description', 'first', 'last', 'email', 'phone', 'country']) {
      expect(handoffForm()!.querySelector(`[data-reco-input="handoff-${f}"]`)).not.toBeNull()
    }
    const events = (window.dataLayer ?? []).map((p) => p.event)
    expect(events).toContain('reco_advisor')
  })

  it('handoff_proposed : formulaire ouvert seul, pré-rempli par le brouillon et le profil', async () => {
    const spy = mockFetch(async (input: unknown) => {
      const url = urlOf(input)
      if (url.includes('/handoff/draft')) {
        return json({ subject: 'Sujet IA', description: 'Description IA', lang: 'fr' })
      }
      if (url.includes('/users/')) {
        return json({
          user_id: 'u',
          firstname: { value: 'Awa' },
          email: { value: 'awa@exemple.com' },
          country: { value: 'SN' }
        })
      }
      return ok(SSE('Je te mets en relation.', { session_id: 'sess-7', handoff_proposed: true }))
    })
    textarea().focus()
    await type('Je veux discuter avec un humain')
    await formReady()
    const field = (n: string) =>
      handoffForm()!.querySelector<HTMLInputElement>(`[data-reco-input="handoff-${n}"]`)!.value
    expect(field('subject')).toBe('Sujet IA')
    expect(field('description')).toBe('Description IA')
    expect(field('first')).toBe('Awa')
    expect(field('last')).toBe('')
    expect(field('email')).toBe('awa@exemple.com')
    expect(field('country')).toBe('Sénégal')
    expect(
      spy.mock.calls.some(([i]) => urlOf(i).endsWith('/conversations/sess-7/handoff/draft'))
    ).toBe(true)
    // Le CTA reste disponible sous la réponse ; le focus reste au composer.
    expect(assistantEntries().at(-2)!.querySelector('[data-reco-action="advisor"]')).not.toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(textarea()))
    // Ouverture automatique : pas de jalon « advisor » (aucun clic).
    expect((window.dataLayer ?? []).map((p) => p.event)).not.toContain('reco_advisor')
  })

  it('formulaire invalide : erreur affichée, champs marqués, rien n’est posté', async () => {
    const spy = mockFetch(async () => ok(SSE('Hors périmètre', { out_of_scope: true })))
    await type('x')
    await openViaAdvisor()
    const callsBefore = spy.mock.calls.length
    handoffForm()!.requestSubmit()
    await waitFor(() =>
      expect(el.querySelector<HTMLElement>('[data-reco-field="handoff-error"]')!.hidden).toBe(false)
    )
    expect(
      handoffForm()!
        .querySelector('[data-reco-input="handoff-subject"]')!
        .getAttribute('aria-invalid')
    ).toBe('true')
    expect(spy.mock.calls).toHaveLength(callsBefore)
  })

  it('sans handoff-url : PUT profil puis POST handoff complet, bulle confirm', async () => {
    const spy = mockFetch(async (input: unknown) => {
      const url = urlOf(input)
      if (url.includes('/users/') || url.includes('/handoff')) return ok('{}')
      return ok(SSE('Hors périmètre', { out_of_scope: true, session_id: 'sess-9' }))
    })
    await type('x')
    await openViaAdvisor()
    fillValid(handoffForm()!)
    handoffForm()!.requestSubmit()
    await waitFor(() =>
      expect(spy.mock.calls.some(([i]) => urlOf(i).endsWith('/conversations/sess-9/handoff'))).toBe(
        true
      )
    )
    const put = spy.mock.calls.find(
      ([i, init]) => urlOf(i).includes('/users/') && (init as { method?: string }).method === 'PUT'
    )!
    expect(JSON.parse((put[1] as { body: string }).body)).toEqual({
      firstname: 'Awa',
      lastname: 'Diop',
      email: 'awa@exemple.com',
      lang: 'fr'
    })
    const post = spy.mock.calls.find(([i]) => urlOf(i).endsWith('/conversations/sess-9/handoff'))!
    expect(JSON.parse((post[1] as { body: string }).body)).toEqual({
      first_name: 'Awa',
      last_name: 'Diop',
      email: 'awa@exemple.com',
      phone: '+221771234567',
      departure_country: 'Sénégal',
      subject: 'Mise en relation',
      description: 'Je souhaite parler à un conseiller.'
    })
    await waitFor(() =>
      expect(assistantEntries().at(-1)!.textContent).toContain('conseiller te contactera')
    )
    const events = (window.dataLayer ?? []).map((p) => p.event)
    expect(events).toContain('reco_handoff')
  })

  it('422 de l’API : le champ fautif est marqué, la saisie reste possible', async () => {
    mockFetch(async (input: unknown, init?: unknown) => {
      const url = urlOf(input)
      if (url.endsWith('/handoff')) {
        return {
          ok: false,
          status: 422,
          headers: new Headers(),
          json: async () => ({ detail: [{ loc: ['body', 'phone'], msg: 'invalid' }] })
        }
      }
      if (url.includes('/users/') && (init as { method?: string }).method === 'PUT') return ok('{}')
      if (url.includes('/users/') || url.includes('/draft')) return json(null)
      return ok(SSE('Hors périmètre', { out_of_scope: true, session_id: 'sess-4' }))
    })
    await type('x')
    await openViaAdvisor()
    fillValid(handoffForm()!)
    handoffForm()!.requestSubmit()
    const phone = () =>
      handoffForm()!.querySelector<HTMLInputElement>('[data-reco-input="handoff-phone"]')!
    await waitFor(() => expect(phone().getAttribute('aria-invalid')).toBe('true'))
    expect(phone().disabled).toBe(false)
    expect(el.querySelector<HTMLElement>('[data-reco-field="handoff-error"]')!.textContent).toBe(
      'Champs requis invalides.'
    )
  })

  it('sans session : le profil part quand même, aucun appel handoff', async () => {
    // Erreur 500 avant toute réponse → pas de session_id ; le CTA erreur
    // ouvre quand même le formulaire et PUT /users livre les coordonnées.
    const spy = mockFetch(async (input: unknown) => {
      const url = urlOf(input)
      if (url.includes('/users/')) return ok('{}')
      return { ok: false, status: 500, json: async () => null }
    })
    await type('x')
    await waitFor(() => expect(errorCard().hidden).toBe(false))
    errorCard().querySelector<HTMLElement>('[data-reco-action="advisor"]')!.click()
    await formReady()
    fillValid(handoffForm()!)
    handoffForm()!.requestSubmit()
    await waitFor(() =>
      expect(assistantEntries().at(-1)!.textContent).toContain('conseiller te contactera')
    )
    expect(spy.mock.calls.some(([i]) => urlOf(i).includes('/handoff'))).toBe(false)
  })

  it('avec handoff-url : POST JSON du formulaire complet puis confirmation', async () => {
    const extra = mountWidget(
      `${VALID_ATTRS} data-reco-handoff-url="https://api.studely.com/handoff"`
    )
    StudelyReco.init(extra)
    const consent2 = extra.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!
    consent2.checked = true
    consent2.dispatchEvent(new Event('change', { bubbles: true }))
    const spy = mockFetch(async (input: unknown) => {
      const url = urlOf(input)
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
    const form = () =>
      extra.querySelector<HTMLFormElement>('[data-reco-thread] [data-reco-handoff]')
    await formReady(form)
    fillValid(form()!)
    form()!.requestSubmit()
    await waitFor(() =>
      expect(spy.mock.calls.some(([i]) => urlOf(i) === 'https://api.studely.com/handoff')).toBe(
        true
      )
    )
    const post = spy.mock.calls.find(([i]) => urlOf(i) === 'https://api.studely.com/handoff')!
    expect(JSON.parse((post[1] as { body: string }).body)).toMatchObject({
      name: 'Awa Diop',
      first_name: 'Awa',
      last_name: 'Diop',
      email: 'awa@exemple.com',
      departure_country: 'Sénégal',
      subject: 'Mise en relation',
      origin: 'mexique'
    })
    await waitFor(() =>
      expect(extraEntries().at(-1)!.textContent).toContain('conseiller te contactera')
    )
  })
})

describe('question de fin de conversation', () => {
  const card = () => document.querySelector<HTMLElement>('[data-reco-conv-feedback]')
  const urlOf = (input: unknown) => (typeof input === 'string' ? input : (input as Request).url)

  /** Un échange avec session, puis fermeture (retrait de data-reco-open). */
  async function converseThenClose(): Promise<ReturnType<typeof mockFetch>> {
    const spy = mockFetch(async (input: unknown) =>
      urlOf(input).endsWith('/feedback') ? ok('{}') : ok(SSE('Réponse', { session_id: 's1' }))
    )
    await grant()
    el.setAttribute('data-reco-open', '')
    await type('Je cherche un master')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    el.removeAttribute('data-reco-open')
    return spy
  }

  it('après fermeture : étoiles → POST feedback (score 0-10) puis remerciement', async () => {
    const spy = await converseThenClose()
    await vi.waitFor(() => expect(card()).not.toBeNull(), { timeout: 2000 })
    const submit = card()!.querySelector<HTMLButtonElement>('[data-reco-submit]')!
    expect(submit.disabled).toBe(true)
    const stars = [...card()!.querySelectorAll<HTMLButtonElement>('[data-reco-star]')]
    expect(stars).toHaveLength(5)
    expect(stars[3]!.getAttribute('aria-label')).toBe('Satisfaisant (4/5)')
    // Survol : libellé de l'étoile ; sortie : retour à la note choisie.
    stars[0]!.dispatchEvent(new Event('mouseenter'))
    expect(card()!.querySelector('[data-reco-star-label]')!.textContent).toBe('Très décevant')
    stars[3]!.click()
    stars[3]!.dispatchEvent(new Event('focus'))
    stars[3]!.dispatchEvent(new Event('blur'))
    card()!.querySelector('[data-reco-stars]')!.dispatchEvent(new Event('mouseleave'))
    expect(card()!.querySelector('[data-reco-star-label]')!.textContent).toBe('Satisfaisant')
    expect(stars.map((s) => s.dataset.recoActive)).toEqual([
      'true',
      'true',
      'true',
      'true',
      'false'
    ])
    expect(submit.disabled).toBe(false)
    card()!.querySelector('textarea')!.value = '  Très clair  '
    submit.click()
    const post = spy.mock.calls.find(([i]) => urlOf(i).endsWith('/conversations/s1/feedback'))!
    expect(JSON.parse((post[1] as { body: string }).body)).toEqual({
      resolved: true,
      score: 8,
      comment: 'Très clair'
    })
    expect(card()!.textContent).toBe('Merci pour votre retour !')
    expect((window.dataLayer ?? []).map((p) => p.event)).toContain('reco_feedback')
    // Une seule question par session : refermer ne la repose pas.
    el.setAttribute('data-reco-open', '')
    el.removeAttribute('data-reco-open')
    await new Promise((r) => setTimeout(r, 700))
    expect(card()?.querySelector('[data-reco-star]') ?? null).toBeNull()
  })

  it('« Ignorer » ferme sans rien envoyer', async () => {
    const spy = await converseThenClose()
    await vi.waitFor(() => expect(card()).not.toBeNull(), { timeout: 2000 })
    card()!.querySelector<HTMLButtonElement>('[data-reco-dismiss]')!.click()
    expect(card()).toBeNull()
    expect(spy.mock.calls.some(([i]) => urlOf(i).endsWith('/s1/feedback'))).toBe(false)
  })

  it('réouverture rapide : la question n’apparaît pas', async () => {
    await converseThenClose()
    el.setAttribute('data-reco-open', '')
    await new Promise((r) => setTimeout(r, 700))
    expect(card()).toBeNull()
  })

  it('échec de l’envoi : remerciement quand même, avertissement console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockFetch(async (input: unknown) =>
      urlOf(input).endsWith('/feedback')
        ? { ok: false, status: 500, json: async () => null }
        : ok(SSE('Réponse', { session_id: 's1' }))
    )
    await grant()
    el.setAttribute('data-reco-open', '')
    await type('x')
    await waitFor(() => expect(assistantEntries().length).toBeGreaterThanOrEqual(2))
    el.removeAttribute('data-reco-open')
    await vi.waitFor(() => expect(card()).not.toBeNull(), { timeout: 2000 })
    card()!.querySelector<HTMLButtonElement>('[data-reco-star="2"]')!.click()
    card()!.querySelector<HTMLButtonElement>('[data-reco-submit]')!.click()
    expect(card()!.textContent).toBe('Merci pour votre retour !')
    await waitFor(() =>
      expect(warn.mock.calls.some((c) => String(c).includes('feedback conversation'))).toBe(true)
    )
  })
})
