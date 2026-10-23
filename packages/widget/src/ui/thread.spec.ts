import type { Translate } from '../i18n/labels'
import {
  appendAssistant,
  appendHandoffForm,
  appendUser,
  clearThread,
  greet,
  hideError,
  hidePending,
  setChipsEnabled,
  showError,
  showPending
} from './thread'
import { mountWidget } from '../testing/widget.fixture'
import { readLabels } from '../i18n/labels'

let el: HTMLElement
let t: Translate

const entries = () => [...el.querySelectorAll<HTMLElement>('[data-reco-thread] > [data-reco-msg]')]

beforeEach(() => {
  el = mountWidget()
  t = readLabels(el)
})

describe('appendUser / appendAssistant', () => {
  it('bulle utilisateur : texte brut dans le fil', () => {
    appendUser(el, 'Je veux un <b>master</b>')
    const entry = entries().at(-1)!
    expect(entry.dataset.recoMsg).toBe('user')
    expect(entry.textContent).toContain('Je veux un <b>master</b>')
    expect(entry.querySelector('b')).toBeNull()
  })

  it('bulle assistant : texte + citations studely.com', () => {
    const { links } = appendAssistant(
      el,
      {
        text: 'Voici des pistes',
        meta: {
          citations: [
            { title: 'Lyon', url: 'https://www.studely.com/lyon' },
            { title: 'Hors site', url: 'https://example.com/x' }
          ]
        }
      },
      t
    )
    expect(links).toBe(1)
    const entry = entries().at(-1)!
    expect(entry.dataset.recoMsg).toBe('assistant')
    expect(entry.querySelector('[data-reco-field="links"] button')!.textContent).toBe('Lyon')
  })

  it('sources + citations : union dédupliquée, sources d’abord', () => {
    const { links } = appendAssistant(
      el,
      {
        text: 'Réponse détaillée [S2]',
        meta: {
          sources: [
            { label: 'S1', title: 'A', source_url: 'https://support.studely.com/hc/fr/a' },
            { label: 'S2', title: 'B', source_url: 'https://support.studely.com/hc/fr/b' },
            { label: 'S3', title: 'C', source_url: 'https://support.studely.com/hc/fr/c' }
          ],
          citations: [
            { label: 'S2', title: 'B', source_url: 'https://support.studely.com/hc/fr/b' }
          ]
        }
      },
      t
    )
    expect(links).toBe(3)
    const entry = entries().at(-1)!
    const buttons = [
      ...entry.querySelectorAll<HTMLButtonElement>('[data-reco-field="links"] button')
    ]
    expect(buttons.map((b) => b.dataset.recoSend)).toEqual(['A', 'B', 'C'])
    expect(buttons[0]!.textContent).toBe('A')
    // Marqueurs [Sn] retirés du texte, même sans citation correspondante.
    expect(entry.textContent).toContain('Réponse détaillée')
    expect(entry.textContent).not.toContain('[S2]')
  })

  it('out_of_scope : CTA conseiller sous la bulle', () => {
    appendAssistant(el, { text: 'Hors périmètre', meta: { out_of_scope: true } }, t)
    const entry = entries().at(-1)!
    const cta = entry.querySelector<HTMLButtonElement>('[data-reco-action="advisor"]')
    expect(cta).not.toBeNull()
    expect(cta!.textContent).toContain('Parler à un conseiller')
  })

  it('handoff_proposed : CTA conseiller aussi', () => {
    appendAssistant(el, { text: 'Réponse', meta: { handoff_proposed: true } }, t)
    expect(entries().at(-1)!.querySelector('[data-reco-action="advisor"]')).not.toBeNull()
  })

  it('réponse vide : la bulle garde le message « aucun parcours »', () => {
    appendAssistant(el, { text: '', meta: {} }, t)
    expect(entries().at(-1)!.textContent).toContain('Aucun parcours')
  })
})

describe('appendHandoffForm', () => {
  it('carte formulaire nom + e-mail dans le fil, une seule à la fois', () => {
    const card = appendHandoffForm(el, t)!
    expect(card.dataset.recoMsg).toBe('assistant')
    expect(card.querySelector('[data-reco-input="handoff-name"]')).not.toBeNull()
    expect(card.querySelector('[data-reco-input="handoff-email"]')).not.toBeNull()
    expect(card.textContent).toContain('mise en relation')
    appendHandoffForm(el, t)
    expect(el.querySelectorAll('[data-reco-thread] [data-reco-handoff]')).toHaveLength(1)
  })

  const labelsOf = (card: HTMLElement, name: string) => {
    const input = card.querySelector<HTMLInputElement>(`[data-reco-input="${name}"]`)!
    return [...(input.labels ?? [])].filter((label) => label.contains(input))
  }

  it('each field is wrapped in a label with the translated text', () => {
    const card = appendHandoffForm(el, t)!
    expect(labelsOf(card, 'handoff-name')[0]?.textContent).toContain('Ton nom')
    expect(labelsOf(card, 'handoff-email')[0]?.textContent).toContain('Ton adresse e-mail')
    // Implicit association only: no id/for coupling to duplicate.
    expect(card.querySelector('[data-reco-input="handoff-name"]')!.id).toBe('')
    expect(card.querySelector('[data-reco-input="handoff-email"]')!.id).toBe('')
  })

  it('a second invocation reuses the form and keeps label associations', () => {
    const first = appendHandoffForm(el, t)!
    const again = appendHandoffForm(el, t)
    expect(again).toBe(first.closest('[data-reco-msg]'))
    expect(labelsOf(first, 'handoff-name')[0]?.textContent).toContain('Ton nom')
    expect(labelsOf(first, 'handoff-email')).toHaveLength(1)
  })

  it('two widget instances keep independent implicit labels', () => {
    const other = mountWidget()
    const cardA = appendHandoffForm(el, t)!
    const cardB = appendHandoffForm(other, readLabels(other))!
    expect(labelsOf(cardA, 'handoff-name')).toHaveLength(1)
    expect(labelsOf(cardB, 'handoff-name')).toHaveLength(1)
    expect(labelsOf(cardA, 'handoff-name')[0]).not.toBe(labelsOf(cardB, 'handoff-name')[0])
    other.remove()
  })
})

describe('greet', () => {
  it('bulle d’accueil marquée + chips libellés → data-reco-send', () => {
    greet(el, t)
    const entry = entries().at(-1)!
    expect(entry.dataset.recoMsg).toBe('assistant')
    expect(entry.dataset.recoGreeting).toBe('')
    expect(entry.textContent).toContain('Bonjour')
    const chips = [...entry.querySelectorAll<HTMLButtonElement>('[data-reco-send]')]
    expect(chips).toHaveLength(5)
    expect(chips[0]!.dataset.recoSend).toBe('Bachelor en Europe')
  })

  it('les réponses ordinaires ne portent pas le marqueur d’accueil', () => {
    appendAssistant(el, { text: 'Voici des pistes', meta: {} }, t)
    const entry = entries().at(-1)!
    expect(entry.dataset.recoMsg).toBe('assistant')
    expect(entry.hasAttribute('data-reco-greeting')).toBe(false)
    expect(entry.querySelector('[data-reco-field="text"]')!.textContent).toBe('Voici des pistes')
  })
})

describe('pending / error / clear', () => {
  it('showPending/hidePending basculent hidden', () => {
    const node = el.querySelector<HTMLElement>('[data-reco-pending]')!
    showPending(el, t)
    expect(node.hidden).toBe(false)
    expect(node.querySelector('[data-reco-field="pending-text"]')!.textContent).toBe('Analyse…')
    hidePending(el)
    expect(node.hidden).toBe(true)
  })

  it('showError remplit titre/message/libellés', () => {
    showError(el, t, 'Réseau')
    const node = el.querySelector<HTMLElement>('[data-reco-error]')!
    expect(node.hidden).toBe(false)
    expect(node.querySelector('[data-reco-error-title]')!.textContent).toBe(
      'Assistant indisponible.'
    )
    expect(node.querySelector('[data-reco-error-message]')!.textContent).toBe('Réseau')
    hideError(el)
    expect(node.hidden).toBe(true)
  })

  it('clearThread vide le fil et masque pending/error', () => {
    appendUser(el, 'x')
    showPending(el, t)
    showError(el, t, 'e')
    clearThread(el)
    expect(entries()).toHaveLength(0)
    expect(el.querySelector<HTMLElement>('[data-reco-pending]')!.hidden).toBe(true)
    expect(el.querySelector<HTMLElement>('[data-reco-error]')!.hidden).toBe(true)
  })

  it('setChipsEnabled désactive les chips clonées', () => {
    greet(el, t)
    setChipsEnabled(el, false)
    const chips = [...el.querySelectorAll<HTMLButtonElement>('[data-reco-send]')]
    expect(chips.every((chip) => chip.disabled)).toBe(true)
    setChipsEnabled(el, true)
    expect(chips.every((chip) => !chip.disabled)).toBe(true)
  })
})
