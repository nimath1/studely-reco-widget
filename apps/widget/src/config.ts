/**
 * Lecture et validation des attributs `data-reco-*` du conteneur (cahier
 * des charges §10.1). Le JS ne dépend que de ces attributs, jamais des
 * classes Webflow.
 */

export const SUPPORTED_LOCALES = ['fr', 'es', 'en', 'de', 'ar'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

const DEFAULT_LOCALE: Locale = 'fr'
const RTL_LOCALES: ReadonlySet<Locale> = new Set(['ar'])
// Slug de page Webflow : envoyé tel quel à l'API (`origin`).
const ORIGIN_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface WidgetConfig {
  origin: string
  advisorUrl: string
  locale: Locale
  dir: 'ltr' | 'rtl'
}

export class ConfigError extends Error {
  constructor(readonly attribute: string) {
    super(`Attribut ${attribute} absent ou invalide`)
    this.name = 'ConfigError'
  }
}

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

// `es-MX` → `es` ; toute valeur non supportée est ramenée à `fr` (§8.1).
function normalizeLocale(raw: string): Locale {
  const primary = raw.trim().toLowerCase().split('-')[0] ?? ''
  return isLocale(primary) ? primary : DEFAULT_LOCALE
}

/**
 * `<html lang>` (posé par Webflow Localization) prime ; `data-reco-locale`
 * ne sert que s'il est absent, puis repli sur `fr`.
 */
export function resolveLocale(htmlLang: string | null | undefined, attr?: string): Locale {
  if (htmlLang?.trim()) return normalizeLocale(htmlLang)
  if (attr?.trim()) return normalizeLocale(attr)
  return DEFAULT_LOCALE
}

export function readConfig(el: HTMLElement): WidgetConfig {
  const origin = el.dataset.recoOrigin?.trim() ?? ''
  if (!ORIGIN_PATTERN.test(origin)) throw new ConfigError('data-reco-origin')

  const advisorUrl = el.dataset.recoAdvisorUrl?.trim() ?? ''
  if (!advisorUrl) throw new ConfigError('data-reco-advisor-url')

  const locale = resolveLocale(el.ownerDocument.documentElement.lang, el.dataset.recoLocale)

  return { origin, advisorUrl, locale, dir: RTL_LOCALES.has(locale) ? 'rtl' : 'ltr' }
}
