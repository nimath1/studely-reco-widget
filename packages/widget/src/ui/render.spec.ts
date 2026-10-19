import { mountStepsWidget } from '../testing/widget.fixture'
import { renderOptions, renderResults, resetInputs } from './render'
import type { RecoOptions } from '../api/types'

const OPTIONS: RecoOptions = {
  levels: [
    { id: 'licence', label: 'Licence' },
    { id: 'master', label: '<b>Master</b>' }
  ],
  fields: [{ id: 'info', label: 'Informatique' }],
  destinations: [{ id: 'france', label: 'France' }],
  languages: [{ id: 'fr', label: 'Français' }],
  languageLevels: [{ id: 'b2', label: 'B2' }],
  budgets: [{ id: 'lt10k', label: '< 10 k€' }],
  intakes: [{ id: 'sep', label: 'Septembre' }]
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('renderOptions', () => {
  it('clone les templates et associe input ↔ label (id/for, name)', () => {
    const el = mountStepsWidget()
    renderOptions(el, OPTIONS)

    const radios = el.querySelectorAll<HTMLInputElement>('[data-reco-options="level"] input')
    expect(radios).toHaveLength(2)
    radios.forEach((input) => {
      expect(input.type).toBe('radio')
      expect(input.name).toBe('reco-level')
      expect(input.id).toBeTruthy()
      expect(input.closest('label')!.htmlFor).toBe(input.id)
    })

    const checks = el.querySelectorAll<HTMLInputElement>('[data-reco-options="fields"] input')
    expect(checks[0]!.type).toBe('checkbox')
    expect(checks[0]!.name).toBe('reco-fields')
    expect(checks[0]!.value).toBe('info')
  })

  it('affiche un libellé contenant du HTML en texte brut', () => {
    const el = mountStepsWidget()
    renderOptions(el, OPTIONS)
    const label = el.querySelectorAll('[data-reco-options="level"] [data-reco-field="label"]')[1]
    expect(label!.textContent).toBe('<b>Master</b>')
    expect(label!.querySelector('b')).toBeNull()
  })

  it('génère les lignes langue avec select de niveaux', () => {
    const el = mountStepsWidget()
    renderOptions(el, OPTIONS)
    const row = el.querySelector('[data-reco-options="languages"] [data-reco-value="fr"]')
    const select = row!.querySelector('select')!
    expect(row!.textContent).toContain('Français')
    expect([...select.options].map((o) => o.value)).toEqual(['', 'b2'])
  })

  it('ne dépend d’aucune classe Webflow', () => {
    const el = mountStepsWidget()
    el.querySelectorAll('[class]').forEach((node) => node.setAttribute('class', 'renamed'))
    renderOptions(el, OPTIONS)
    expect(el.querySelectorAll('[data-reco-options="level"] input')).toHaveLength(2)
  })
})

describe('renderResults', () => {
  it('remplit une carte par recommandation, href sur le lien', () => {
    const el = mountStepsWidget()
    renderResults(el, [
      {
        type: 'programme',
        title: 'Licence Info',
        destination: 'Lyon, France',
        reason: 'Profil <script>alert(1)</script> adapté',
        tags: ['info', 'public'],
        url: 'https://studely.com/p/1'
      },
      { title: 'Sans champs' }
    ])

    const cards = el.querySelectorAll('[data-reco-results] > article')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.querySelector('[data-reco-field="reason"]')!.textContent).toBe(
      'Profil <script>alert(1)</script> adapté'
    )
    expect(cards[0]!.querySelector('script')).toBeNull()
    expect(cards[0]!.querySelector<HTMLAnchorElement>('[data-reco-field="url"]')!.href).toBe(
      'https://studely.com/p/1'
    )
    expect(cards[0]!.querySelectorAll('[data-reco-field="tags"] li')).toHaveLength(2)
    expect(cards[0]!.querySelectorAll('[data-reco-template]')).toHaveLength(0)
  })
})

describe('resetInputs', () => {
  it('décoche tout et vide les saisies', () => {
    const el = mountStepsWidget()
    renderOptions(el, OPTIONS)
    el.querySelector<HTMLInputElement>('[data-reco-options="level"] input')!.checked = true
    el.querySelector<HTMLTextAreaElement>('[data-reco-input="goal"]')!.value = 'abc'
    el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.checked = true

    resetInputs(el)
    expect(el.querySelectorAll('[data-reco-options] input:checked')).toHaveLength(0)
    expect(el.querySelector<HTMLTextAreaElement>('[data-reco-input="goal"]')!.value).toBe('')
    expect(el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.checked).toBe(false)
  })
})
