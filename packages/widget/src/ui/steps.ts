/**
 * Logique des 5 étapes du questionnaire et validation à la sortie de chaque
 * étape (§5.1).
 */
import type { LanguagePair, RecoProfile } from '../api/types'
import { readConsent } from '../consent/consent'
import type { Translate } from '../i18n/labels'
import { STEP_COUNT } from '../state/machine'
import { scrubPersonalData } from '../utils/pii.util'

export const DRAFT_KEY = 'studely.reco.draft'
export const MAX_FIELDS = 3
export const MAX_GOAL_LENGTH = 300

export interface Answers {
  level: string
  fields: string[]
  destinations: string[]
  languages: LanguagePair[]
  budget: string
  intake: string
  goal: string
  consent: boolean
}

export interface Draft {
  /** Le brouillon ne se restaure que sur la page qui l'a écrit (R6). */
  origin: string
  step: number
  answers: Answers
}

export function emptyAnswers(): Answers {
  return {
    level: '',
    fields: [],
    destinations: [],
    languages: [],
    budget: '',
    intake: '',
    goal: '',
    consent: false
  }
}

function checkedValues(el: HTMLElement, field: string): string[] {
  return [
    ...el.querySelectorAll<HTMLInputElement>(`[data-reco-options="${field}"] input:checked`)
  ].map((input) => input.value)
}

/** Lit le questionnaire tel qu'affiché — source de vérité : le DOM. */
export function collectAnswers(el: HTMLElement): Answers {
  const languages: LanguagePair[] = []
  el.querySelectorAll<HTMLElement>('[data-reco-options="languages"] [data-reco-value]').forEach(
    (row) => {
      const level = row.querySelector<HTMLSelectElement>('select')?.value
      if (level) languages.push({ language: row.dataset.recoValue!, level })
    }
  )
  const goal = el.querySelector<HTMLTextAreaElement>('[data-reco-input="goal"]')
  return {
    level: checkedValues(el, 'level')[0] ?? '',
    fields: checkedValues(el, 'fields'),
    destinations: checkedValues(el, 'destinations'),
    languages,
    budget: checkedValues(el, 'budget')[0] ?? '',
    intake: checkedValues(el, 'intake')[0] ?? '',
    goal: (goal?.value ?? '').slice(0, MAX_GOAL_LENGTH).trim(),
    consent: readConsent(el)
  }
}

/** Rejoue un brouillon dans le DOM — après le rendu des options. */
export function applyAnswers(el: HTMLElement, answers: Answers): void {
  const check = (field: string, values: string[]) => {
    el.querySelectorAll<HTMLInputElement>(`[data-reco-options="${field}"] input`).forEach(
      (input) => {
        input.checked = values.includes(input.value)
      }
    )
  }
  check('level', [answers.level])
  check('fields', answers.fields)
  check('destinations', answers.destinations)
  check('budget', [answers.budget])
  check('intake', [answers.intake])
  el.querySelectorAll<HTMLElement>('[data-reco-options="languages"] [data-reco-value]').forEach(
    (row) => {
      const select = row.querySelector<HTMLSelectElement>('select')
      const saved = answers.languages.find((l) => l.language === row.dataset.recoValue)
      if (select && saved) select.value = saved.level
    }
  )
  const goal = el.querySelector<HTMLTextAreaElement>('[data-reco-input="goal"]')
  if (goal) goal.value = answers.goal
  // Le consentement n'est jamais restauré : la case n'est pré-cochée dans
  // aucun cas, même après rechargement (R15, §9.1).
  const consent = el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')
  if (consent) consent.checked = false
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString)

/** Full runtime shape of `Answers`: a tampered draft must neither crash
    nor restore values of an unexpected type. */
function isAnswers(value: unknown): value is Answers {
  if (typeof value !== 'object' || value === null) return false
  const answers = value as Record<string, unknown>
  return (
    isString(answers.level) &&
    isString(answers.budget) &&
    isString(answers.intake) &&
    isString(answers.goal) &&
    isStringArray(answers.fields) &&
    isStringArray(answers.destinations) &&
    Array.isArray(answers.languages) &&
    answers.languages.every(
      (pair) =>
        typeof pair === 'object' &&
        pair !== null &&
        isString((pair as Record<string, unknown>).language) &&
        isString((pair as Record<string, unknown>).level)
    ) &&
    typeof answers.consent === 'boolean'
  )
}

/**
 * Draft of the current page only: another `origin`, valid JSON with an
 * unexpected shape, or a step outside 1..5 is ignored — option ids are
 * NOT validated (the catalogue may evolve).
 */
export function loadDraft(origin: string): Draft | null {
  try {
    const raw = storage()?.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Partial<Draft>
    if (draft.origin !== origin) return null
    if (
      !Number.isInteger(draft.step) ||
      (draft.step as number) < 1 ||
      (draft.step as number) > STEP_COUNT
    ) {
      return null
    }
    if (!isAnswers(draft.answers)) return null
    return draft as Draft
  } catch {
    return null
  }
}

export function saveDraft(draft: Draft): void {
  try {
    storage()?.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Mode privé / quota : la sauvegarde reste un confort.
  }
}

export function clearDraft(): void {
  try {
    storage()?.removeItem(DRAFT_KEY)
  } catch {
    // Idem.
  }
}

/** Champs exigés pour quitter chaque étape (§5.1 ; consentement au submit). */
const REQUIRED: Record<number, (keyof Answers)[]> = {
  1: ['level'],
  2: ['fields'],
  3: ['destinations'],
  4: ['languages'],
  5: ['budget', 'intake']
}

function isEmpty(answers: Answers, field: keyof Answers): boolean {
  const value = answers[field]
  return Array.isArray(value) ? value.length === 0 : !value
}

// Ids uniques des messages d'erreur (aria-describedby) — deux widgets d'une
// même page ne doivent pas partager le même id.
let errorUid = 0

/** Champs contrôlés par le slot d'erreur de `field` (options ou input dédié). */
function fieldControls(el: HTMLElement, field: string): HTMLElement[] {
  return [
    ...el.querySelectorAll<HTMLElement>(
      `[data-reco-options="${field}"] :is(input, select, textarea), [data-reco-input="${field}"]`
    )
  ]
}

export function showFieldError(el: HTMLElement, field: string, message: string): void {
  const slot = el.querySelector<HTMLElement>(`[data-reco-error-for="${field}"]`)
  if (!slot) return
  slot.textContent = message
  if (!slot.id) slot.id = `reco-err-${++errorUid}-${field}`
  fieldControls(el, field).forEach((control) => {
    control.setAttribute('aria-invalid', 'true')
    control.setAttribute('aria-describedby', slot.id)
  })
}

export function clearFieldError(el: HTMLElement, field: string): void {
  const slot = el.querySelector<HTMLElement>(`[data-reco-error-for="${field}"]`)
  if (slot) slot.textContent = ''
  fieldControls(el, field).forEach((control) => {
    control.removeAttribute('aria-invalid')
    control.removeAttribute('aria-describedby')
  })
}

/**
 * Valide l'étape `step` : chaque champ manquant reçoit le message sous son
 * champ (`data-reco-error-for`). `withConsent` ajoute la case obligatoire.
 */
export function validateStep(
  el: HTMLElement,
  step: number,
  answers: Answers,
  t: Translate,
  withConsent = false
): boolean {
  let ok = true
  for (const field of REQUIRED[step] ?? []) {
    clearFieldError(el, field)
    if (isEmpty(answers, field)) {
      showFieldError(el, field, t('reco.error.required'))
      ok = false
    }
  }
  if (step === STEP_COUNT && withConsent) {
    clearFieldError(el, 'consent')
    if (!answers.consent) {
      showFieldError(el, 'consent', t('reco.error.consent'))
      ok = false
    }
  }
  return ok
}

/**
 * Chrome de l'étape courante : « Étape x sur 5 », barre de progression,
 * Retour masqué à l'étape 1, « Voir mes recommandations » à l'étape 5.
 */
export function updateStepChrome(
  el: HTMLElement,
  step: number,
  t: Translate,
  formatNumber: (value: number) => string = String
): void {
  const progress = el.querySelector('[data-reco-progress]')
  if (progress) {
    progress.textContent = t('reco.progress', {
      step: formatNumber(step),
      total: formatNumber(STEP_COUNT)
    })
  }
  const bar = el.querySelector<HTMLElement>('[data-reco-progress-bar]')
  if (bar) bar.style.width = `${(step / STEP_COUNT) * 100}%`

  const action = (name: string) => el.querySelector<HTMLElement>(`[data-reco-action="${name}"]`)
  const back = action('back')
  const next = action('next')
  const submit = action('submit')
  if (back) back.hidden = step <= 1
  if (next) next.hidden = step >= STEP_COUNT
  if (submit) submit.hidden = step < STEP_COUNT
}

/**
 * Étape du champ fautif renvoyé par un 400 (`profile.fields` → 2, §5.3).
 */
export function stepOfField(field: string): number | null {
  const name = field.replace(/^profile\./, '').split('.')[0] ?? ''
  const steps: Record<string, number> = {
    level: 1,
    fields: 2,
    destinations: 3,
    languages: 4,
    budget: 5,
    intake: 5,
    goal: 5,
    consent: 5
  }
  return steps[name] ?? null
}

/**
 * Payload `profile` du §6.1 : `goal` omis s'il est vide, et nettoyé des
 * données personnelles évidentes avant envoi (minimisation RGPD, §9.1) —
 * le hint sous le champ déconseille déjà d'en saisir.
 */
export function buildProfile(answers: Answers): RecoProfile {
  const goal = answers.goal ? scrubPersonalData(answers.goal) : ''
  return {
    level: answers.level,
    fields: answers.fields,
    destinations: answers.destinations,
    languages: answers.languages,
    budget: answers.budget,
    intake: answers.intake,
    ...(goal ? { goal } : {})
  }
}
