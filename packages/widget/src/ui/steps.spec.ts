import { mountStepsWidget } from '../testing/widget.fixture'
import { renderOptions } from './render'
import {
  applyAnswers,
  buildProfile,
  clearDraft,
  collectAnswers,
  DRAFT_KEY,
  emptyAnswers,
  loadDraft,
  saveDraft,
  showFieldError,
  stepOfField,
  updateStepChrome,
  validateStep,
  type Answers
} from './steps'
import { readLabels } from '../i18n/labels'
import type { RecoOptions } from '../api/types'

const OPTIONS: RecoOptions = {
  levels: [{ id: 'licence', label: 'Licence' }],
  fields: [
    { id: 'info', label: 'Informatique' },
    { id: 'droit', label: 'Droit' },
    { id: 'sante', label: 'Santé' },
    { id: 'art', label: 'Art' }
  ],
  destinations: [{ id: 'france', label: 'France' }],
  languages: [
    { id: 'fr', label: 'Français' },
    { id: 'en', label: 'Anglais' }
  ],
  languageLevels: [{ id: 'b2', label: 'B2' }],
  budgets: [{ id: 'lt10k', label: '< 10 k€' }],
  intakes: [{ id: 'sep', label: 'Septembre' }]
}

const FULL: Answers = {
  level: 'licence',
  fields: ['info', 'droit'],
  destinations: ['france'],
  languages: [{ language: 'fr', level: 'b2' }],
  budget: 'lt10k',
  intake: 'sep',
  goal: 'devenir ingénieur',
  consent: true
}

function t(el: HTMLElement) {
  return readLabels(el)
}

function check(el: HTMLElement, field: string, ...values: string[]) {
  el.querySelectorAll<HTMLInputElement>(`[data-reco-options="${field}"] input`).forEach((input) => {
    input.checked = values.includes(input.value)
  })
}

afterEach(() => {
  sessionStorage.clear()
  document.body.replaceChildren()
})

describe('collectAnswers / applyAnswers', () => {
  it('lit les choix rendus et les ré-applique', () => {
    const el = mountStepsWidget()
    renderOptions(el, OPTIONS)

    check(el, 'level', 'licence')
    check(el, 'fields', 'info', 'droit')
    check(el, 'destinations', 'france')
    el.querySelector<HTMLSelectElement>('[data-reco-value="fr"] select')!.value = 'b2'
    check(el, 'budget', 'lt10k')
    check(el, 'intake', 'sep')
    el.querySelector<HTMLTextAreaElement>('[data-reco-input="goal"]')!.value =
      '  devenir ingénieur '
    el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.checked = true

    expect(collectAnswers(el)).toEqual(FULL)

    reset(el)
    applyAnswers(el, FULL)
    expect(collectAnswers(el)).toEqual(FULL)
  })

  it('tronque goal à 300 caractères', () => {
    const el = mountStepsWidget()
    el.querySelector<HTMLTextAreaElement>('[data-reco-input="goal"]')!.value = 'x'.repeat(400)
    expect(collectAnswers(el).goal).toHaveLength(300)
  })

  function reset(el: HTMLElement) {
    el.querySelectorAll<HTMLInputElement>('input').forEach((i) => (i.checked = false))
    el.querySelectorAll<HTMLSelectElement>('select').forEach((s) => (s.value = ''))
    el.querySelector<HTMLTextAreaElement>('[data-reco-input="goal"]')!.value = ''
  }
})

describe('validateStep', () => {
  it('refuse une étape sans champ obligatoire, message sous le champ', () => {
    const el = mountStepsWidget()
    expect(validateStep(el, 1, emptyAnswers(), t(el))).toBe(false)
    expect(el.querySelector('[data-reco-error-for="level"]')!.textContent).toBe('Champ requis')
  })

  it('valide une étape remplie et efface le message', () => {
    const el = mountStepsWidget()
    showFieldError(el, 'level', 'Champ requis')
    expect(validateStep(el, 1, { ...emptyAnswers(), level: 'licence' }, t(el))).toBe(true)
    expect(el.querySelector('[data-reco-error-for="level"]')!.textContent).toBe('')
  })

  it('exige budget et intake à l’étape 5', () => {
    const el = mountStepsWidget()
    expect(validateStep(el, 5, { ...FULL, budget: '' }, t(el))).toBe(false)
    expect(validateStep(el, 5, FULL, t(el))).toBe(true)
  })

  it('bloque l’envoi sans consentement, message sous la case', () => {
    const el = mountStepsWidget()
    expect(validateStep(el, 5, { ...FULL, consent: false }, t(el), true)).toBe(false)
    expect(el.querySelector('[data-reco-error-for="consent"]')!.textContent).toBe(
      'Consentement requis'
    )
    expect(validateStep(el, 5, FULL, t(el), true)).toBe(true)
  })
})

describe('updateStepChrome', () => {
  it('met à jour progression, barre et boutons', () => {
    const el = mountStepsWidget()
    updateStepChrome(el, 1, t(el))
    expect(el.querySelector('[data-reco-progress]')!.textContent).toBe('Étape 1 sur 5')
    expect((el.querySelector('[data-reco-progress-bar]') as HTMLElement).style.width).toBe('20%')
    expect((el.querySelector('[data-reco-action="back"]') as HTMLElement).hidden).toBe(true)
    expect((el.querySelector('[data-reco-action="next"]') as HTMLElement).hidden).toBe(false)
    expect((el.querySelector('[data-reco-action="submit"]') as HTMLElement).hidden).toBe(true)

    updateStepChrome(el, 5, t(el))
    expect((el.querySelector('[data-reco-action="back"]') as HTMLElement).hidden).toBe(false)
    expect((el.querySelector('[data-reco-action="next"]') as HTMLElement).hidden).toBe(true)
    expect((el.querySelector('[data-reco-action="submit"]') as HTMLElement).hidden).toBe(false)
  })
})

describe('brouillon sessionStorage', () => {
  it('sauvegarde, recharge et efface sous studely.reco.draft', () => {
    saveDraft({ origin: 'mexique', step: 3, answers: FULL })
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeTruthy()
    expect(loadDraft('mexique')).toEqual({ origin: 'mexique', step: 3, answers: FULL })

    clearDraft()
    expect(loadDraft('mexique')).toBeNull()
  })

  it('ignore le brouillon d’une autre page (autre origin)', () => {
    saveDraft({ origin: 'bresil', step: 2, answers: FULL })
    expect(loadDraft('mexique')).toBeNull()
  })

  it('ignore un contenu corrompu', () => {
    sessionStorage.setItem(DRAFT_KEY, '{oops')
    expect(loadDraft('mexique')).toBeNull()
  })
})

describe('stepOfField / buildProfile', () => {
  it('mappe les champs du 400 vers leur étape', () => {
    expect(stepOfField('profile.fields')).toBe(2)
    expect(stepOfField('profile.languages.0.level')).toBe(4)
    expect(stepOfField('profile.budget')).toBe(5)
    expect(stepOfField('profile.origin')).toBeNull()
  })

  it('construit le payload profile, goal omis si vide', () => {
    expect(buildProfile(FULL)).toEqual({
      level: 'licence',
      fields: ['info', 'droit'],
      destinations: ['france'],
      languages: [{ language: 'fr', level: 'b2' }],
      budget: 'lt10k',
      intake: 'sep',
      goal: 'devenir ingénieur'
    })
    expect(buildProfile({ ...FULL, goal: '' })).not.toHaveProperty('goal')
  })
})
