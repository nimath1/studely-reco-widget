import type { SearchMissContext } from '@studely/types'
import { scrubPersonalData } from '../common/utils/pii.util'

// « lat,lng » (autour de moi) ou « lat,lng|Commune » (suggestion de
// localisation du front, `useGeoSuggest`) : le libellé de commune, déjà
// grossier, est conservé.
const GEO_POINT_PATTERN = /^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)\s*(?:\|(.*))?$/s

/** Clé de regroupement : minuscules, sans accents, ponctuation réduite à des espaces. */
export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Coordonnées « autour de moi » (lat,lng du visiteur) arrondies au dixième
 * de degré (~10 km) : la position précise est une donnée personnelle, la
 * zone suffit pour repérer un manque géographique.
 */
export function coarseLocation(value: string): string {
  const match = GEO_POINT_PATTERN.exec(value.trim())
  if (!match) return value
  const point = `${Number(match[1]).toFixed(1)},${Number(match[2]).toFixed(1)}`
  const label = match[3]?.trim()
  return label ? `${point}|${label}` : point
}

function isContextValue(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function sanitizeContextValue(key: string, value: string): string {
  // Les valeurs viennent de paramètres de requête ou de la conversation :
  // elles sont masquées comme le texte saisi. La position est dégradée
  // d'abord — une longue partie décimale peut ressembler à un numéro, et le
  // masquage empêcherait alors de reconnaître le point à arrondir.
  return scrubPersonalData(key === 'location' ? coarseLocation(value) : value)
}

/**
 * Contexte de recherche prêt à être stocké : valeurs primitives non vides
 * uniquement, données personnelles masquées, localisation géographique
 * dégradée. `null` quand il ne reste rien à conserver.
 */
export function sanitizeContext(
  context: Record<string, unknown> | null | undefined
): SearchMissContext | null {
  if (!context) return null
  const clean: SearchMissContext = {}
  for (const [key, value] of Object.entries(context)) {
    if (!isContextValue(value) || value === '') continue
    clean[key] = typeof value === 'string' ? sanitizeContextValue(key, value) : value
  }
  return Object.keys(clean).length > 0 ? clean : null
}
