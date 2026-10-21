/**
 * Vue réactive du bloc (petite-vue) : l'état d'affichage — panel actif,
 * étape, progression, boutons, annonces, erreur, verrou « Réessayer » —
 * vit dans un objet `reactive`, et le DOM Webflow le suit via des
 * directives posées ici à l'init. Le contrat des gabarits ne change pas :
 * les auteurs ne posent que des `data-reco-*`, jamais de directive Vue.
 *
 * Les mises à jour du DOM sont différées en microtâche : attendre
 * `nextTick` avant de lire ou de focaliser un élément qui vient d'être
 * affiché.
 */
import { createApp, nextTick, reactive } from 'petite-vue'
import type { Translate } from '../i18n/labels'
import { STEP_COUNT, stepOf, type WidgetState } from '../state/machine'

export { nextTick }

export interface ViewState {
  state: WidgetState
  /** Dernière étape affichée : la progression la garde hors questionnaire. */
  step: number
  /** Annonce lecteur d'écran (`[data-reco-live]`, §8.2). */
  live: string
  /** Message du panel `error`. */
  errorMessage: string
  /** « Réessayer » désactivé pendant Retry-After (R9). */
  retryLocked: boolean
}

export interface View {
  state: ViewState
  /** Retire les effets réactifs ; le DOM reste en place. */
  unmount: () => void
}

const ACTIVE = 'is-reco-active'

/**
 * Délimiteurs d'interpolation volontairement improbables : petite-vue lit
 * tout le texte du bloc, et un `{{ … }}` saisi dans Webflow ne doit
 * jamais être évalué.
 */
const DELIMITERS: [string, string] = ['[[studely-reco:', ']]']

/**
 * Directives posées sur les éléments du gabarit. Les expressions ne
 * contiennent jamais de valeur venue du DOM : `$el` est lu par les
 * fonctions du scope, pas concaténé dans le code évalué.
 */
const BINDINGS: [selector: string, directive: string, expression: string][] = [
  ['[data-reco-panel]', ':class', `{ '${ACTIVE}': isPanel($el) }`],
  ['[data-reco-step]', ':class', `{ '${ACTIVE}': isStep($el) }`],
  ['[data-reco-progress]', 'v-text', 'progress()'],
  ['[data-reco-progress-bar]', ':style', '{ width: (step / total) * 100 + "%" }'],
  ['[data-reco-action="back"]', ':hidden', 'step <= 1'],
  ['[data-reco-action="next"]', ':hidden', 'step >= total'],
  ['[data-reco-action="submit"]', ':hidden', 'step < total'],
  ['[data-reco-action="retry"]', ':disabled', 'retryLocked'],
  ['[data-reco-live]', 'v-text', 'live'],
  ['[data-reco-error-message]', 'v-text', 'errorMessage']
]

/**
 * Monte la vue sur `el` dans l'état `initial`. Rendu initial synchrone ;
 * appelable à nouveau sur le même bloc après `unmount` (ré-init Webflow).
 */
export function mountView(
  el: HTMLElement,
  t: Translate,
  formatNumber: (value: number) => string = String,
  initial: WidgetState = 'intro'
): View {
  const text = (selector: string) => el.querySelector(selector)?.textContent ?? ''
  // Scope petite-vue et état exposé ne font qu'un : `createApp` réutilise
  // ce proxy tel quel, sans copie à synchroniser.
  const state: ViewState & Record<string, unknown> = reactive({
    state: initial,
    step: stepOf(initial) ?? 1,
    // Le texte déjà présent dans le gabarit reste affiché jusqu'au premier changement.
    live: text('[data-reco-live]'),
    errorMessage: text('[data-reco-error-message]'),
    retryLocked: false,
    $delimiters: DELIMITERS,
    total: STEP_COUNT,
    isPanel: ($el: HTMLElement) => {
      const step = stepOf(state.state)
      return $el.dataset.recoPanel === (step === null ? state.state : 'steps')
    },
    isStep: ($el: HTMLElement) =>
      stepOf(state.state) !== null && $el.dataset.recoStep === String(state.step),
    progress: () =>
      t('reco.progress', { step: formatNumber(state.step), total: formatNumber(STEP_COUNT) })
  })

  for (const [selector, directive, expression] of BINDINGS) {
    el.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      // petite-vue mémorise la classe statique au montage : une classe
      // posée par un montage précédent ne doit pas devenir permanente.
      if (directive === ':class') {
        node.classList.remove(ACTIVE)
        delete (node as { _class?: string })._class
      }
      node.setAttribute(directive, expression)
    })
  }

  const app = createApp(state).mount(el)
  return { state, unmount: () => app.unmount() }
}
