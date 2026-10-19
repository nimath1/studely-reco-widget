// Transformateurs partagés par les DTOs de query string (class-transformer).
// Une valeur invalide est renvoyée telle quelle (ou NaN) pour que le
// validateur class-validator correspondant rejette la requête en 400.

export function toOptionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function toPositiveInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

export function toOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  if (Number.isNaN(parsed) || !Number.isInteger(parsed)) {
    return Number.NaN
  }
  return parsed
}

export function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lowered = value.toLowerCase().trim()
    if (['true', '1', 'yes'].includes(lowered)) return true
    if (['false', '0', 'no'].includes(lowered)) return false
  }
  // Return the raw value so @IsBoolean rejects it with a 400.
  return value as unknown as boolean
}
