import { Injectable, Logger } from '@nestjs/common'
import type {
  CatalogFacets,
  Course,
  CourseListItem,
  CoursePage,
  CoursePedagogyItem,
  CourseSession,
  CourseSessionLocation,
  DurationBucket,
  FamilyWithCount,
  SearchMissContext
} from '@studely/types'
import { CacheService } from '../common/cache/cache.service'
import { normalizeText, tokenize } from '../common/utils/text.util'
import { SearchMissesService } from '../search-misses/search-misses.service'
import {
  DirectusCatalogService,
  type AssignmentProposal,
  type DirectusCentre,
  type DirectusFormation,
  type FamilyApplyResult
} from '../directus/directus.catalog.service'
import {
  CourseAvailability,
  CourseSortField,
  CourseSortOrder,
  type ListCoursesDto
} from './catalog.dto'

function toNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function slugifyCategory(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')

  let start = 0
  let end = slug.length
  while (start < end && slug[start] === '-') start++
  while (end > start && slug[end - 1] === '-') end--
  return slug.slice(start, end)
}

type UnknownRecord = Record<string, unknown>

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function mapSessionLocation(raw: UnknownRecord): CourseSession['location'] {
  const location = raw['location']
  if (!location || typeof location !== 'object') return null

  const loc = location as UnknownRecord
  return {
    name: toNullableString(loc['name']),
    city: toNullableString(loc['city']),
    postalCode: toNullableString(loc['postalCode']),
    department: toNullableString(loc['department']),
    region: toNullableString(loc['region']),
    centreSlug: toNullableString(loc['centreSlug'])
  }
}

function mapSessionEntry(entry: unknown): CourseSession | null {
  if (!entry || typeof entry !== 'object') return null

  const raw = entry as UnknownRecord
  return {
    id: toNullableString(raw['id']),
    startDate: toNullableString(raw['startDate']),
    endDate: toNullableString(raw['endDate']),
    modality: toNullableString(raw['modality']),
    seatsRemaining: toNullableNumber(raw['seatsRemaining']),
    location: mapSessionLocation(raw)
  }
}

function mapSessions(value: unknown): CourseSession[] | null {
  if (!Array.isArray(value)) return null

  const sessions = value.map(mapSessionEntry).filter((s): s is CourseSession => s !== null)

  return sessions.length > 0 ? sessions : null
}

function extractTexts(rawPayload: unknown, key: string): string[] | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null
  const entries = (rawPayload as Record<string, unknown>)[key]
  if (!Array.isArray(entries)) return null

  const texts = entries
    .map((entry) =>
      entry && typeof entry === 'object' && 'text' in entry
        ? (entry as { text?: unknown }).text
        : null
    )
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)

  return texts.length > 0 ? texts : null
}

function toStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const texts = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
  )
  return texts.length > 0 ? texts : null
}

function toPedagogyItems(value: unknown): CoursePedagogyItem[] | null {
  if (!Array.isArray(value)) return null

  const items = value
    .map((entry): CoursePedagogyItem | null => {
      if (typeof entry === 'string') {
        return entry.trim() ? { title: entry, description: null } : null
      }
      if (!entry || typeof entry !== 'object') return null
      const rec = entry as Record<string, unknown>
      if (typeof rec.title !== 'string' || !rec.title.trim()) return null
      return {
        title: rec.title,
        description: typeof rec.description === 'string' ? rec.description : null
      }
    })
    .filter((item): item is CoursePedagogyItem => item !== null)

  return items.length > 0 ? items : null
}

// Repli quand le champ éditable `pedagogy` est vide : les blocs Digiforma
// de type « pedagogie » portent la même information.
function pedagogyFromBlocks(blocks: unknown): CoursePedagogyItem[] | null {
  if (!Array.isArray(blocks)) return null

  const items = blocks
    .map((block): CoursePedagogyItem | null => {
      if (!block || typeof block !== 'object') return null
      const rec = block as Record<string, unknown>
      if (typeof rec.type !== 'string' || !rec.type.toLowerCase().includes('pedag')) return null
      if (typeof rec.name !== 'string' || !rec.name.trim()) return null
      return {
        title: rec.name,
        description: typeof rec.description === 'string' ? rec.description : null
      }
    })
    .filter((item): item is CoursePedagogyItem => item !== null)

  return items.length > 0 ? items : null
}

// Fallback visuel : l'URL Digiforma d'origine est conservée dans `raw`
// (payload programme) quand aucun fichier n'a pu être importé.
function imageUrlFromRaw(raw: unknown): string | null {
  const image = (raw as { image?: { url?: unknown } } | null)?.image
  return image && typeof image.url === 'string' ? image.url : null
}

// Centres cochés dans l'admin (alias M2M `formations.centres`). La sélection
// éditoriale prime sur `center_slugs` — liste legacy remplie par la sync
// Digiforma, masquée dans l'admin : sans ça les centres choisis dans la fiche
// n'apparaissent pas dans le filtre `center` du catalogue.
function editorialCentreSlugs(raw: DirectusFormation): string[] {
  return (raw.centres ?? [])
    .map((entry) => (typeof entry === 'object' && entry !== null ? entry.centre?.slug : null))
    .filter((slug): slug is string => Boolean(slug))
}

function toListItem(raw: DirectusFormation): CourseListItem {
  const durationDays = toNumber(raw.duration_days)
  const durationHours = toNumber(raw.duration_hours)
  const centreSlugs = editorialCentreSlugs(raw)
  const centerSlugs = centreSlugs.length > 0 ? centreSlugs : ((raw.center_slugs as string[]) ?? [])

  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    shortDescription: raw.short_description ?? null,
    durationDays,
    durationHours,
    durationBucket: durationBucket({ durationDays, durationHours }),
    price: toNumber(raw.price),
    cpf: raw.cpf,
    cpfCode: raw.cpf_code,
    certification: raw.certification,
    certifierName: raw.certifier_name,
    category: raw.category_name,
    familySlug: raw.famille?.slug ?? null,
    subFamilySlug: raw.sous_famille?.slug ?? null,
    subFamilyName: raw.sous_famille?.name ?? null,
    // Le centre « principal » suit la sélection éditoriale (cohérent avec
    // centerSlugs) ; repli sur le slug legacy Digiforma si tout est vide.
    centerSlug: centerSlugs[0] ?? raw.center_slug,
    centerSlugs,
    modalities: (raw.modalities as string[]) ?? [],
    sessions: mapSessions(raw.sessions),
    image: raw.image ?? null,
    imageUrl: imageUrlFromRaw(raw.raw),
    generatedProgramUrl: raw.generated_program_url,
    status: raw.status,
    seoTitle: raw.seo_title,
    seoDescription: raw.seo_description,
    seoCanonical: raw.seo_canonical
  }
}

function toCourse(raw: DirectusFormation): Course {
  return {
    ...toListItem(raw),
    blocks: Array.isArray(raw.blocks) ? (raw.blocks as unknown[]) : null,
    targets: extractTexts(raw.raw, 'targets'),
    prerequisites: extractTexts(raw.raw, 'prerequisites'),
    pedagogy: toPedagogyItems(raw.pedagogy) ?? pedagogyFromBlocks(raw.blocks),
    evaluation: toStringList(raw.evaluation) ?? extractTexts(raw.raw, 'evaluation'),
    validity: toNullableString(raw.validity),
    createdAt: toIsoString(raw.created_at),
    updatedAt: toIsoString(raw.updated_at)
  }
}

// Tokens normalisés (sans accents, sans mots vides — `FRENCH_STOP_WORDS` du
// tokenizer partagé), comme `searchText` — sinon « sécurité » ne trouvait
// jamais « Sécurité ».
function toSearchTokens(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  const tokens = tokenize(raw, 3)
  return tokens.length > 0 ? tokens : undefined
}

const normalizeSearch = normalizeText

function buildLocationText(
  locationsText: string | null | undefined,
  locations: (ResolvedSessionLocation | null)[]
): string {
  const parts = locations.flatMap((loc) =>
    loc ? [loc.name, loc.address, loc.city, loc.postalCode, loc.department, loc.region] : []
  )
  if (typeof locationsText === 'string' && locationsText.length > 0) {
    parts.push(locationsText)
  }
  return normalizeSearch(parts.filter((v): v is string => typeof v === 'string').join(' '))
}

function buildSearchText(course: CourseListItem, locationsText: string | null | undefined): string {
  return [course.title, course.description, locationsText, course.certifierName, course.category]
    .map(normalizeSearch)
    .join(' ')
}

/**
 * Localisation résolue d'une session : celle du centre quand la session y est
 * rattachée (`centreSlug`), sinon la localisation Digiforma de la session.
 * `latitude`/`longitude` viennent du géocodage BAN du centre.
 */
export interface ResolvedSessionLocation extends CourseSessionLocation {
  address: string | null
  latitude: number | null
  longitude: number | null
}

function resolveSessionLocation(
  session: CourseSession,
  centresBySlug: Map<string, DirectusCentre>
): ResolvedSessionLocation | null {
  const centre = session.location?.centreSlug
    ? centresBySlug.get(session.location.centreSlug)
    : undefined
  if (centre) {
    return {
      name: centre.name,
      city: centre.city,
      postalCode: centre.postal_code,
      department: centre.department,
      region: centre.region,
      centreSlug: centre.slug,
      address: centre.address,
      latitude: centre.latitude ?? null,
      longitude: centre.longitude ?? null
    }
  }
  const loc = session.location
  if (!loc) return null
  return { ...loc, address: null, latitude: null, longitude: null }
}

export interface CatalogRow {
  course: CourseListItem
  updatedAt: string
  searchText: string
  locationText: string
  /** Aligné sur `course.sessions` — null quand la session n'a pas de localisation. */
  locations: (ResolvedSessionLocation | null)[]
}

function toCatalogRow(
  raw: DirectusFormation,
  centresBySlug: Map<string, DirectusCentre>
): CatalogRow {
  const course = toListItem(raw)
  // Aligné sur `course.sessions` (null quand la session n'a pas de
  // localisation) : l'assistant indexe `locations` par numéro de session —
  // filtrer les trous ici décalerait la correspondance.
  const locations = (course.sessions ?? []).map((s) => resolveSessionLocation(s, centresBySlug))

  return {
    course,
    updatedAt: toIsoString(raw.updated_at),
    searchText: buildSearchText(course, raw.locations_text),
    locationText: buildLocationText(raw.locations_text, locations),
    locations
  }
}

function parseModalities(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
}

const DURATION_BUCKETS: DurationBucket[] = ['courte', 'moyenne', 'longue']
const DURATION_BUCKET_KEYS = new Set<string>(DURATION_BUCKETS)

function parseDurations(value: string | undefined): DurationBucket[] {
  if (!value) return []
  return value
    .split(',')
    .map((d) => d.trim())
    .filter((d): d is DurationBucket => DURATION_BUCKET_KEYS.has(d))
}

/**
 * Tranche de durée — classifieur unique : le front affiche
 * `course.durationBucket` sans recalculer. Bornes continues pour ne laisser
 * aucun trou (8,5 h et 1,5 j tombent en « moyenne »).
 * Recalculée depuis les durées brutes plutôt que lue du champ : les rows
 * en cache écrites avant l'ajout du champ restent filtrables.
 */
function durationBucket(course: {
  durationHours: number | null
  durationDays: number | null
}): DurationBucket {
  const hours = course.durationHours ?? 0
  if (hours > 0) {
    if (hours <= 8) return 'courte'
    if (hours <= 40) return 'moyenne'
    return 'longue'
  }

  const days = course.durationDays ?? 1
  if (days <= 1) return 'courte'
  if (days <= 5) return 'moyenne'
  return 'longue'
}

function matchesDurationBucket(course: CourseListItem, bucket: DurationBucket): boolean {
  return durationBucket(course) === bucket
}

function matchesCertifying(course: CourseListItem, certifying: boolean | undefined): boolean {
  if (certifying === undefined) return true
  const hasCertification =
    typeof course.certification === 'string' && course.certification.trim().length > 0
  return certifying === hasCertification
}

function matchesDurationRange(
  course: CourseListItem,
  min: number | undefined,
  max: number | undefined
): boolean {
  const hours = course.durationHours ?? 0
  if (min !== undefined && hours < min) return false
  if (max !== undefined && hours > max) return false
  return true
}

function matchesDurationBuckets(course: CourseListItem, durations: string | undefined): boolean {
  const buckets = parseDurations(durations)
  if (buckets.length === 0) return true
  return buckets.some((b) => matchesDurationBucket(course, b))
}

function matchesPriceRange(
  course: CourseListItem,
  min: number | undefined,
  max: number | undefined
): boolean {
  const price = course.price ?? 0
  if (min !== undefined && price < min) return false
  if (max !== undefined && (course.price ?? Infinity) > max) return false
  return true
}

function matchesCenter(course: CourseListItem, center: string | undefined): boolean {
  if (!center) return true
  return course.centerSlug === center || course.centerSlugs.includes(center)
}

function matchesModalities(course: CourseListItem, modalities: string | undefined): boolean {
  const wanted = parseModalities(modalities)
  if (wanted.length === 0) return true
  return wanted.some((m) => course.modalities.includes(m))
}

/**
 * Tokens de localisation : pas de stop words (les noms de départements en
 * contiennent : « Val-de-Marne »), longueur min 2 pour capter les départements
 * à 1-2 chiffres saisis par l'utilisateur (« 69 », « 75 »).
 */
function toLocationTokens(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  const tokens = normalizeSearch(raw)
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length >= 2)
  return tokens && tokens.length > 0 ? tokens : undefined
}

function wordPrefixMatch(field: string | null | undefined, token: string): boolean {
  if (!field) return false
  return normalizeSearch(field)
    .split(/[^a-z0-9]+/)
    .some((word) => word.startsWith(token))
}

type SessionLocation = ResolvedSessionLocation

/**
 * Départements corses émis par le geosuggest (« 2A »/« 2B ») : ce ne sont ni
 * des codes postaux ni des préfixes de nom. On les déplie sur le bloc postal
 * « 20x » (2A = 200xx–201xx, 2B = 202xx–206xx) et le nom du département.
 */
const CORSICA_DEPARTMENTS: Record<string, { cpPrefixes: string[]; nameTokens: string[] }> = {
  '2a': { cpPrefixes: ['200', '201'], nameTokens: ['corse', 'sud'] },
  '2b': { cpPrefixes: ['202', '203', '204', '205', '206'], nameTokens: ['haute', 'corse'] }
}

function corsicaNameMatches(nameTokens: string[], fields: (string | null | undefined)[]): boolean {
  return nameTokens.every((name) => fields.some((field) => wordPrefixMatch(field, name)))
}

/**
 * Repli texte (aucune session géolocalisée, ou label de commune en mode géo) :
 * mêmes règles de matching que par session, sur le `locationText` agrégé.
 */
function matchesLocationText(locationText: string, tokens: string[]): boolean {
  return tokens.every((token) => {
    const corsica = CORSICA_DEPARTMENTS[token]
    return corsica
      ? corsica.cpPrefixes.some((prefix) => wordPrefixMatch(locationText, prefix)) ||
          corsicaNameMatches(corsica.nameTokens, [locationText])
      : wordPrefixMatch(locationText, token)
  })
}

/**
 * Numérique : code postal exact (5 chiffres), préfixe CP (3-4) ou code
 * département via préfixe CP (1-2 : « 69 » matche « 69003 »).
 * Alpha : préfixe de mot sur ville / département / région / adresse / nom du centre.
 */
function locationTokenMatches(token: string, loc: SessionLocation): boolean {
  const corsica = CORSICA_DEPARTMENTS[token]
  if (corsica) {
    return (
      corsica.cpPrefixes.some((prefix) => (loc.postalCode ?? '').startsWith(prefix)) ||
      corsicaNameMatches(corsica.nameTokens, [loc.name, loc.city, loc.department, loc.region])
    )
  }
  if (/^\d+$/.test(token)) {
    const cp = loc.postalCode ?? ''
    if (token.length === 5) return cp === token
    if (token.length <= 4) return cp.startsWith(token)
    return false
  }
  return [loc.name, loc.address, loc.city, loc.department, loc.region].some((field) =>
    wordPrefixMatch(field, token)
  )
}

// Rayon de recherche « autour de » quand la localisation est un point
// géographique (lat,lng — émis par le geosuggest communes).
const GEO_SEARCH_RADIUS_KM = 50

interface GeoPoint {
  lat: number
  lng: number
  /** Nom de la commune transporté par le geosuggest (« lat,lng|Lyon »). */
  label?: string
}

function parseGeoLocation(location: string | undefined): GeoPoint | null {
  const match = location
    ?.trim()
    .match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)(?:\|(.*))?$/)
  if (!match) return null
  return { lat: Number(match[1]), lng: Number(match[2]), label: match[3]?.trim() || undefined }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Mode géographique (`lat,lng` issu du geosuggest, optionnellement suivi de
 * « |Commune ») : une session matche si son centre est à moins de
 * GEO_SEARCH_RADIUS_KM du point. Quand aucune session n'est géocodée
 * (localisation Digiforma seule), repli sur `locationText` avec le nom de
 * commune transporté par le geosuggest.
 * Mode texte : tous les tokens doivent matcher dans la MÊME session —
 * « lyon 13002 » ne matche pas une formation à Lyon 69003 + Marseille 13002.
 * Repli sur `locationText` quand aucune session n'est géolocalisée.
 */
export function matchesLocation(
  row: Pick<CatalogRow, 'locations' | 'locationText'>,
  location: string | undefined
): boolean {
  const geo = parseGeoLocation(location)
  if (geo) {
    const geocoded = row.locations.filter(
      (loc): loc is ResolvedSessionLocation =>
        loc != null && loc.latitude != null && loc.longitude != null
    )
    if (geocoded.length > 0) {
      return geocoded.some(
        (loc) =>
          loc.latitude != null &&
          loc.longitude != null &&
          haversineKm(geo.lat, geo.lng, loc.latitude, loc.longitude) <= GEO_SEARCH_RADIUS_KM
      )
    }
    const tokens = toLocationTokens(geo.label)
    return tokens != null && matchesLocationText(row.locationText, tokens)
  }

  const tokens = toLocationTokens(location)
  if (!tokens) return true

  const resolved = row.locations.filter((loc): loc is ResolvedSessionLocation => loc !== null)
  if (resolved.length === 0) {
    return matchesLocationText(row.locationText, tokens)
  }
  return resolved.some((loc) => tokens.every((token) => locationTokenMatches(token, loc)))
}

function matchesSearchQuery(row: CatalogRow, search: string | undefined): boolean {
  const tokens = toSearchTokens(search)
  if (!tokens) return true
  return tokens.every((token) => row.searchText.includes(token))
}

type FacetDimension =
  | 'family'
  | 'subFamily'
  | 'modalities'
  | 'durations'
  | 'location'
  | 'cpf'
  | 'certifying'
  | 'availability'

// Disponibilité dérivée des sessions — mêmes bornes que `buildSessionBadge`
// côté front : session qui démarre dans le mois courant (UTC), session à
// venir plus tard, ou aucune session à venir (« sur demande »).
function courseAvailability(course: CourseListItem): CourseAvailability {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const upcoming = (course.sessions ?? []).filter(
    (s) => s.startDate && new Date(`${s.startDate}T00:00:00Z`) >= today
  )
  if (!upcoming.length) return CourseAvailability.onDemand

  const now = new Date()
  const thisMonth = upcoming.some((s) => {
    const d = new Date(`${s.startDate}T00:00:00Z`)
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth()
  })
  return thisMonth ? CourseAvailability.thisMonth : CourseAvailability.scheduled
}

function matchesCourse(row: CatalogRow, query: ListCoursesDto, except?: FacetDimension): boolean {
  const checks: { dim: FacetDimension | null; ok: boolean }[] = [
    { dim: 'family', ok: !query.family || row.course.familySlug === query.family },
    { dim: 'subFamily', ok: !query.subFamily || row.course.subFamilySlug === query.subFamily },
    { dim: 'cpf', ok: query.cpf === undefined || row.course.cpf === query.cpf },
    { dim: 'certifying', ok: matchesCertifying(row.course, query.certifying) },
    { dim: null, ok: matchesDurationRange(row.course, query.durationMin, query.durationMax) },
    { dim: 'durations', ok: matchesDurationBuckets(row.course, query.durations) },
    { dim: null, ok: matchesPriceRange(row.course, query.priceMin, query.priceMax) },
    { dim: null, ok: matchesCenter(row.course, query.center) },
    { dim: 'modalities', ok: matchesModalities(row.course, query.modalities) },
    { dim: 'location', ok: matchesLocation(row, query.location) },
    {
      dim: 'availability',
      ok: !query.availability || courseAvailability(row.course) === query.availability
    },
    { dim: null, ok: matchesSearchQuery(row, query.search) }
  ]
  return checks.every((check) => check.dim === except || check.ok)
}

/**
 * Compteurs par dimension, chacune calculée en ignorant son propre filtre :
 * le front n'affiche que les options qui renvoient des résultats.
 */
function computeCatalogFacets(rows: CatalogRow[], query: ListCoursesDto): CatalogFacets {
  const countByKeys = (
    except: FacetDimension,
    getKeys: (row: CatalogRow) => (string | null)[]
  ): Record<string, number> => {
    const counts: Record<string, number> = {}
    for (const row of rows) {
      if (!matchesCourse(row, query, except)) continue
      for (const key of new Set(getKeys(row))) {
        if (key) counts[key] = (counts[key] ?? 0) + 1
      }
    }
    return counts
  }

  const countWhere = (except: FacetDimension, predicate: (row: CatalogRow) => boolean): number =>
    rows.filter((row) => matchesCourse(row, query, except) && predicate(row)).length

  return {
    families: countByKeys('family', (row) => [row.course.familySlug]),
    subFamilies: countByKeys('subFamily', (row) => [row.course.subFamilySlug]),
    modalities: countByKeys('modalities', (row) => row.course.modalities),
    durations: countByKeys('durations', (row) =>
      DURATION_BUCKETS.filter((bucket) => matchesDurationBucket(row.course, bucket))
    ),
    // Département ET région sont comptés : le sélecteur de localisation du
    // front propose les deux dimensions, la recherche plein-texte couvrant
    // déjà les villes.
    locations: countByKeys('location', (row) =>
      row.locations.flatMap((loc) => (loc ? [loc.department, loc.region] : []))
    ),
    cpf: countWhere('cpf', (row) => row.course.cpf === true),
    certifying: countWhere(
      'certifying',
      (row) =>
        typeof row.course.certification === 'string' && row.course.certification.trim() !== ''
    )
  }
}

function sortCatalogRows(
  rows: CatalogRow[],
  sort: CourseSortField | undefined,
  order: CourseSortOrder | undefined
): CatalogRow[] {
  const direction = order === CourseSortOrder.asc ? 1 : -1

  return [...rows].sort((a, b) => {
    if (sort === CourseSortField.name) {
      return direction * a.course.title.localeCompare(b.course.title)
    }

    if (sort === CourseSortField.duration) {
      const ah = a.course.durationHours ?? 0
      const bh = b.course.durationHours ?? 0
      if (ah !== bh) return direction * (ah - bh)
    }

    if (sort === CourseSortField.price) {
      const ap = a.course.price ?? 0
      const bp = b.course.price ?? 0
      if (ap !== bp) return direction * (ap - bp)
    }

    return direction * a.updatedAt.localeCompare(b.updatedAt)
  })
}

const ROWS_CACHE_KEY = 'courses:rows'

// Filtres actifs conservés avec une recherche sans résultat — jamais de
// donnée personnelle (la localisation « autour de moi » est dégradée par le
// service de journalisation).
function searchMissContext(query: ListCoursesDto): SearchMissContext {
  const {
    search: _search,
    page: _page,
    limit: _limit,
    sort: _sort,
    order: _order,
    ...filters
  } = query
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined)
  ) as SearchMissContext
}

/** Listes « a,b » insensibles à l'ordre côté filtre → triées dans la clé. */
function canonicalCsv(value: string | undefined): string | undefined {
  const items = value
    ?.split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return items?.length ? [...new Set(items)].sort().join(',') : undefined
}

/**
 * Clé canonique pour `courses:list:*` : ordre des champs fixé ici, pas celui
 * des params d'URL — deux requêtes équivalentes partagent la même entrée.
 * L'encodage JSON évite les collisions de séparateur. `search`/`location`
 * (texte libre) sont volontairement absents : ces requêtes ne sont jamais
 * cachées (voir `list()`).
 */
function listCacheKey(query: ListCoursesDto): string {
  return `courses:list:${JSON.stringify({
    availability: query.availability,
    center: query.center,
    certifying: query.certifying,
    cpf: query.cpf,
    durationMax: query.durationMax,
    durationMin: query.durationMin,
    durations: canonicalCsv(query.durations),
    family: query.family,
    limit: query.limit,
    modalities: canonicalCsv(query.modalities),
    order: query.order,
    page: query.page,
    priceMax: query.priceMax,
    priceMin: query.priceMin,
    sort: query.sort,
    subFamily: query.subFamily
  })}`
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name)

  constructor(
    private readonly cache: CacheService,
    private readonly catalog: DirectusCatalogService,
    private readonly searchMisses: SearchMissesService
  ) {}

  async list(query: ListCoursesDto): Promise<CoursePage> {
    // `search`/`location` sont du texte libre : jamais cachés — chaque saisie
    // créerait une entrée Redis d'1 h, pollution exploitable depuis cet
    // endpoint public. Le recalcul sur `courses:rows` (cachées) est peu coûteux.
    const cacheKey = !query.search && !query.location ? listCacheKey(query) : undefined
    const cached = cacheKey ? await this.cache.get<CoursePage>(cacheKey) : undefined
    // Une page vide en cache peut être un résidu dégradé (écrit avant la
    // garde anti-vide) : ignorée — le recalcul reste bon marché sur des
    // rows déjà cachées.
    if (cached?.items.length) {
      return cached
    }

    const rows = await this.getCatalogRows()
    const filtered = rows.filter((row) => matchesCourse(row, query))
    const sorted = sortCatalogRows(filtered, query.sort, query.order)

    const total = sorted.length
    const skip = (query.page - 1) * query.limit
    const items = sorted.slice(skip, skip + query.limit).map((row) => row.course)

    const result: CoursePage = {
      items,
      total,
      page: query.page,
      pageSize: query.limit,
      facets: computeCatalogFacets(rows, query)
    }

    // Recherche textuelle sans aucune correspondance : journalisée pour la
    // revue produit (manques catalogue). Non bloquant — le service n'échoue
    // jamais et ne doit pas retarder la réponse. Un catalogue vide (Directus
    // indisponible, sync incomplète) n'est pas un manque : rien n'est journalisé.
    if (query.search && total === 0 && rows.length > 0) {
      void this.searchMisses.record({
        query: query.search,
        outcome: 'no_result',
        source: 'catalog',
        context: searchMissContext(query)
      })
    }

    // Un résultat vide n'est jamais caché : dataset dégradé (Directus
    // indisponible ou sync incomplète) ou page filtrée sans correspondance —
    // dans les deux cas rien à figer pendant le TTL.
    if (result.items.length > 0 && cacheKey) {
      await this.cache.set(cacheKey, result)
    }
    return result
  }

  async findBySlug(slug: string, family?: string): Promise<Course | null> {
    const familySuffix = family ? `:${family}` : ''
    const cacheKey = `courses:detail${familySuffix}:${slug}`
    const cached = await this.cache.get<Course>(cacheKey)
    if (cached) {
      return cached
    }

    const all = await this.getAllFormations()
    const raw = all.find((course) => {
      if (course.slug !== slug) return false
      if (family && course.famille?.slug !== family) return false
      return true
    })

    if (!raw) {
      return null
    }

    const result = toCourse(raw)
    await this.cache.set(cacheKey, result)
    return result
  }

  async families(): Promise<FamilyWithCount[]> {
    const cacheKey = 'courses:families'
    const cached = await this.cache.get<FamilyWithCount[]>(cacheKey)
    if (cached?.length) {
      return cached
    }

    const rows = await this.getCatalogRows()
    const counts = new Map<string, number>()

    for (const row of rows) {
      const slug = row.course.familySlug
      if (!slug) continue
      counts.set(slug, (counts.get(slug) ?? 0) + 1)
    }

    const result: FamilyWithCount[] = Array.from(counts.entries())
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => a.slug.localeCompare(b.slug))

    if (result.length > 0) {
      await this.cache.set(cacheKey, result)
    }
    return result
  }

  /**
   * Toutes les formations publiées avec leurs localisations résolues —
   * utilisé par la recherche assistée pour construire le digest catalogue
   * envoyé au modèle (les recommandations sont ensuite re-résolues ici,
   * jamais reprises telles quelles de la sortie LLM).
   */
  async allCourses(): Promise<CatalogRow[]> {
    return this.getCatalogRows()
  }

  async applyFamilies(): Promise<FamilyApplyResult> {
    const [formations, familyBySlug, subFamilyByFamilySlug] = await Promise.all([
      this.catalog.fetchAllFormations(),
      this.catalog.getFamilyIdsBySlug(),
      this.catalog.getSubFamilyIdsByFamilySlug()
    ])

    const assignments = new Map<string, AssignmentProposal>()
    for (const row of formations) {
      const category = row.category_name
      if (!category) continue

      const slug = slugifyCategory(category)
      const proposal: AssignmentProposal = {}

      // Une famille éditoriale déjà positionnée n'est jamais écrasée.
      if (familyBySlug.has(slug) && !(row.famille?.slug && row.famille.slug !== slug)) {
        proposal.famille = slug
      }

      // Même mécanisme une strate plus bas : la catégorie Digiforma propose
      // une sous-famille de la famille effective — jamais écrasée si posée.
      const effectiveFamily = proposal.famille ?? row.famille?.slug ?? null
      if (
        !row.sous_famille?.slug &&
        effectiveFamily &&
        subFamilyByFamilySlug.get(effectiveFamily)?.has(slug)
      ) {
        proposal.sousFamille = slug
      }

      if (proposal.famille || proposal.sousFamille) {
        assignments.set(row.digiforma_id, proposal)
      }
    }

    const result = await this.catalog.applyFamilyAssignments(assignments)
    await this.cache.invalidateCatalog()
    return result
  }

  private async getCatalogRows(): Promise<CatalogRow[]> {
    const cached = await this.cache.get<CatalogRow[]>(ROWS_CACHE_KEY)
    // [] est un CatalogRow[] valide mais jamais servi : une entrée vide peut
    // être un résidu d'un catalogue dégradé écrit avant la garde anti-vide.
    if (isCatalogRowsCache(cached) && cached.length > 0) {
      return cached
    }

    const [all, centresBySlug] = await Promise.all([
      this.getAllFormations(),
      this.getCentresBySlug()
    ])
    const rows = all.map((raw) => toCatalogRow(raw, centresBySlug))
    if (rows.length > 0) {
      await this.cache.set(ROWS_CACHE_KEY, rows)
    }
    return rows
  }

  /**
   * Centres indexés par slug : les localisations de session sont résolues
   * via `centreSlug` — adresse, ville, CP, département et coordonnées BAN
   * vivent sur le centre, pas sur la session. Centres indisponibles →
   * repli sur la localisation portée par la session.
   */
  private async getCentresBySlug(): Promise<Map<string, DirectusCentre>> {
    const cached = await this.cache.get<DirectusCentre[]>('centres:all')
    if (cached?.length) {
      return new Map(cached.map((c) => [c.slug, c]))
    }
    try {
      const centres = await this.catalog.fetchAllCentres()
      // Même règle que le catalogue : un référentiel centres vide (Directus
      // indisponible) n'est ni servi ni figé — sinon les sessions perdent
      // leur géocodage centre pendant tout le TTL.
      if (centres.length > 0) {
        await this.cache.set('centres:all', centres)
      }
      return new Map(centres.map((c) => [c.slug, c]))
    } catch (error) {
      this.logger.warn({ error }, 'Centres fetch failed — session locations will be used as-is')
      return new Map()
    }
  }

  private async getAllFormations(): Promise<DirectusFormation[]> {
    const cacheKey = 'formations:all'
    const cached = await this.cache.get<DirectusFormation[]>(cacheKey)
    if (cached?.length) {
      return cached
    }

    const rows = await this.catalog.fetchAllFormations()
    if (rows.length > 0) {
      await this.cache.set(cacheKey, rows)
    }
    return rows
  }
}

function isCatalogRowsCache(value: unknown): value is CatalogRow[] {
  return Array.isArray(value) && (value.length === 0 || 'searchText' in value[0])
}
