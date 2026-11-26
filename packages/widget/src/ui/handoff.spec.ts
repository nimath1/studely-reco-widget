import { mountWidget } from '../testing/widget.fixture'
import { readLabels } from '../i18n/labels'
import {
  handoffFieldFromApi,
  invalidHandoffFields,
  markInvalid,
  prefillHandoff,
  readHandoffForm,
  toHandoffBody
} from './handoff'
import { appendHandoffForm } from './thread'

let form: HTMLFormElement

const field = (name: string) =>
  form.querySelector<HTMLInputElement>(`[data-reco-input="handoff-${name}"]`)!

function fill(values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) field(name).value = value
}

const VALID = {
  subject: 'Mise en relation',
  description: 'Je souhaite parler à un conseiller.',
  first: 'Awa',
  last: 'Diop',
  email: 'awa@exemple.com',
  country: 'Sénégal'
}

beforeEach(() => {
  const el = mountWidget()
  const { card } = appendHandoffForm(el, readLabels(el), false)!
  form = card.querySelector<HTMLFormElement>('[data-reco-handoff]')!
})

describe('validation (schéma HandoffForm)', () => {
  it('formulaire complet valide, téléphone facultatif', () => {
    fill(VALID)
    expect(invalidHandoffFields(form, readHandoffForm(form))).toEqual([])
  })

  it('champs requis vides, e-mail mal formé, pays trop court, téléphone non E.164', () => {
    fill({ ...VALID, subject: '  ', email: 'pas-un-email', country: 'SN', phone: '0612345678' })
    expect(invalidHandoffFields(form, readHandoffForm(form))).toEqual([
      'subject',
      'email',
      'phone',
      'country'
    ])
  })

  it('téléphone E.164 accepté avec espaces, normalisé dans le corps', () => {
    fill({ ...VALID, phone: '+221 77 123 45 67' })
    const values = readHandoffForm(form)
    expect(invalidHandoffFields(form, values)).toEqual([])
    expect(toHandoffBody(values)).toEqual({
      first_name: 'Awa',
      last_name: 'Diop',
      email: 'awa@exemple.com',
      phone: '+221771234567',
      departure_country: 'Sénégal',
      subject: 'Mise en relation',
      description: 'Je souhaite parler à un conseiller.'
    })
  })

  it('téléphone vide : omis du corps', () => {
    fill(VALID)
    expect(toHandoffBody(readHandoffForm(form))).not.toHaveProperty('phone')
  })

  it('aria-invalid posé puis retiré, focus au premier champ fautif', () => {
    markInvalid(form, ['email', 'country'])
    expect(field('email').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field('email'))
    markInvalid(form, [])
    expect(field('email').hasAttribute('aria-invalid')).toBe(false)
  })

  it('champ fautif d’un 422 API → champ du formulaire', () => {
    expect(handoffFieldFromApi('departure_country')).toBe('country')
    expect(handoffFieldFromApi('first_name')).toBe('first')
    expect(handoffFieldFromApi('body')).toBeNull()
    expect(handoffFieldFromApi(undefined)).toBeNull()
  })
})

describe('prefillHandoff', () => {
  it('brouillon + profil remplissent les champs vides, pays ISO → nom', () => {
    prefillHandoff(
      form,
      { subject: 'Sujet IA', description: 'Description IA', lang: 'fr' },
      { firstname: 'Awa', lastname: 'Diop', email: 'awa@exemple.com', country: 'SN' },
      'fr'
    )
    expect(readHandoffForm(form)).toMatchObject({
      subject: 'Sujet IA',
      description: 'Description IA',
      first: 'Awa',
      last: 'Diop',
      email: 'awa@exemple.com',
      country: 'Sénégal'
    })
  })

  it('ne remplace jamais ce que l’utilisateur a déjà tapé', () => {
    fill({ subject: 'Mon sujet', first: 'Moussa' })
    prefillHandoff(form, { subject: 'Sujet IA', description: 'D' }, { firstname: 'Awa' }, 'fr')
    expect(field('subject').value).toBe('Mon sujet')
    expect(field('first').value).toBe('Moussa')
    expect(field('description').value).toBe('D')
  })

  it('sans brouillon ni profil : rien ne change', () => {
    prefillHandoff(form, null, null, 'fr')
    expect(Object.values(readHandoffForm(form)).every((v) => v === '')).toBe(true)
  })
})
