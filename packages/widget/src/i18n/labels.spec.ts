import { readLabels } from './labels'
import { mountWidget } from '../testing/widget.fixture'

afterEach(() => {
  document.body.replaceChildren()
})

it('lit les libellés du bloc data-reco-labels', () => {
  const t = readLabels(mountWidget())
  expect(t('reco.error.required')).toBe('Champ requis')
})

it('interpole les {variables}', () => {
  const t = readLabels(mountWidget())
  expect(t('reco.progress', { step: 2, total: 5 })).toBe('Étape 2 sur 5')
})

it('renvoie la clé absente telle quelle, jamais de texte en dur', () => {
  const t = readLabels(mountWidget())
  expect(t('reco.inconnu')).toBe('reco.inconnu')
})
