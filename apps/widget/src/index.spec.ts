import pkg from '../package.json'
import { API_BASE_URL } from './api/client'

type IndexModule = typeof import('./index')

const VALID = 'data-reco-origin="mexique" data-reco-advisor-url="/mexique#contact"'

/** IntersectionObserver factice : comme le vrai, il se tait une fois déconnecté. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  readonly targets: Element[] = []
  connected = true

  constructor(
    private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void,
    readonly options: { rootMargin?: string }
  ) {
    FakeIntersectionObserver.instances.push(this)
  }

  observe(el: Element) {
    this.targets.push(el)
  }

  disconnect() {
    this.connected = false
  }

  trigger(isIntersecting: boolean) {
    if (this.connected) this.callback([{ isIntersecting }])
  }

  static for(el: Element): FakeIntersectionObserver {
    const found = FakeIntersectionObserver.instances.find((o) => o.targets.includes(el))
    if (!found) throw new Error('aucun observer pour cet élément')
    return found
  }
}

async function load(): Promise<IndexModule> {
  vi.resetModules()
  return import('./index')
}

function mount(html: string): HTMLElement[] {
  document.body.innerHTML = html
  return [...document.querySelectorAll<HTMLElement>('[data-reco-widget]')]
}

beforeEach(() => {
  FakeIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
  document.documentElement.removeAttribute('lang')
})

describe('API publique', () => {
  it('expose la version du package', async () => {
    const { version } = await load()
    expect(version).toBe(pkg.version)
  })

  it('init pose dir="rtl" en arabe et le retire sinon', async () => {
    const { init } = await load()
    const [el] = mount(`<section data-reco-widget ${VALID}></section>`)

    document.documentElement.lang = 'ar'
    expect(init(el!)?.locale).toBe('ar')
    expect(el!.getAttribute('dir')).toBe('rtl')

    document.documentElement.lang = 'fr'
    init(el!)
    expect(el!.hasAttribute('dir')).toBe(false)
  })

  it('sans data-reco-origin : reste sur le fallback avec une erreur console claire', async () => {
    const { init } = await load()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const [el] = mount('<section data-reco-widget data-reco-advisor-url="/x"></section>')

    expect(init(el!)).toBeNull()
    expect(el!.hasAttribute('data-reco-state')).toBe(false)
    expect(error).toHaveBeenCalledOnce()
    expect(error.mock.calls[0]).toEqual([
      '[studely-reco]',
      'Attribut data-reco-origin absent ou invalide',
      '— le bloc reste sur le panel fallback.',
      el
    ])
  })

  it('réinitialise sans doublon : les écouteurs précédents sont retirés', async () => {
    const { init } = await load()
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    const [el] = mount(`<section data-reco-widget ${VALID}></section>`)

    init(el!)
    expect(abort).not.toHaveBeenCalled()

    init(el!)
    init(el!)
    expect(abort).toHaveBeenCalledTimes(2)
  })

  it('retire aussi les écouteurs si la nouvelle config est invalide', async () => {
    const { init } = await load()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    const [el] = mount(`<section data-reco-widget ${VALID}></section>`)

    init(el!)
    el!.removeAttribute('data-reco-origin')
    expect(init(el!)).toBeNull()
    expect(abort).toHaveBeenCalledOnce()

    // Rien à retirer : la config invalide n'a pas posé d'écouteurs.
    init(el!)
    expect(abort).toHaveBeenCalledOnce()
  })
})

describe('bootstrap', () => {
  it('n’initialise un bloc qu’à son approche de l’écran (marge 200 px)', async () => {
    document.documentElement.lang = 'ar'
    const [el] = mount(`<section data-reco-widget ${VALID}></section>`)

    await load()
    const observer = FakeIntersectionObserver.for(el!)
    expect(observer.options.rootMargin).toBe('200px')
    expect(el!.hasAttribute('dir')).toBe(false)

    observer.trigger(false)
    expect(el!.hasAttribute('dir')).toBe(false)

    observer.trigger(true)
    expect(el!.getAttribute('dir')).toBe('rtl')
    expect(observer.connected).toBe(false)
  })

  it('initialise deux widgets d’une même page indépendamment', async () => {
    document.documentElement.lang = 'ar'
    const [first, second] = mount(
      `<section data-reco-widget ${VALID}></section>
       <section data-reco-widget data-reco-origin="bresil" data-reco-advisor-url="/bresil#contact"></section>`
    )

    await load()
    expect(FakeIntersectionObserver.instances).toHaveLength(2)

    FakeIntersectionObserver.for(second!).trigger(true)
    expect(second!.getAttribute('dir')).toBe('rtl')
    expect(first!.hasAttribute('dir')).toBe(false)
    expect(FakeIntersectionObserver.for(first!).connected).toBe(true)

    FakeIntersectionObserver.for(first!).trigger(true)
    expect(first!.getAttribute('dir')).toBe('rtl')
  })

  it('un init manuel annule l’initialisation différée en attente', async () => {
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    const [el] = mount(`<section data-reco-widget ${VALID}></section>`)

    const { init } = await load()
    const observer = FakeIntersectionObserver.for(el!)
    init(el!)

    expect(observer.connected).toBe(false)
    observer.trigger(true)
    expect(abort).not.toHaveBeenCalled()
  })

  it('initialise immédiatement sans IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    document.documentElement.lang = 'ar'
    const [el] = mount(`<section data-reco-widget ${VALID}></section>`)

    await load()
    expect(el!.getAttribute('dir')).toBe('rtl')
  })

  it('attend DOMContentLoaded si le document est encore en chargement', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    mount(`<section data-reco-widget ${VALID}></section>`)

    await load()
    expect(FakeIntersectionObserver.instances).toHaveLength(0)

    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
  })
})

describe('URL de l’API', () => {
  it('vient de VITE_RECO_API_URL, fixée au build', () => {
    expect(API_BASE_URL).toBe(import.meta.env.VITE_RECO_API_URL)
    expect(API_BASE_URL).toMatch(/^https:\/\//)
  })

  it('n’est lisible dans aucun attribut de la page après initialisation', async () => {
    const { init } = await load()
    const [el] = mount(`<section data-reco-widget ${VALID}></section>`)
    init(el!)

    const attributes = [...document.querySelectorAll('*')].flatMap((node) =>
      [...node.attributes].map((attr) => attr.value)
    )
    expect(attributes.some((value) => value.includes(API_BASE_URL))).toBe(false)
  })
})
