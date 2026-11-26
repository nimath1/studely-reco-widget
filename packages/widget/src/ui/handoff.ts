/**
 * Formulaire conseiller complet (HandoffForm de l'API, SAV-065) : lecture,
 * validation locale alignée sur le schéma, marquage des champs fautifs et
 * pré-remplissage (brouillon /handoff/draft + profil déclaré).
 */
import type { HandoffBody, HandoffDraft, ProfileContact } from '../api/client'

export type HandoffField =
  'subject' | 'description' | 'first' | 'last' | 'email' | 'phone' | 'country'

export type HandoffValues = Record<HandoffField, string>

const FIELDS: HandoffField[] = [
  'subject',
  'description',
  'first',
  'last',
  'email',
  'phone',
  'country'
]

/** Champ du HandoffForm (loc d'un 422 FastAPI) → champ du formulaire. */
const API_FIELDS: Record<string, HandoffField> = {
  first_name: 'first',
  last_name: 'last',
  email: 'email',
  phone: 'phone',
  departure_country: 'country',
  subject: 'subject',
  description: 'description'
}

/** Téléphone E.164 attendu par l'API ; espaces, points et tirets tolérés à la saisie. */
const E164 = /^\+[1-9]\d{6,14}$/

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s.()-]/g, '')
}

function input(form: Element, field: HandoffField): HTMLInputElement | null {
  return form.querySelector<HTMLInputElement>(`[data-reco-input="handoff-${field}"]`)
}

export function readHandoffForm(form: Element): HandoffValues {
  const values = {} as HandoffValues
  for (const field of FIELDS) values[field] = input(form, field)?.value.trim() ?? ''
  return values
}

/**
 * Champs invalides selon le schéma HandoffForm : tous requis sauf le
 * téléphone (E.164 s'il est rempli), e-mail au format, pays ≥ 3 lettres.
 */
export function invalidHandoffFields(form: Element, values: HandoffValues): HandoffField[] {
  const invalid: HandoffField[] = []
  for (const field of FIELDS) {
    const value = values[field]
    if (field === 'phone') {
      if (value && !E164.test(normalizePhone(value))) invalid.push(field)
    } else if (!value) {
      invalid.push(field)
    } else if (field === 'email' && input(form, 'email')?.checkValidity() === false) {
      invalid.push(field)
    } else if (field === 'country' && value.length < 3) {
      invalid.push(field)
    }
  }
  return invalid
}

/** Champ fautif d'un 422 de l'API, s'il correspond à un champ du formulaire. */
export function handoffFieldFromApi(apiField: string | undefined): HandoffField | null {
  return (apiField && API_FIELDS[apiField]) || null
}

/** `aria-invalid` sur les champs fautifs (et retiré des autres) ; focus au premier. */
export function markInvalid(form: Element, invalid: HandoffField[]): void {
  for (const field of FIELDS) {
    const node = input(form, field)
    if (!node) continue
    if (invalid.includes(field)) node.setAttribute('aria-invalid', 'true')
    else node.removeAttribute('aria-invalid')
  }
  if (invalid[0]) input(form, invalid[0])?.focus()
}

/** Corps du POST …/handoff : téléphone normalisé, omis s'il est vide. */
export function toHandoffBody(values: HandoffValues): HandoffBody {
  const body: HandoffBody = {
    first_name: values.first,
    last_name: values.last,
    email: values.email,
    departure_country: values.country,
    subject: values.subject,
    description: values.description
  }
  if (values.phone) body.phone = normalizePhone(values.phone)
  return body
}

/** Le profil stocke un code ISO (`SN`) ; le formulaire veut le nom du pays. */
function countryName(country: string, locale: string): string {
  if (!/^[A-Za-z]{2}$/.test(country)) return country
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(country.toUpperCase()) ?? country
  } catch {
    return country
  }
}

/**
 * Pré-remplissage : n'écrit que dans un champ encore vide — ce que
 * l'utilisateur a commencé à taper pendant le chargement est conservé.
 */
export function prefillHandoff(
  form: Element,
  draft: HandoffDraft | null,
  contact: ProfileContact | null,
  locale: string
): void {
  const set = (field: HandoffField, value: string | undefined) => {
    const node = input(form, field)
    if (node && value && !node.value.trim()) node.value = value
  }
  set('subject', draft?.subject)
  set('description', draft?.description)
  set('first', contact?.firstname)
  set('last', contact?.lastname)
  set('email', contact?.email)
  if (contact?.country) set('country', countryName(contact.country, locale))
}
