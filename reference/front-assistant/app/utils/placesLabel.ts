/**
 * Libellé de disponibilité d'une session.
 * `full` : « 5 places disponibles » ; sinon « 5 places ». `0` → « Complet ».
 */
export function placesLabel(places: number, full = true): string {
  if (places === 0) return 'Complet'
  const plural = places === 1 ? '' : 's'
  return full ? `${places} place${plural} disponible${plural}` : `${places} place${plural}`
}

/**
 * Type de badge de disponibilité d'une session : `neutral` quand la session
 * est complète, `warning` quand il reste peu de places, `success` sinon.
 */
export function sessionSeatType(places?: number): 'success' | 'warning' | 'neutral' | undefined {
  if (places === undefined) return undefined
  if (places === 0) return 'neutral'
  return places <= 3 ? 'warning' : 'success'
}
