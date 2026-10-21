/**
 * Vue réactive du bloc (petite-vue) : l'état d'affichage — envoi en
 * cours, consentement, annonces, erreur, verrou « Réessayer » — vit dans
 * un objet `reactive`, et le DOM Webflow le suit via des directives
 * posées ici à l'init. Le contrat des gabarits ne change pas : les
 * auteurs ne posent que des `data-reco-*`, jamais de directive Vue.
 *
 * Les mises à jour du DOM sont différées en microtâche : attendre
 * `nextTick` avant de lire ou de focaliser un élément qui vient d'être
 * affiché.
 */
import { createApp, reactive } from 'petite-vue'

export { nextTick } from 'petite-vue'

export interface ViewState {
  /** Un envoi /chat est en cours : saisie et boutons désactivés. */
  pending: boolean
  /** Consentement au traitement donné : déverrouille la saisie (§5.1). */
  consent: boolean
  /** Annonce lecteur d'écran (`[data-reco-live]`, §8.2). */
  live: string
  /** « Réessayer » désactivé pendant Retry-After (R9). */
  retryLocked: boolean
}

export interface View {
  state: ViewState
  /** Retire les effets réactifs ; le DOM reste en place. */
  unmount: () => void
}

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
  ['[data-reco-input="message"]', ':disabled', 'pending || !consent'],
  ['[data-reco-action="send"]', ':disabled', 'pending || !consent'],
  ['[data-reco-action="retry"]', ':disabled', 'retryLocked'],
  ['[data-reco-live]', 'v-text', 'live']
]

/**
 * Monte la vue sur `el`. Rendu initial synchrone ; appelable à nouveau
 * sur le même bloc après `unmount` (ré-init Webflow).
 */
export function mountView(el: HTMLElement): View {
  const text = (selector: string) => el.querySelector(selector)?.textContent ?? ''
  // Scope petite-vue et état exposé ne font qu'un : `createApp` réutilise
  // ce proxy tel quel, sans copie à synchroniser.
  const state: ViewState & Record<string, unknown> = reactive({
    pending: false,
    // La case peut être pré-cochée dans un gabarit hôte complet.
    consent: el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')?.checked === true,
    live: text('[data-reco-live]'),
    retryLocked: false,
    $delimiters: DELIMITERS
  })

  for (const [selector, directive, expression] of BINDINGS) {
    el.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      node.setAttribute(directive, expression)
    })
  }

  const app = createApp(state).mount(el)
  return { state, unmount: () => app.unmount() }
}
