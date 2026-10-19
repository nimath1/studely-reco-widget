/**
 * Formatage des nombres et dates dans la locale active via Intl (§8.1) :
 * chiffres arabes orientaux en `ar`, etc.
 */
import type { Locale } from '../config'

export interface Formatters {
  number: (value: number) => string
  date: (value: Date | number) => string
}

export function makeFormatters(locale: Locale): Formatters {
  const number = new Intl.NumberFormat(locale)
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long' })
  return {
    number: (value) => number.format(value),
    date: (value) => date.format(value)
  }
}
