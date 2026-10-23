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
  it('n’accepte que https sur studely.com et ses sous-domaines', () => {
    expect(isAllowedUrl('https://www.studely.com/p')).toBe(true)
    expect(isAllowedUrl('https://studely.com/p')).toBe(true)
    expect(isAllowedUrl('https://support.studely.com/hc/fr/articles/1')).toBe(true)
    expect(isAllowedUrl('https://api.studely.com')).toBe(true)
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- negative fixture
    expect(isAllowedUrl('http://studely.com/p')).toBe(false)
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- negative fixture
    expect(isAllowedUrl('http://support.studely.com/p')).toBe(false)
    expect(isAllowedUrl('https://evil-studely.com/')).toBe(false)
    expect(isAllowedUrl('https://studely.com.evil.com/')).toBe(false)
    expect(isAllowedUrl('https://example.com/')).toBe(false)
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedUrl('data:text/html,x')).toBe(false)
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
    const links = [...entry.querySelectorAll<HTMLButtonElement>('[data-reco-field="links"] button')]
    expect(links.map((l) => l.dataset.recoSend)).toEqual(['A', 'D'])
    expect(entry.querySelectorAll('[data-reco-field="links"] a')).toHaveLength(0)
  })

  it('citation titrée → bouton qui envoie son titre (pas de lien externe)', () => {
    const entry = card()
    const result = fillAssistantEntry(entry, 'Texte [S3]', [
      {
        label: 'S3',
        title: 'Ouvrir un compte bloqué',
        source_url: 'https://support.studely.com/hc/fr/articles/3-compte'
      }
    ])
    expect(result).toEqual({ pieces: 2, links: 1 })
    const button = entry.querySelector<HTMLButtonElement>('[data-reco-field="links"] button')!
    expect(button.type).toBe('button')
    expect(button.textContent).toBe('Ouvrir un compte bloqué')
    expect(button.dataset.recoSend).toBe('Ouvrir un compte bloqué')
  })

  it('dédoublonne sur l’URL résolue (url vs source_url) avant le cap', () => {
    const entry = card()
    const result = fillAssistantEntry(entry, 'Texte', [
      { title: 'A', url: 'https://www.studely.com/a' },
      { label: 'S1', title: 'A bis', source_url: 'https://www.studely.com/a' },
      { label: 'S2', title: 'B', source_url: 'https://support.studely.com/hc/fr/articles/2-b' }
    ])
    expect(result).toEqual({ pieces: 3, links: 2 })
    const links = [...entry.querySelectorAll<HTMLButtonElement>('[data-reco-field="links"] button')]
    expect(links.map((l) => l.dataset.recoSend)).toEqual(['A', 'B'])
  })

  it('titre absent → lien externe, url comme libellé', () => {
    const entry = card()
    fillAssistantEntry(entry, '', [{ url: 'https://www.studely.com/x' }])
    const link = entry.querySelector<HTMLAnchorElement>('[data-reco-field="links"] a')!
    expect(link.textContent).toBe('https://www.studely.com/x')
    expect(link.href).toBe('https://www.studely.com/x')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener')
  })

  it('texte vide + toutes citations filtrées → 0 pièce', () => {
    const entry = card()
    expect(fillAssistantEntry(entry, '  ', [{ url: 'https://example.com/x' }])).toEqual({
      pieces: 0,
      links: 0
    })
  })

  const body = (entry: HTMLElement) => entry.querySelector('[data-reco-field="text"]')!

  it('paragraph + bold-label list; les marqueurs [Sn] sont retirés', () => {
    const entry = card()
    fillAssistantEntry(
      entry,
      'Voici deux pistes :\n\n- **Via application** : dépose en ligne [S1]\n- **Via conseiller** : rendez-vous [S4][S5]',
      undefined
    )
    const scope = body(entry)
    expect(scope.hasAttribute('data-reco-markdown')).toBe(true)
    expect(scope.querySelector('p')!.textContent).toBe('Voici deux pistes :')
    const items = [...scope.querySelectorAll('ul > li')]
    expect(items).toHaveLength(2)
    expect(items[0]!.querySelector('strong')!.textContent).toBe('Via application')
    expect(items[1]!.querySelector('strong')!.textContent).toBe('Via conseiller')
    expect(items[0]!.textContent).toContain('dépose en ligne')
    expect(items[0]!.textContent).not.toContain('[S')
    expect(items[1]!.textContent).toContain('rendez-vous')
    expect(items[1]!.textContent).not.toContain('[S')
    // No inferred links on citation markers.
    expect(scope.querySelectorAll('a')).toHaveLength(0)
  })

  it('nested and ordered lists with start', () => {
    const entry = card()
    fillAssistantEntry(entry, '- a\n  - b\n\n3. trois\n4. quatre', undefined)
    const scope = body(entry)
    expect(scope.querySelector('ul > li > ul > li')!.textContent).toBe('b')
    const ol = scope.querySelector('ol')!
    expect(ol.getAttribute('start')).toBe('3')
    expect(ol.querySelectorAll('li')).toHaveLength(2)
  })

  it('emphasis, code, heading, blockquote, hr, table', () => {
    const entry = card()
    fillAssistantEntry(
      entry,
      '## Titre\n\n*it* ~~rayé~~ `x<y`\n\n> note\n\n---\n\n| a |\n|---|\n| 1 |',
      undefined
    )
    const scope = body(entry)
    expect(scope.querySelector('h2')!.textContent).toBe('Titre')
    expect(scope.querySelector('em')!.textContent).toBe('it')
    expect(scope.querySelector('del')!.textContent).toBe('rayé')
    expect(scope.querySelector('code')!.textContent).toBe('x<y')
    expect(scope.querySelector('blockquote')!.textContent).toContain('note')
    expect(scope.querySelector('hr')).not.toBeNull()
    expect(scope.querySelector('[data-reco-md-table] table td')!.textContent).toBe('1')
  })

  it('code stays literal: entities and markup are not decoded', () => {
    const entry = card()
    fillAssistantEntry(entry, '`&amp; &lt;img&gt;`\n\n```\n&copy; <b>x</b>\n```', undefined)
    const scope = body(entry)
    expect(scope.querySelector('p code')!.textContent).toBe('&amp; &lt;img&gt;')
    expect(scope.querySelector('pre code')!.textContent).toBe('&copy; <b>x</b>')
    expect(scope.querySelector('img, b')).toBeNull()
  })

  it('raw HTML keeps entities exactly as typed', () => {
    const entry = card()
    fillAssistantEntry(entry, '<div class="x">&amp;</div>', undefined)
    const scope = body(entry)
    expect(scope.querySelector('div')).toBeNull()
    expect(scope.textContent).toContain('<div class="x">&amp;</div>')
  })

  it('links: https studely.com clickable, everything else stays text', () => {
    const entry = card()
    fillAssistantEntry(
      entry,
      [
        '[ok](https://www.studely.com/p)',
        '[js](javascript:alert(1))',
        '[data](data:text/html,x)',
        '[http](http://studely.com/p)',
        '[ext](https://example.com/)',
        '[sub](https://studely.com.evil.com/)',
        '[enc](&#106;avascript:alert(1))'
      ].join(' '),
      undefined
    )
    const links = [...body(entry).querySelectorAll<HTMLAnchorElement>('a')]
    expect(links).toHaveLength(1)
    expect(links[0]!.href).toBe('https://www.studely.com/p')
    expect(links[0]!.target).toBe('_blank')
    expect(links[0]!.rel).toBe('noopener')
    const text = body(entry).textContent!
    for (const label of ['js', 'data', 'http', 'ext', 'sub', 'enc']) expect(text).toContain(label)
  })

  it('raw HTML (script/img/svg, handlers) stays inert literal text', () => {
    const entry = card()
    fillAssistantEntry(
      entry,
      'a <img src=x onerror=alert(1)> b\n\n<script>alert(1)</script>\n\n<svg onload=alert(1)></svg>',
      undefined
    )
    const scope = body(entry)
    expect(scope.querySelector('img, script, svg')).toBeNull()
    expect(scope.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(scope.textContent).toContain('<script>')
    expect(scope.querySelector('[onclick], [onerror]')).toBeNull()
  })

  it('image: alt as text, no media nodes', () => {
    const entry = card()
    fillAssistantEntry(entry, 'voir ![logo studely](https://x.test/i.png) fin', undefined)
    const scope = body(entry)
    expect(scope.querySelector('img, picture, source, video')).toBeNull()
    expect(scope.textContent).toContain('logo studely')
  })

  it('entities decoded, escaped punctuation literal', () => {
    const entry = card()
    fillAssistantEntry(entry, 'a &amp; b &lt;tag&gt; &#233;tudier \\+ \\_x\\_', undefined)
    const text = body(entry).textContent!
    expect(text).toContain('a & b')
    expect(text).toContain('<tag>')
    expect(text).toContain('étudier')
    expect(text).toContain('+ _x_')
    expect(body(entry).querySelector('em')).toBeNull()
  })

  it('a second fill replaces the previous rendering', () => {
    const entry = card()
    fillAssistantEntry(entry, '**gras**', undefined)
    fillAssistantEntry(entry, 'simple', undefined)
    const scope = body(entry)
    expect(scope.querySelector('strong')).toBeNull()
    expect(scope.textContent).toBe('simple')
  })

  it('legacy <p> container → converted to <div>, attributes kept', () => {
    const legacy = document.createElement('div')
    const p = document.createElement('p')
    p.dataset.recoField = 'text'
    p.className = 'keep'
    legacy.append(p)
    fillAssistantEntry(legacy, '- item', undefined)
    const field = legacy.querySelector('[data-reco-field="text"]')!
    expect(field.tagName).toBe('DIV')
    expect(field.className).toBe('keep')
    expect(field.querySelector('ul > li')!.textContent).toBe('item')
  })
})
