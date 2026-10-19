import { PII_PLACEHOLDERS, scrubPersonalData } from './pii.util'

describe('scrubPersonalData', () => {
  it('keeps business content untouched', () => {
    const text = 'Former 8 salariés au CACES R489 près de Lyon avant septembre 2026'
    expect(scrubPersonalData(text)).toBe(text)
  })

  it('masks e-mail addresses, including accented local parts', () => {
    expect(scrubPersonalData('Contact : jean.dupont+rh@exemple-société.fr merci')).toBe(
      `Contact : ${PII_PLACEHOLDERS.email} merci`
    )
  })

  it('masks french phone numbers with or without separators', () => {
    expect(scrubPersonalData('rappelez-moi au 06 12 34 56 78 ou 0712345678')).toBe(
      `rappelez-moi au ${PII_PLACEHOLDERS.phone} ou ${PII_PLACEHOLDERS.phone}`
    )
    expect(scrubPersonalData('tel +33 6 12 34 56 78')).toBe(`tel ${PII_PLACEHOLDERS.phone}`)
  })

  it('masks SIRET numbers, grouped or not', () => {
    expect(scrubPersonalData('siret 123 456 789 00012')).toBe(`siret ${PII_PLACEHOLDERS.siret}`)
    expect(scrubPersonalData('siret 12345678900012')).toBe(`siret ${PII_PLACEHOLDERS.siret}`)
  })

  it('masks IBAN and long digit sequences', () => {
    expect(scrubPersonalData('IBAN FR76 3000 6000 0112 3456 7890 189')).toBe(
      `IBAN ${PII_PLACEHOLDERS.iban}`
    )
    expect(scrubPersonalData('numéro 1234567890123')).toBe(`numéro ${PII_PLACEHOLDERS.number}`)
    expect(scrubPersonalData('iban fr7630006000011234567890189')).toBe(
      `iban ${PII_PLACEHOLDERS.iban}`
    )
  })

  it('masks postal addresses but keeps the postal code and city', () => {
    expect(scrubPersonalData('Jean Dupont, 12 rue des Lilas, 69003 Lyon')).toBe(
      `Jean Dupont, ${PII_PLACEHOLDERS.address}, 69003 Lyon`
    )
    expect(scrubPersonalData('livraison 4 bis avenue du Général Leclerc. Merci')).toBe(
      `livraison ${PII_PLACEHOLDERS.address}. Merci`
    )
    const business = 'formation CACES 3 en centre à Lyon pour 5 personnes'
    expect(scrubPersonalData(business)).toBe(business)
  })

  it('masks abbreviated street types, whose final dot defeats an ASCII word boundary', () => {
    expect(scrubPersonalData('12 av. des Lilas, 69003 Lyon')).toBe(
      `${PII_PLACEHOLDERS.address}, 69003 Lyon`
    )
    expect(scrubPersonalData('rdv 3 bd Voltaire; merci')).toBe(
      `rdv ${PII_PLACEHOLDERS.address}; merci`
    )
    expect(scrubPersonalData('7 allée des Tilleuls')).toBe(PII_PLACEHOLDERS.address)
  })

  it('never mistakes courses and seats for a street', () => {
    // « cours » et « place » sont d'abord du vocabulaire métier.
    for (const need of [
      '2 cours de management pour 5 personnes',
      'réserver 1 place en formation SST',
      '12 places disponibles avant le 3 mars',
      '3 avantages du CACES',
      '2 routes de formation possibles'
    ]) {
      expect(scrubPersonalData(need)).toBe(need)
    }
  })

  it('leaves short numbers (dates, headcounts, budgets) alone', () => {
    const text = 'budget 15 000 € pour 12 personnes le 15 mars 2026 à 14h30'
    expect(scrubPersonalData(text)).toBe(text)
  })
})
