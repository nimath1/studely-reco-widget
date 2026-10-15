import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { CentreListItem } from '@studely/types'
import type { FormationDirectusPayload } from '../digiforma/digiforma.mapper'

export interface FamilyApplyResult {
  assigned: number
  cleared: number
  subAssigned: number
  failed: number
}

export interface AssignmentProposal {
  famille?: string
  sousFamille?: string
}

// `image_url` est exclu : ce n'est plus une colonne — l'URL source vit dans
// `raw` et la sync importe le fichier dans `directus_files` (champ `image`).
export type DirectusFormation = Omit<FormationDirectusPayload, 'image_url'> & {
  id: number
  famille: { id: number; slug: string } | null
  sous_famille: { id: number; slug: string; name: string } | null
  /** Champ éditorial — hors payload de sync, jamais écrit par upsertMany. */
  short_description: string | null
  /** Alias M2M `formations_centres` — lignes de jonction (`centre.slug`). */
  centres: Array<number | { centre: { slug: string } | null }> | null
  validity: string | null
  image: string | null
  created_at: string | null
  updated_at: string | null
}

export type DirectusCentre = CentreListItem

export interface GeocodableCentre {
  id: number
  slug: string
  name: string
  status: string
  address: string | null
  geocoded_address: string | null
  department?: string | null
  city?: string | null
}

export interface CentreGeodata {
  city: string | null
  postal_code: string | null
  department: string | null
  region: string | null
  latitude: number
  longitude: number
  geocoded_address: string | null
}

interface FetchLikeResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

interface UpsertBatch {
  create: FormationDirectusPayload[]
  update: (FormationDirectusPayload & { id: number })[]
}

interface ExistingFormation {
  id: number
  digiforma_id: string
  image?: { id: string; description: string | null } | null
  [key: string]: unknown
}

// Marqueur posé dans la description du fichier importé : permet de
// distinguer un visuel importé par la sync d'un fichier posé par un
// éditeur (jamais écrasé) et de détecter un changement d'URL source.
const IMAGE_IMPORT_MARKER = 'digiforma-sync:'

// Réécrits à chaque sync : données volatiles/techniques. Tous les autres
// champs ne sont proposés que quand le champ Directus est vide — une
// valeur éditoriale n'est jamais écrasée.
const ALWAYS_SYNCED_FIELDS = new Set(['digiforma_id', 'sessions', 'raw'])

/** Transporte le statut HTTP pour distinguer 5xx/429 (rejouables) des 4xx. */
class DirectusRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'DirectusRequestError'
  }
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

const ALL_CENTRE_FIELDS = [
  'id',
  'status',
  'slug',
  'name',
  'address',
  'city',
  'postal_code',
  'short_description',
  'department',
  'departments_covered',
  'region',
  'specialties',
  'latitude',
  'longitude'
]

const ALL_FORMATION_FIELDS = [
  'id',
  'digiforma_id',
  'slug',
  'title',
  'description',
  'short_description',
  'duration_days',
  'duration_hours',
  'price',
  'cpf',
  'cpf_code',
  'certification',
  'certifier_name',
  'category_name',
  'modalities',
  'center_slug',
  'center_slugs',
  'centres.centre.slug',
  'sessions',
  'locations_text',
  'blocks',
  'pedagogy',
  'evaluation',
  'validity',
  'image',
  'generated_program_url',
  'status',
  'seo_title',
  'seo_description',
  'seo_canonical',
  'raw',
  'famille.slug',
  'sous_famille.slug',
  'sous_famille.name',
  'created_at',
  'updated_at'
]

@Injectable()
export class DirectusCatalogService {
  private readonly logger = new Logger(DirectusCatalogService.name)
  private readonly token: string
  private readonly baseUrl: string
  private readonly timeoutMs = 10_000
  private readonly maxRetries = 2
  private readonly updateConcurrency = 10

  constructor(config: ConfigService) {
    // Token facultatif : l'API doit démarrer sans accès Directus (dev,
    // environnements sans sync). Le catalogue Directus est alors simplement
    // indisponible, les endpoints dégradent gracieusement.
    this.token = config.get<string>('DIRECTUS_TOKEN') ?? ''
    this.baseUrl = config.get<string>('DIRECTUS_INTERNAL_URL') ?? ''
    if (!this.token || !this.baseUrl) {
      this.logger.warn('DIRECTUS_TOKEN or DIRECTUS_INTERNAL_URL missing: Directus catalog disabled')
    }
  }

  private get enabled(): boolean {
    return Boolean(this.token && this.baseUrl)
  }

  /**
   * Crée ou met à jour un lot de formations dans Directus.
   * L'affectation famille n'est jamais écrite : elle reste éditoriale.
   */
  async upsertMany(
    courses: FormationDirectusPayload[]
  ): Promise<{ inserted: number; updated: number }> {
    if (courses.length === 0 || !this.enabled) {
      return { inserted: 0, updated: 0 }
    }

    const existing = await this.fetchExisting(courses.map((c) => c.digiforma_id))
    const batch = this.buildBatch(courses, existing)

    const [created] = await Promise.all([
      this.createMany(batch.create),
      this.updateMany(batch.update)
    ])
    await this.syncFormationImages(courses, existing, created)

    return {
      inserted: batch.create.length,
      updated: batch.update.length
    }
  }

  /**
   * Importe le visuel Digiforma dans la librairie de fichiers et le lie au
   * champ `image` — un seul champ image, avec preview/remplacement dans
   * Directus. Règles :
   * - `image` vide → import + liaison ;
   * - `image` liée à un fichier marqué `digiforma-sync:` avec une autre URL →
   *   réimport (le visuel source a changé) ;
   * - fichier posé par un éditeur → jamais touché.
   */
  private async syncFormationImages(
    courses: FormationDirectusPayload[],
    existing: Map<string, ExistingFormation>,
    created: Array<{ id: number; digiforma_id: string }>
  ): Promise<void> {
    const createdIdByDigiformaId = new Map(created.map((r) => [r.digiforma_id, r.id]))

    for (const course of courses) {
      if (!course.image_url) continue

      const found = existing.get(course.digiforma_id)
      const formationId = found?.id ?? createdIdByDigiformaId.get(course.digiforma_id)
      if (!formationId) continue

      const marker = `${IMAGE_IMPORT_MARKER}${course.image_url}`
      const current = found?.image
      if (current) {
        if (current.description === marker) continue
        if (!current.description?.startsWith(IMAGE_IMPORT_MARKER)) continue
      }

      const fileId = await this.importFormationImage(course.image_url, course.title, marker)
      if (!fileId) continue

      await this.request(`${this.baseUrl}/items/formations/${formationId}`, 'PATCH', {
        image: fileId
      })
    }
  }

  private async importFormationImage(
    url: string,
    title: string,
    marker: string
  ): Promise<string | null> {
    try {
      const response = await this.request<{ data: { id: string } }>(
        `${this.baseUrl}/files/import`,
        'POST',
        { url, data: { title, description: marker } }
      )
      return response.data?.id ?? null
    } catch (error) {
      this.logger.warn({ error, url }, 'Formation image import failed — image left empty')
      return null
    }
  }

  /** Récupère l'intégralité des formations publiées (cache en amont si besoin). */
  async fetchAllFormations(): Promise<DirectusFormation[]> {
    if (!this.enabled) {
      return []
    }

    const url = new URL(`${this.baseUrl}/items/formations`)
    url.searchParams.set('filter[status][_eq]', 'published')
    url.searchParams.set('limit', '-1')
    for (const field of ALL_FORMATION_FIELDS) {
      url.searchParams.append('fields[]', field)
    }

    const response = await this.request<{ data: DirectusFormation[] }>(url.toString())
    return response.data ?? []
  }

  /**
   * Récupère l'intégralité des centres publiés. Le filtrage métier se fait
   * en mémoire côté API : les champs JSON (`departments_covered`,
   * `specialties`) ne supportent ni `_contains` ni `_icontains` dans
   * Directus, et l'opérateur `_json` n'a pas de wildcard tableau.
   */
  async fetchAllCentres(): Promise<DirectusCentre[]> {
    if (!this.enabled) {
      return []
    }

    const url = new URL(`${this.baseUrl}/items/centres`)
    url.searchParams.set('filter[status][_eq]', 'published')
    url.searchParams.set('limit', '-1')
    url.searchParams.set('sort', 'sort,name')
    for (const field of ALL_CENTRE_FIELDS) {
      url.searchParams.append('fields[]', field)
    }

    const response = await this.request<{ data: DirectusCentre[] }>(url.toString())
    return response.data ?? []
  }

  /**
   * Centres à géocoder : tous statuts confondus (un brouillon doit être
   * géolocalisé avant sa publication), champs minimaux. Le filtre « adresse
   * changée » se fait côté appelant via `geocoded_address`.
   */
  async fetchCentresForGeocoding(): Promise<GeocodableCentre[]> {
    if (!this.enabled) {
      return []
    }

    const url = new URL(`${this.baseUrl}/items/centres`)
    url.searchParams.set('limit', '-1')
    for (const field of [
      'id',
      'slug',
      'name',
      'status',
      'address',
      'geocoded_address',
      'department',
      'city'
    ]) {
      url.searchParams.append('fields[]', field)
    }

    const response = await this.request<{ data: GeocodableCentre[] }>(url.toString())
    return response.data ?? []
  }

  /** Écrit les champs dérivés d'un centre (géodata + nom issu du département). */
  async updateCentre(id: number, patch: Partial<CentreGeodata> & { name?: string }): Promise<void> {
    if (!this.enabled) {
      throw new Error('Directus catalog disabled: missing DIRECTUS_TOKEN or DIRECTUS_INTERNAL_URL')
    }
    await this.request(`${this.baseUrl}/items/centres/${id}`, 'PATCH', patch)
  }

  /**
   * Applique les affectations famille / sous-famille proposées (par la sync ou
   * par catégorie Digiforma) aux formations.
   * - `famille` est écrite si différente de l'actuelle ;
   * - `sous_famille` n'est écrite que si le champ est vide — une affectation
   *   éditoriale n'est jamais écrasée.
   * Retourne le nombre de formations affectées / désaffectées.
   */
  async applyFamilyAssignments(
    assignments: Map<string, AssignmentProposal>
  ): Promise<FamilyApplyResult> {
    if (!this.enabled) {
      throw new Error('Directus catalog disabled: missing DIRECTUS_TOKEN or DIRECTUS_INTERNAL_URL')
    }

    const [formations, familyBySlug, subFamilyByFamilySlug] = await Promise.all([
      this.fetchFormationsForAssignments(),
      this.getFamilyIdsBySlug(),
      this.getSubFamilyIdsByFamilySlug()
    ])

    const result: FamilyApplyResult = { assigned: 0, cleared: 0, subAssigned: 0, failed: 0 }
    // Thunks, pas de promesses : les PATCH ne partent qu'au moment où leur
    // tranche est exécutée — updateConcurrency borne réellement les requêtes
    // en vol (empiler des promesses les lancerait toutes en rafale).
    const tasks: Array<() => Promise<void>> = []

    for (const formation of formations) {
      const proposal = assignments.get(formation.digiforma_id)
      if (!proposal) continue

      const patch = this.buildAssignmentPatch(
        formation,
        proposal,
        familyBySlug,
        subFamilyByFamilySlug
      )
      if (Object.keys(patch).length === 0) continue

      tasks.push(async () => {
        await this.request(`${this.baseUrl}/items/formations/${formation.id}`, 'PATCH', patch)
        if (patch.famille !== undefined) result.assigned += 1
        if (patch.sous_famille !== undefined) result.subAssigned += 1
      })
    }

    for (let i = 0; i < tasks.length; i += this.updateConcurrency) {
      const slice = tasks.slice(i, i + this.updateConcurrency)
      // allSettled : un PATCH en échec n'interrompt pas les tranches
      // suivantes et aucun rejet n'est non géré — les échecs sont comptés.
      for (const outcome of await Promise.allSettled(slice.map((task) => task()))) {
        if (outcome.status === 'rejected') {
          result.failed += 1
          this.logger.warn({ error: outcome.reason }, 'Family assignment PATCH failed')
        }
      }
    }

    if (result.failed > 0) {
      this.logger.warn(`${result.failed}/${tasks.length} family assignment PATCH(es) failed`)
    }

    return result
  }

  private buildAssignmentPatch(
    formation: DirectusFormation,
    proposal: AssignmentProposal,
    familyBySlug: Map<string, number>,
    subFamilyByFamilySlug: Map<string, Map<string, number>>
  ): Record<string, number> {
    const patch: Record<string, number> = {}
    const currentFamilleSlug = formation.famille?.slug ?? null

    if (proposal.famille && proposal.famille !== currentFamilleSlug) {
      const familyId = familyBySlug.get(proposal.famille)
      if (familyId !== undefined) patch.famille = familyId
    }

    const effectiveFamilleSlug = proposal.famille ?? currentFamilleSlug
    if (proposal.sousFamille && !formation.sous_famille && effectiveFamilleSlug) {
      const subFamilyId = subFamilyByFamilySlug.get(effectiveFamilleSlug)?.get(proposal.sousFamille)
      if (subFamilyId !== undefined) patch.sous_famille = subFamilyId
    }

    return patch
  }

  private async fetchFormationsForAssignments(): Promise<DirectusFormation[]> {
    const url = new URL(`${this.baseUrl}/items/formations`)
    url.searchParams.set('limit', '-1')
    url.searchParams.append('fields[]', 'id')
    url.searchParams.append('fields[]', 'digiforma_id')
    url.searchParams.append('fields[]', 'famille.slug')
    url.searchParams.append('fields[]', 'sous_famille.slug')

    const response = await this.request<{ data: DirectusFormation[] }>(url.toString())
    return response.data ?? []
  }

  async getFamilyIdsBySlug(): Promise<Map<string, number>> {
    const url = new URL(`${this.baseUrl}/items/familles_formation`)
    url.searchParams.set('limit', '-1')
    url.searchParams.append('fields[]', 'id')
    url.searchParams.append('fields[]', 'slug')

    const response = await this.request<{ data: Array<{ id: number; slug: string }> }>(
      url.toString()
    )

    const map = new Map<string, number>()
    for (const row of response.data ?? []) {
      map.set(row.slug, row.id)
    }
    return map
  }

  /** Slugs de sous-familles publiées → id, regroupés par slug de famille. */
  async getSubFamilyIdsByFamilySlug(): Promise<Map<string, Map<string, number>>> {
    const url = new URL(`${this.baseUrl}/items/sous_familles_formation`)
    url.searchParams.set('filter[status][_eq]', 'published')
    url.searchParams.set('limit', '-1')
    url.searchParams.append('fields[]', 'id')
    url.searchParams.append('fields[]', 'slug')
    url.searchParams.append('fields[]', 'famille.slug')

    const response = await this.request<{
      data: Array<{ id: number; slug: string; famille: { slug: string } | null }>
    }>(url.toString())

    const map = new Map<string, Map<string, number>>()
    for (const row of response.data ?? []) {
      const familleSlug = row.famille?.slug
      if (!familleSlug) continue
      if (!map.has(familleSlug)) map.set(familleSlug, new Map())
      map.get(familleSlug)?.set(row.slug, row.id)
    }
    return map
  }

  private async fetchExisting(digiformaIds: string[]): Promise<Map<string, ExistingFormation>> {
    const map = new Map<string, ExistingFormation>()

    for (let i = 0; i < digiformaIds.length; i += 100) {
      const slice = digiformaIds.slice(i, i + 100)
      const url = new URL(`${this.baseUrl}/items/formations`)
      for (const field of ALL_FORMATION_FIELDS.filter(
        (f) => !f.includes('.') && f !== 'created_at' && f !== 'updated_at'
      )) {
        url.searchParams.append('fields[]', field)
      }
      url.searchParams.append('fields[]', 'image.id')
      url.searchParams.append('fields[]', 'image.description')
      url.searchParams.set('filter[digiforma_id][_in]', slice.join(','))
      url.searchParams.set('limit', '-1')

      const response = await this.request<{ data: ExistingFormation[] }>(url.toString())
      for (const row of response.data ?? []) {
        map.set(row.digiforma_id, row)
      }
    }

    return map
  }

  private buildBatch(
    courses: FormationDirectusPayload[],
    existing: Map<string, ExistingFormation>
  ): UpsertBatch {
    const batch: UpsertBatch = { create: [], update: [] }

    for (const course of courses) {
      const found = existing.get(course.digiforma_id)
      if (!found) {
        batch.create.push(course)
      } else {
        // Sync non destructive : un champ n'est écrit que s'il est vide
        // côté Directus — le contenu éditorial n'est jamais écrasé. Seuls
        // sessions/raw/digiforma_id restent réécrits à chaque run.
        const patch = {} as FormationDirectusPayload
        for (const [key, value] of Object.entries(course)) {
          const field = key as keyof FormationDirectusPayload
          if (ALWAYS_SYNCED_FIELDS.has(key) || isEmptyValue(found[key])) {
            patch[field] = value as never
          }
        }
        batch.update.push({ id: found.id, ...patch })
      }
    }

    return batch
  }

  // `image_url` n'est pas une colonne : on la retire du corps d'écriture.
  private toColumnPayload(row: FormationDirectusPayload): Record<string, unknown> {
    const data: Record<string, unknown> = { ...row }
    delete data.image_url
    return data
  }

  private async createMany(
    rows: FormationDirectusPayload[]
  ): Promise<Array<{ id: number; digiforma_id: string }>> {
    if (rows.length === 0) return []
    const response = await this.request<{
      data: Array<{ id: number; digiforma_id: string }>
    }>(
      `${this.baseUrl}/items/formations`,
      'POST',
      rows.map((r) => this.toColumnPayload(r))
    )
    return response?.data ?? []
  }

  private async updateMany(rows: UpsertBatch['update']): Promise<void> {
    for (let i = 0; i < rows.length; i += this.updateConcurrency) {
      const slice = rows.slice(i, i + this.updateConcurrency)
      await Promise.all(
        slice.map((row) => {
          const { id, ...rest } = row
          return this.request(
            `${this.baseUrl}/items/formations/${id}`,
            'PATCH',
            this.toColumnPayload(rest)
          )
        })
      )
    }
  }

  private async request<T>(
    url: string,
    method: 'GET' | 'POST' | 'PATCH' = 'GET',
    body?: unknown
  ): Promise<T> {
    let attempt = 0

    while (true) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

      try {
        const response = (await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal
        })) as unknown as FetchLikeResponse

        if (!response.ok) {
          const text = await response.text()
          throw new DirectusRequestError(
            `Directus ${method} ${url} failed: ${response.status} ${text}`,
            response.status
          )
        }

        if (response.status === 204) {
          return undefined as T
        }

        return (await response.json()) as T
      } catch (error) {
        if (attempt >= this.maxRetries || !this.isRetryable(error, method)) {
          throw error
        }

        const delay = 2 ** attempt * 100
        this.logger.warn(`Directus request retry ${attempt + 1} after ${delay}ms`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        attempt += 1
      } finally {
        clearTimeout(timeout)
      }
    }
  }

  // Retry borné aux méthodes idempotentes (GET/PATCH) sur faute
  // transitoire : erreur réseau/timeout, 5xx et 429. Jamais de retry sur
  // POST — un POST expiré peut avoir été traité côté Directus et le
  // rejouer créerait un doublon (createMany, import de fichier). Les 4xx
  // hors 429 sont des erreurs déterministes : inutile de rejouer.
  private isRetryable(error: unknown, method: 'GET' | 'POST' | 'PATCH'): boolean {
    if (method === 'POST') return false
    if (error instanceof DirectusRequestError) {
      return error.status === 429 || error.status >= 500
    }
    return true
  }
}
