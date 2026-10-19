import { ConfigError, readConfig, resolveLocale } from './config'

function widget(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement('section')
  el.setAttribute('data-reco-widget', '')
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  document.body.append(el)
  return el
}

const VALID = { 'data-reco-origin': 'mexique', 'data-reco-advisor-url': '/mexique#contact' }

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute('lang')
})

describe('resolveLocale', () => {
  it('lit <html lang> en priorité, sous-tag régional ignoré', () => {
    expect(resolveLocale('es-MX', 'de')).toBe('es')
  })

  it('ramène une langue html non supportée à fr, sans regarder l’attribut', () => {
    expect(resolveLocale('pt', 'de')).toBe('fr')
  })

  it('utilise data-reco-locale si <html lang> est absent', () => {
    expect(resolveLocale('', 'AR')).toBe('ar')
    expect(resolveLocale(null, 'en')).toBe('en')
  })

  it('replie sur fr en dernier recours', () => {
    expect(resolveLocale(undefined, undefined)).toBe('fr')
    expect(resolveLocale(undefined, 'xx')).toBe('fr')
  })
})

describe('readConfig', () => {
  it('lit origin, advisor-url et la locale du document', () => {
    document.documentElement.lang = 'de'
    expect(readConfig(widget(VALID))).toEqual({
      origin: 'mexique',
      advisorUrl: '/mexique#contact',
      locale: 'de',
      dir: 'ltr'
    })
  })

  it('passe en rtl pour l’arabe', () => {
    document.documentElement.lang = 'ar'
    expect(readConfig(widget(VALID)).dir).toBe('rtl')
  })

  it.each(['', 'Mexique', 'mexique/', 'a b', '-mexique'])(
    'rejette un origin invalide (%j)',
    (origin) => {
      expect(() => readConfig(widget({ ...VALID, 'data-reco-origin': origin }))).toThrow(
        new ConfigError('data-reco-origin')
      )
    }
  )

  it('rejette un origin absent', () => {
    expect(() => readConfig(widget({ 'data-reco-advisor-url': '/x' }))).toThrow(ConfigError)
  })

  it('rejette un advisor-url absent ou vide', () => {
    expect(() => readConfig(widget({ 'data-reco-origin': 'mexique' }))).toThrow(
      new ConfigError('data-reco-advisor-url')
    )
    expect(() => readConfig(widget({ ...VALID, 'data-reco-advisor-url': '  ' }))).toThrow(
      ConfigError
    )
  })
})
