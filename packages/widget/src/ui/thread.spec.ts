import type { Translate } from '../i18n/labels'
import {
  appendAssistant,
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
      t,
      '/mexique#contact'
    )
    expect(links).toBe(1)
    const entry = entries().at(-1)!
    expect(entry.dataset.recoMsg).toBe('assistant')
    expect(entry.querySelector('[data-reco-field="links"] a')!.textContent).toBe('Lyon')
  })

  it('out_of_scope : CTA conseiller sous la bulle', () => {
    appendAssistant(
      el,
      { text: 'Hors périmètre', meta: { out_of_scope: true } },
      t,
      '/mexique#contact'
    )
    const entry = entries().at(-1)!
    const cta = entry.querySelector<HTMLAnchorElement>('[data-reco-action="advisor"]')
    expect(cta).not.toBeNull()
    expect(cta!.getAttribute('href')).toBe('/mexique#contact')
    expect(cta!.textContent).toContain('Parler à un conseiller')
  })

  it('handoff_proposed : CTA conseiller aussi', () => {
    appendAssistant(el, { text: 'Réponse', meta: { handoff_proposed: true } }, t, '/mexico#contact')
    expect(entries().at(-1)!.querySelector('[data-reco-action="advisor"]')).not.toBeNull()
  })

  it('réponse vide : la bulle garde le message « aucun parcours »', () => {
    appendAssistant(el, { text: '', meta: {} }, t, '/x')
    expect(entries().at(-1)!.textContent).toContain('Aucun parcours')
  })
})

describe('greet', () => {
  it('bulle d’accueil + chips libellés → data-reco-send', () => {
    greet(el, t)
    const entry = entries().at(-1)!
    expect(entry.dataset.recoMsg).toBe('assistant')
    expect(entry.textContent).toContain('Bonjour')
    const chips = [...entry.querySelectorAll<HTMLButtonElement>('[data-reco-send]')]
    expect(chips).toHaveLength(3)
    expect(chips[0]!.dataset.recoSend).toBe('Bachelor en Europe')
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
