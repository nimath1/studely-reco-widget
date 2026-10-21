import { readLabels } from './labels'
import { mountWidget } from '../testing/widget.fixture'

afterEach(() => {
  document.body.replaceChildren()
})

it('lit les libellés du bloc data-reco-labels', () => {
  const t = readLabels(mountWidget())
  expect(t('reco.error.consent')).toBe('Consentement requis')
})

it('interpole les {variables}', () => {
  const t = readLabels(mountWidget())
  expect(t('reco.results.count', { count: 3 })).toBe('3 recommandations')
})

it('clé absente : console.warn nommant la clé, repli FR si disponible', () => {
  const el = mountWidget()
  el.insertAdjacentHTML(
    'beforeend',
    '<span data-reco-label-fr="reco.fallback">Repli français</span>'
  )
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const t = readLabels(el)

  expect(t('reco.fallback')).toBe('Repli français')
  expect(warn).toHaveBeenCalledWith('[studely-reco]', 'clé i18n absente :', 'reco.fallback')

  expect(t('reco.inconnu')).toBe('reco.inconnu')
  expect(warn).toHaveBeenCalledWith('[studely-reco]', 'clé i18n absente :', 'reco.inconnu')
})
