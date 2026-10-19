import { nextState, RecoMachine, stepOf } from './machine'
import { RECO_EVENT } from '../tracking/events'
import { mountStepsWidget } from '../testing/widget.fixture'

afterEach(() => {
  document.body.replaceChildren()
})

describe('stepOf', () => {
  it('extrait le numéro des états step-N', () => {
    expect(stepOf('step-3')).toBe(3)
    expect(stepOf('intro')).toBeNull()
    expect(stepOf('loading')).toBeNull()
  })
})

describe('nextState — table du §4', () => {
  it('intro --start--> step-1', () => {
    expect(nextState('intro', 'start')).toBe('step-1')
  })

  it('chaîne next/back entre les étapes', () => {
    expect(nextState('step-1', 'next')).toBe('step-2')
    expect(nextState('step-4', 'next')).toBe('step-5')
    expect(nextState('step-5', 'next')).toBeNull()
    expect(nextState('step-3', 'back')).toBe('step-2')
    expect(nextState('step-1', 'back')).toBe('intro')
  })

  it('step-5 --submit--> loading puis réponses API', () => {
    expect(nextState('step-5', 'submit')).toBe('loading')
    expect(nextState('loading', 'results')).toBe('results')
    expect(nextState('loading', 'empty')).toBe('empty')
    expect(nextState('loading', 'error')).toBe('error')
  })

  it('edit depuis results ou empty revient à step-1', () => {
    expect(nextState('results', 'edit')).toBe('step-1')
    expect(nextState('empty', 'edit')).toBe('step-1')
    expect(nextState('step-3', 'edit')).toBeNull()
  })

  it('retry depuis error ou empty repart en loading', () => {
    expect(nextState('error', 'retry')).toBe('loading')
    expect(nextState('empty', 'retry')).toBe('loading')
    expect(nextState('results', 'retry')).toBeNull()
  })

  it('restart revient à intro depuis tout état', () => {
    expect(nextState('step-4', 'restart')).toBe('intro')
    expect(nextState('error', 'restart')).toBe('intro')
    expect(nextState('intro', 'restart')).toBeNull()
  })

  it('ignore toute transition non prévue', () => {
    expect(nextState('intro', 'next')).toBeNull()
    expect(nextState('intro', 'submit')).toBeNull()
    expect(nextState('results', 'start')).toBeNull()
    expect(nextState('error', 'error')).toBeNull()
    expect(nextState('loading', 'submit')).toBeNull()
  })
})

describe('RecoMachine — DOM', () => {
  it('pose data-reco-state et is-reco-active sur un seul panel', () => {
    const el = mountStepsWidget()
    const machine = new RecoMachine(el)

    expect(el.dataset.recoState).toBe('intro')
    const actifs = () => el.querySelectorAll('[data-reco-panel].is-reco-active')
    expect(actifs()).toHaveLength(1)
    expect(actifs()[0]!.getAttribute('data-reco-panel')).toBe('intro')

    machine.dispatch('start')
    expect(el.dataset.recoState).toBe('step-1')
    expect(actifs()[0]!.getAttribute('data-reco-panel')).toBe('steps')
    expect(el.querySelector('[data-reco-step="1"]')!.classList.contains('is-reco-active')).toBe(
      true
    )
    expect(el.querySelector('[data-reco-step="2"]')!.classList.contains('is-reco-active')).toBe(
      false
    )
  })

  it('le panel fallback ne reçoit jamais is-reco-active', () => {
    const el = mountStepsWidget()
    new RecoMachine(el)
    expect(
      el.querySelector('[data-reco-panel="fallback"]')!.classList.contains('is-reco-active')
    ).toBe(false)
  })

  it('émet studely:reco à chaque transition, rien sur une transition ignorée', () => {
    const el = mountStepsWidget()
    const machine = new RecoMachine(el)
    const seen: unknown[] = []
    el.addEventListener(RECO_EVENT, (e) => seen.push((e as CustomEvent).detail))

    machine.dispatch('start')
    machine.dispatch('submit') // ignorée : pas depuis step-1
    machine.dispatch('next')

    expect(seen).toEqual([
      { name: 'start', from: 'intro', to: 'step-1' },
      { name: 'next', from: 'step-1', to: 'step-2' }
    ])
  })

  it('goTo impose un état hors table (400 API → étape du champ)', () => {
    const el = mountStepsWidget()
    const machine = new RecoMachine(el, 'loading')
    machine.goTo('step-2')
    expect(machine.state).toBe('step-2')
    expect(el.dataset.recoState).toBe('step-2')
  })
})
