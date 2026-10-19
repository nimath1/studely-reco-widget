import { describe, expect, it } from 'vitest'
import { renderConversation } from './conversation'

/**
 * Minimal DOM matching the `[data-reco-*]` contract: one fieldset per
 * step, options rendered like the templates (label > input + span
 * [data-reco-field="label"]) and language rows `[data-reco-value]`.
 */
function choice(value: string, label: string, checked: boolean): string {
  return `<label><input type="checkbox" value="${value}" ${checked ? 'checked' : ''}/><span data-reco-field="label">${label}</span></label>`
}

function languageRow(
  value: string,
  label: string,
  levels: { id: string; label: string }[],
  selected = ''
): string {
  const options = ['<option value=""></option>']
    .concat(
      levels.map(
        (l) => `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${l.label}</option>`
      )
    )
    .join('')
  return `<div data-reco-value="${value}"><span data-reco-field="label">${label}</span><select>${options}</select></div>`
}

interface WidgetOptions {
  history?: boolean
  markupLabel?: boolean
}

function widget(options: WidgetOptions = {}): HTMLElement {
  const el = document.createElement('section')
  el.innerHTML = `
    <form>
      ${options.history === false ? '' : '<div data-reco-history></div>'}
      <fieldset data-reco-step="1">
        <legend>Quel est ton niveau ?</legend>
        <div data-reco-options="level">
          ${choice('bac', 'Bac', true)}
          ${choice('licence', 'Licence', false)}
        </div>
      </fieldset>
      <fieldset data-reco-step="2">
        <legend>Quels domaines ?</legend>
        <div data-reco-options="fields">
          ${choice('gestion', options.markupLabel ? '&lt;b&gt;Gestion&lt;/b&gt;' : 'Gestion', true)}
          ${choice('info', 'Informatique', false)}
        </div>
      </fieldset>
      <fieldset data-reco-step="3">
        <legend>Dans quels pays ?</legend>
        <div data-reco-options="destinations">
          ${choice('france', 'France', true)}
          ${choice('espagne', 'Espagne', false)}
        </div>
      </fieldset>
      <fieldset data-reco-step="4">
        <legend>Quelles langues ?</legend>
        <div data-reco-options="languages">
          ${languageRow('fr', 'Français', [{ id: 'c1', label: 'Courant' }], 'c1')}
          ${languageRow('en', 'Anglais', [{ id: 'b1', label: 'Intermédiaire' }])}
        </div>
      </fieldset>
      <fieldset data-reco-step="5">
        <legend>Budget et rentrée</legend>
        <div data-reco-options="budget">
          ${choice('b500', '<b>500 €</b>', false)}
        </div>
      </fieldset>
    </form>`
  document.body.append(el)
  return el
}

const historyOf = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>('[data-reco-history] [data-reco-msg]')].map((n) => ({
    from: n.dataset.recoMsg,
    text: n.textContent
  }))

describe('renderConversation', () => {
  it('no-op sans conteneur [data-reco-history]', () => {
    const el = widget({ history: false })
    renderConversation(el, 3)
    expect(el.querySelector('[data-reco-msg]')).toBeNull()
  })

  it('étape 1 : historique vide', () => {
    const el = widget()
    renderConversation(el, 1)
    expect(el.querySelector('[data-reco-history]')!.childElementCount).toBe(0)
  })

  it('étape 3 : uniquement les questions 1 et 2 avec leurs labels cochés', () => {
    const el = widget()
    renderConversation(el, 3)
    expect(historyOf(el)).toEqual([
      { from: 'assistant', text: 'Quel est ton niveau ?' },
      { from: 'user', text: 'Bac' },
      { from: 'assistant', text: 'Quels domaines ?' },
      { from: 'user', text: 'Gestion' }
    ])
  })

  it('retour à l’étape 2 : les réponses futures disparaissent', () => {
    const el = widget()
    renderConversation(el, 4)
    renderConversation(el, 2)
    expect(historyOf(el)).toEqual([
      { from: 'assistant', text: 'Quel est ton niveau ?' },
      { from: 'user', text: 'Bac' }
    ])
  })

  it('changement de sélection : la réponse affichée suit la case cochée', () => {
    const el = widget()
    renderConversation(el, 3)
    const licence = el.querySelector<HTMLInputElement>(
      '[data-reco-options="level"] input[value="licence"]'
    )!
    const bac = el.querySelector<HTMLInputElement>(
      '[data-reco-options="level"] input[value="bac"]'
    )!
    bac.checked = false
    licence.checked = true
    renderConversation(el, 3)
    expect(historyOf(el)[1]).toEqual({ from: 'user', text: 'Licence' })
  })

  it('langues : ligne sans niveau ignorée, label natif + option retenus', () => {
    const el = widget()
    renderConversation(el, 5)
    const entries = historyOf(el)
    const idx = entries.findIndex((e) => e.text === 'Quelles langues ?')
    expect(entries[idx + 1]).toEqual({ from: 'user', text: 'Français : Courant' })
    expect(entries.filter((e) => e.text?.includes('Anglais'))).toHaveLength(0)
  })

  it('un label façon HTML reste du texte, jamais du balisage inséré', () => {
    const el = widget({ markupLabel: true })
    renderConversation(el, 3)
    const answer = el.querySelectorAll('[data-reco-history] [data-reco-msg="user"]')[1]!
    expect(answer.textContent).toBe('<b>Gestion</b>')
    expect(answer.querySelector('b')).toBeNull()
  })

  it('double rendu : pas de nœud dupliqué', () => {
    const el = widget()
    renderConversation(el, 3)
    renderConversation(el, 3)
    expect(el.querySelectorAll('[data-reco-msg]')).toHaveLength(4)
  })

  it('étape sans réponse complète : aucune paire ajoutée', () => {
    const el = widget()
    el.querySelector<HTMLInputElement>('[data-reco-options="level"] input')!.checked = false
    renderConversation(el, 3)
    expect(historyOf(el)).toEqual([
      { from: 'assistant', text: 'Quels domaines ?' },
      { from: 'user', text: 'Gestion' }
    ])
  })
})
