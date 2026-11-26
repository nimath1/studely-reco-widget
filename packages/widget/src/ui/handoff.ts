/**
 * Formulaire conseiller complet (HandoffForm de l'API, SAV-065) : lecture,
 * validation locale alignée sur le schéma, marquage des champs fautifs et
 * pré-remplissage (brouillon /handoff/draft + profil déclaré).
 */
import type { HandoffBody, HandoffDraft, ProfileContact } from '../api/client'

/** Champ du HandoffForm de l'API → suffixe `handoff-*` du formulaire. */
const API_FIELDS = {
  subject: 'subject',
  description: 'description',
  first_name: 'first',
  last_name: 'last',
  email: 'email',
  phone: 'phone',
  departure_country: 'country'
} as const

export type HandoffField = (typeof API_FIELDS)[keyof typeof API_FIELDS]

export type HandoffValues = Record<HandoffField, string>

export const HANDOFF_FIELDS = Object.values(API_FIELDS)

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
  for (const field of HANDOFF_FIELDS) values[field] = input(form, field)?.value.trim() ?? ''
  return values
}

/**
 * Champs invalides selon le schéma HandoffForm : tous requis sauf le
 * téléphone (E.164 s'il est rempli), e-mail au format, pays ≥ 3 lettres.
 */
export function invalidHandoffFields(form: Element, values: HandoffValues): HandoffField[] {
  const invalid: HandoffField[] = []
  for (const field of HANDOFF_FIELDS) {
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

export function handoffFieldFromApi(apiField: string | undefined): HandoffField | null {
  return (apiField && API_FIELDS[apiField as keyof typeof API_FIELDS]) || null
}

/** `aria-invalid` sur les champs fautifs (et retiré des autres) ; focus au premier. */
export function markInvalid(form: Element, invalid: HandoffField[]): void {
  for (const field of HANDOFF_FIELDS) {
    const node = input(form, field)
    if (!node) continue
    if (invalid.includes(field)) node.setAttribute('aria-invalid', 'true')
    else node.removeAttribute('aria-invalid')
  }
  if (invalid[0]) input(form, invalid[0])?.focus()
}

/** Corps du POST …/handoff : téléphone normalisé, omis s'il est vide. */
export function toHandoffBody(values: HandoffValues): HandoffBody {
  const body = {} as Record<string, string>
  for (const [api, field] of Object.entries(API_FIELDS)) {
    if (values[field]) body[api] = values[field]
  }
  if (body.phone) body.phone = normalizePhone(body.phone)
  return body as unknown as HandoffBody
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
