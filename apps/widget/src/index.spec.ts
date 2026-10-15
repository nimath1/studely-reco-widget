import pkg from '../package.json'

type IndexModule = typeof import('./index')

const VALID = 'data-reco-origin="mexique" data-reco-advisor-url="/mexique#contact"'

let observed: Element[] = []
let trigger: (isIntersecting: boolean) => void = () => undefined
let disconnect = vi.fn()

class FakeIntersectionObserver {
  constructor(
    callback: (entries: Array<{ isIntersecting: boolean }>) => void,
    readonly options: { rootMargin?: string }
  ) {
    trigger = (isIntersecting) => callback([{ isIntersecting }])
    disconnect = vi.fn()
    this.disconnect = disconnect
  }
  disconnect: () => void
  observe(el: Element) {
    observed.push(el)
  }
}

async function load(): Promise<IndexModule> {
  vi.resetModules()
  return import('./index')
}

beforeEach(() => {
  observed = []
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
    document.body.innerHTML = `<section data-reco-widget ${VALID}></section>`
    const el = document.querySelector<HTMLElement>('[data-reco-widget]')!

    document.documentElement.lang = 'ar'
    expect(init(el)?.locale).toBe('ar')
    expect(el.getAttribute('dir')).toBe('rtl')

    document.documentElement.lang = 'fr'
    init(el)
    expect(el.hasAttribute('dir')).toBe(false)
  })

  it('init laisse le fallback et avertit si la config est invalide', async () => {
    const { init } = await load()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    document.body.innerHTML = '<section data-reco-widget></section>'
    const el = document.querySelector<HTMLElement>('[data-reco-widget]')!

    expect(init(el)).toBeNull()
    expect(el.hasAttribute('data-reco-state')).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('bootstrap', () => {
  it('n’initialise un bloc qu’à son approche de l’écran (marge 200 px)', async () => {
    document.documentElement.lang = 'ar'
    document.body.innerHTML = `<section data-reco-widget ${VALID}></section>`
    const el = document.querySelector<HTMLElement>('[data-reco-widget]')!

    await load()
    expect(observed).toEqual([el])
    expect(el.hasAttribute('dir')).toBe(false)

    trigger(false)
    expect(el.hasAttribute('dir')).toBe(false)

    trigger(true)
    expect(el.getAttribute('dir')).toBe('rtl')
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('initialise immédiatement sans IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    Reflect.deleteProperty(window, 'IntersectionObserver')
    document.documentElement.lang = 'ar'
    document.body.innerHTML = `<section data-reco-widget ${VALID}></section>`

    await load()
    expect(document.querySelector('[data-reco-widget]')!.getAttribute('dir')).toBe('rtl')
  })

  it('attend DOMContentLoaded si le document est encore en chargement', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    document.body.innerHTML = `<section data-reco-widget ${VALID}></section>`

    await load()
    expect(observed).toEqual([])

    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(observed).toHaveLength(1)
  })
})
