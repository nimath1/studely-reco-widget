/**
 * États et transitions du widget (cahier des charges §4) : intro, step-1 à
 * step-5, loading, results, empty, error. L'état courant est exposé dans
 * `data-reco-state` sur le conteneur.
 */
import { emitRecoEvent } from '../tracking/events'

export const STEP_COUNT = 5

export type WidgetState = 'intro' | `step-${number}` | 'loading' | 'results' | 'empty' | 'error'

/**
 * Actions déclenchées par `data-reco-action` (start, next, back, submit,
 * edit, restart, retry) et par les réponses de l'API (results, empty, error).
 * `advisor` n'est pas une transition : le lien navigue dans tous les états.
 */
export type RecoAction =
  | 'start'
  | 'next'
  | 'back'
  | 'submit'
  | 'edit'
  | 'restart'
  | 'retry'
  | 'results'
  | 'empty'
  | 'error'

export interface RecoTransition {
  action: RecoAction
  from: WidgetState
  to: WidgetState
}

const STEP_PATTERN = /^step-(\d+)$/

/** Numéro d'étape d'un état `step-N`, `null` pour les autres états. */
export function stepOf(state: WidgetState): number | null {
  const match = STEP_PATTERN.exec(state)
  return match ? Number(match[1]) : null
}

/**
 * Table de transitions du §4 : toute action non prévue depuis l'état courant
 * est ignorée (`null`) — un double-clic ou un événement tardif ne peut pas
 * sortir le widget de son flot.
 */
export function nextState(state: WidgetState, action: RecoAction): WidgetState | null {
  // Recommencer vide le brouillon et revient à l'intro depuis tout état.
  if (action === 'restart') return state === 'intro' ? null : 'intro'

  const step = stepOf(state)
  switch (action) {
    case 'start':
      return state === 'intro' ? 'step-1' : null
    case 'back':
      if (step === null) return null
      return step > 1 ? `step-${step - 1}` : 'intro'
    case 'next':
      if (step === null || step >= STEP_COUNT) return null
      return `step-${step + 1}`
    case 'submit':
      return state === `step-${STEP_COUNT}` ? 'loading' : null
    // « Modifier mes réponses » : étape 1 avec le brouillon conservé (R5).
    case 'edit':
      return state === 'results' || state === 'empty' ? 'step-1' : null
    case 'retry':
      return state === 'error' || state === 'empty' ? 'loading' : null
    case 'results':
      return state === 'loading' ? 'results' : null
    case 'empty':
      return state === 'loading' ? 'empty' : null
    case 'error':
      return state === 'error' ? null : 'error'
  }
}

/**
 * Machine à états adossée au conteneur : `data-reco-state` reflète l'état,
 * un seul panel porte `is-reco-active` (le panel `steps` pour tous les
 * `step-N`, avec le fieldset courant marqué à son tour).
 */
export class RecoMachine {
  private current: WidgetState

  constructor(
    private readonly el: HTMLElement,
    initial: WidgetState = 'intro'
  ) {
    this.current = initial
    this.apply(initial)
  }

  get state(): WidgetState {
    return this.current
  }

  /** Transition par action : sans effet si le §4 ne la prévoit pas. */
  dispatch(action: RecoAction): WidgetState {
    const to = nextState(this.current, action)
    if (to === null) return this.current
    this.move(to, action)
    return to
  }

  /**
   * Transition pilotée par la réponse de l'API (§5.3 : un 400 sur
   * `profile.fields` ramène à l'étape du champ) — hors table, jamais exposée
   * à un `data-reco-action`.
   */
  goTo(state: WidgetState, name = 'error'): void {
    this.move(state, name)
  }

  private move(to: WidgetState, name: string): void {
    const from = this.current
    this.current = to
    this.apply(to)
    emitRecoEvent(this.el, name, { from, to })
  }

  private apply(state: WidgetState): void {
    this.el.dataset.recoState = state
    const step = stepOf(state)
    const panelName = step === null ? state : 'steps'
    this.el.querySelectorAll('[data-reco-panel]').forEach((panel) => {
      panel.classList.toggle(
        'is-reco-active',
        panel instanceof HTMLElement && panel.dataset.recoPanel === panelName
      )
    })
    this.el.querySelectorAll('[data-reco-step]').forEach((node) => {
      node.classList.toggle(
        'is-reco-active',
        step !== null && node instanceof HTMLElement && node.dataset.recoStep === String(step)
      )
    })
  }
}
