import { readLabels } from '../i18n/labels'
import { mountStepsWidget } from '../testing/widget.fixture'
import { mountView, nextTick } from './view'

afterEach(() => {
  document.body.replaceChildren()
})

const q = <T extends HTMLElement = HTMLElement>(el: HTMLElement, selector: string) =>
  el.querySelector<T>(selector)!

const activePanels = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-reco-panel].is-reco-active')].map((panel) =>
    panel.getAttribute('data-reco-panel')
  )

describe('mountView — panels et étapes', () => {
  it('rend l’état initial de façon synchrone : un seul panel actif', () => {
    const el = mountStepsWidget()
    mountView(el, readLabels(el))
    expect(activePanels(el)).toEqual(['intro'])
    expect(q(el, '[data-reco-panel="fallback"]').classList.contains('is-reco-active')).toBe(false)
  })

  it('suit l’état après nextTick : panel steps et fieldset courant', async () => {
    const el = mountStepsWidget()
    const { state } = mountView(el, readLabels(el))

    state.state = 'step-3'
    state.step = 3
    await nextTick()

    expect(activePanels(el)).toEqual(['steps'])
    const activeSteps = [...el.querySelectorAll('[data-reco-step].is-reco-active')]
    expect(activeSteps.map((node) => node.getAttribute('data-reco-step'))).toEqual(['3'])

    state.state = 'results'
    await nextTick()
    expect(activePanels(el)).toEqual(['results'])
    expect(el.querySelectorAll('[data-reco-step].is-reco-active')).toHaveLength(0)
  })

  it('garde les classes Webflow du gabarit', async () => {
    const el = mountStepsWidget()
    q(el, '[data-reco-panel="intro"]').classList.add('w-panel')
    const { state } = mountView(el, readLabels(el))

    expect(q(el, '[data-reco-panel="intro"]').className).toBe('w-panel is-reco-active')
    state.state = 'loading'
    await nextTick()
    expect(q(el, '[data-reco-panel="intro"]').className).toBe('w-panel')
  })
})

describe('mountView — chrome des étapes', () => {
  it('progression, barre et boutons suivent l’étape', async () => {
    const el = mountStepsWidget()
    const { state } = mountView(el, readLabels(el), String, 'step-1')
    const hidden = (action: string) => q(el, `[data-reco-action="${action}"]`).hidden

    expect(q(el, '[data-reco-progress]').textContent).toBe('Étape 1 sur 5')
    expect(q(el, '[data-reco-progress-bar]').style.width).toBe('20%')
    expect([hidden('back'), hidden('next'), hidden('submit')]).toEqual([true, false, true])

    state.state = 'step-5'
    state.step = 5
    await nextTick()
    expect(q(el, '[data-reco-progress]').textContent).toBe('Étape 5 sur 5')
    expect(q(el, '[data-reco-progress-bar]').style.width).toBe('100%')
    expect([hidden('back'), hidden('next'), hidden('submit')]).toEqual([false, true, false])
  })

  it('formate les nombres de la progression dans la locale', () => {
    const el = mountStepsWidget()
    mountView(el, readLabels(el), (n) => `#${n}`, 'step-2')
    expect(q(el, '[data-reco-progress]').textContent).toBe('Étape #2 sur #5')
  })
})

describe('mountView — annonces, erreur, Réessayer', () => {
  it('reflète live, errorMessage et retryLocked', async () => {
    const el = mountStepsWidget()
    const { state } = mountView(el, readLabels(el))

    state.live = 'Recherche en cours…'
    state.errorMessage = 'Serveur'
    state.retryLocked = true
    await nextTick()

    expect(q(el, '[data-reco-live]').textContent).toBe('Recherche en cours…')
    expect(q(el, '[data-reco-error-message]').textContent).toBe('Serveur')
    expect(q<HTMLButtonElement>(el, '[data-reco-action="retry"]').disabled).toBe(true)
  })

  it('conserve le texte déjà présent dans le gabarit', () => {
    const el = mountStepsWidget()
    q(el, '[data-reco-error-message]').textContent = 'Texte Webflow'
    const { state } = mountView(el, readLabels(el))
    expect(state.errorMessage).toBe('Texte Webflow')
    expect(q(el, '[data-reco-error-message]').textContent).toBe('Texte Webflow')
  })
})

describe('mountView — sûreté et cycle de vie', () => {
  it('n’évalue pas les {{ }} saisis dans le gabarit', () => {
    const el = mountStepsWidget()
    q(el, '[data-reco-panel="intro"]').append('{{ 1 + 1 }}')
    mountView(el, readLabels(el))
    expect(q(el, '[data-reco-panel="intro"]').textContent).toContain('{{ 1 + 1 }}')
  })

  it('n’exécute jamais une valeur data-reco-* comme du code', () => {
    const el = mountStepsWidget()
    const pwned = vi.fn()
    ;(globalThis as Record<string, unknown>).pwned = pwned
    q(el, '[data-reco-panel="loading"]').dataset.recoPanel = "x' || pwned() || '"
    mountView(el, readLabels(el))
    expect(pwned).not.toHaveBeenCalled()
    delete (globalThis as Record<string, unknown>).pwned
  })

  it('unmount fige le DOM ; un remontage repart sans classe résiduelle', async () => {
    const el = mountStepsWidget()
    const first = mountView(el, readLabels(el))
    first.unmount()
    first.state.state = 'loading'
    await nextTick()
    expect(activePanels(el)).toEqual(['intro'])

    const second = mountView(el, readLabels(el), String, 'error')
    expect(activePanels(el)).toEqual(['error'])
    second.state.state = 'results'
    await nextTick()
    expect(activePanels(el)).toEqual(['results'])
  })
})
