import { FRENCH_STOP_WORDS, normalizeText, stemToken, stripHtml, tokenize } from './text.util'

describe('text util', () => {
  it('normalizes case and accents', () => {
    expect(normalizeText('Sécurité & Prévention — Créteil')).toBe('securite & prevention — creteil')
    expect(normalizeText(null)).toBe('')
  })

  it('strips HTML tags and decodes common entities', () => {
    expect(stripHtml('<p>Formation&nbsp;<strong>SST</strong> &amp; secours</p>')).toBe(
      'Formation SST & secours'
    )
    expect(stripHtml('L&#39;essentiel &eacute;lectrique')).toBe("L'essentiel électrique")
    expect(stripHtml(undefined)).toBe('')
  })

  it('tokenizes without stop words nor short tokens', () => {
    expect(tokenize('Former 8 salariés à la sécurité et aux premiers secours')).toEqual([
      'former',
      'salaries',
      'securite',
      'premiers',
      'secours'
    ])
    expect(tokenize('SST à Lyon', 3)).toEqual(['sst', 'lyon'])
    expect(FRENCH_STOP_WORDS.has('a')).toBe(true)
  })

  it('stems plurals conservatively', () => {
    expect(stemToken('formations')).toBe('formation')
    expect(stemToken('travaux')).toBe('travail')
    expect(stemToken('travail')).toBe('travail')
    expect(stemToken('journaux')).toBe('journal')
    expect(stemToken('conflits')).toBe('conflit')
    expect(stemToken('sst')).toBe('sst')
    expect(stemToken('cross')).toBe('cross')
    expect(stemToken('habilitee')).toBe('habilite')
    expect(stemToken('bus')).toBe('bus')
  })
})
