import { cloneTemplate, fillAssistantEntry, fillField, isAllowedUrl } from './render'
import { mountWidget } from '../testing/widget.fixture'

let el: HTMLElement

beforeEach(() => {
  el = mountWidget()
})

describe('cloneTemplate', () => {
  it('clone sans l’attribut template ; null si inconnu', () => {
    const clone = cloneTemplate(el, 'msg-user')!
    expect(clone).not.toBeNull()
    expect(clone.hasAttribute('data-reco-template')).toBe(false)
    expect(clone.dataset.recoMsg).toBe('user')
    // L'original reste intact pour les clones suivants.
    expect(el.querySelector('[data-reco-template="msg-user"]')).not.toBeNull()
    expect(cloneTemplate(el, 'inconnu')).toBeNull()
  })
})

describe('fillField', () => {
  it('remplit le texte via textContent, et href sur un lien', () => {
    const card = cloneTemplate(el, 'msg-assistant')!
    fillField(card, 'text', '<b>x</b>')
    expect(card.querySelector('[data-reco-field="text"]')!.textContent).toBe('<b>x</b>')
    const cta = cloneTemplate(el, 'advisor-cta')!
    fillField(cta, 'label', 'Conseiller')
    expect(cta.textContent).toContain('Conseiller')
  })
})

describe('isAllowedUrl', () => {
  it('n’accepte que https sur studely.com', () => {
    expect(isAllowedUrl('https://www.studely.com/p')).toBe(true)
    expect(isAllowedUrl('https://studely.com/p')).toBe(true)
    expect(isAllowedUrl('http://studely.com/p')).toBe(false)
    expect(isAllowedUrl('https://evil-studely.com/')).toBe(false)
    expect(isAllowedUrl('https://example.com/')).toBe(false)
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedUrl(undefined)).toBe(false)
  })
})

describe('fillAssistantEntry', () => {
  const card = () => cloneTemplate(el, 'msg-assistant')!

  it('texte seul → 1 pièce, 0 lien', () => {
    expect(fillAssistantEntry(card(), 'Réponse', undefined)).toEqual({ pieces: 1, links: 0 })
  })

  it('citations filtrées : seules restent les https studely.com, 5 max', () => {
    const citations = [
      { title: 'A', url: 'https://www.studely.com/a' },
      { title: 'B', url: 'https://example.com/b' },
      { title: 'C', url: 'javascript:alert(1)' },
      { title: 'D', url: 'https://studely.com/d' }
    ]
    const entry = card()
    const result = fillAssistantEntry(entry, 'Texte', citations)
    expect(result).toEqual({ pieces: 3, links: 2 })
    const links = [...entry.querySelectorAll<HTMLAnchorElement>('[data-reco-field="links"] a')]
    expect(links.map((l) => l.href)).toEqual(['https://www.studely.com/a', 'https://studely.com/d'])
    expect(links[0]!.target).toBe('_blank')
    expect(links[0]!.rel).toBe('noopener')
  })

  it('titre absent → url comme libellé', () => {
    const entry = card()
    fillAssistantEntry(entry, '', [{ url: 'https://www.studely.com/x' }])
    expect(entry.querySelector('[data-reco-field="links"] a')!.textContent).toBe(
      'https://www.studely.com/x'
    )
  })

  it('texte vide + toutes citations filtrées → 0 pièce', () => {
    const entry = card()
    expect(fillAssistantEntry(entry, '  ', [{ url: 'https://example.com/x' }])).toEqual({
      pieces: 0,
      links: 0
    })
  })
})
