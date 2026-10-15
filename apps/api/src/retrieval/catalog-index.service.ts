import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import type { CourseListItem } from '@studely/types'
import { CacheService } from '../common/cache/cache.service'
import { stemToken, stripHtml, tokenize } from '../common/utils/text.util'
import {
  CatalogService,
  type CatalogRow,
  type ResolvedSessionLocation
} from '../catalog/catalog.service'
import { HashingEmbeddingsProvider } from './embeddings/hashing-embeddings.provider'
import {
  EMBEDDINGS_PROVIDER,
  type EmbeddingsProvider,
  type RetrievalIndexInfo
} from './retrieval.types'

// Reconstruction de l'index : à chaque invalidation catalogue (sync
// Digiforma, purge Directus) et, par sécurité, après ce délai.
const MAX_AGE_MS = 15 * 60_000
// Rattrapage des purges faites par d'autres instances (Vercel : la sync ou
// le webhook Directus n'atterrit que sur l'une d'elles), au plus à cette
// fréquence.
const SHARED_SYNC_INTERVAL_MS = 30_000

// Pondération des champs dans le score lexical (BM25) : l'intitulé exact
// du catalogue prime, puis la classification et la certification.
const FIELD_WEIGHTS = {
  title: 3,
  classification: 2,
  certification: 2,
  description: 1,
  modalities: 1,
  location: 1
} as const

const MODALITY_LABELS: Record<string, string> = {
  presentiel: 'présentiel en centre',
  distanciel: 'à distance classe virtuelle',
  hybride: 'hybride mixte',
  inter: 'inter entreprise',
  intra: 'intra entreprise sur site',
  e_learning: 'e-learning en ligne'
}

/** Ce que l'index lit d'une row du catalogue publié (`CatalogService.allCourses()`). */
export type CatalogIndexEntry = Pick<CatalogRow, 'course' | 'locationText' | 'locations'>

export interface IndexedDocument {
  course: CourseListItem
  /** Terme racinisé → fréquence pondérée par champ. */
  terms: Map<string, number>
  /** Somme des fréquences pondérées (longueur du document). */
  length: number
  vector: number[]
  locationText: string
  /** Lieux résolus par session — le filtre de localisation raisonne par session. */
  // Alignées sur `course.sessions` — null pour une session sans lieu résolu.
  locations: (ResolvedSessionLocation | null)[]
}

export interface RetrievalIndex {
  info: RetrievalIndexInfo
  documents: IndexedDocument[]
  /** Terme → nombre de documents le contenant. */
  documentFrequency: Map<string, number>
  averageLength: number
}

const EMPTY_INDEX: RetrievalIndex = {
  info: {
    version: -1,
    builtAt: new Date(0).toISOString(),
    provider: 'none',
    degraded: false,
    documents: 0
  },
  documents: [],
  documentFrequency: new Map(),
  averageLength: 0
}

function addTerms(target: Map<string, number>, text: string, weight: number): void {
  for (const token of tokenize(text)) {
    const term = stemToken(token)
    target.set(term, (target.get(term) ?? 0) + weight)
  }
}

export function documentText(course: CourseListItem, locationText: string): string {
  return [
    course.title,
    course.category,
    course.subFamilyName,
    course.certification,
    course.certifierName,
    course.shortDescription,
    stripHtml(course.description),
    course.modalities.map((m) => MODALITY_LABELS[m] ?? m).join(' '),
    locationText
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('. ')
}

function buildTerms(course: CourseListItem, locationText: string): Map<string, number> {
  const terms = new Map<string, number>()
  addTerms(terms, course.title, FIELD_WEIGHTS.title)
  addTerms(terms, [course.category, course.subFamilyName].join(' '), FIELD_WEIGHTS.classification)
  addTerms(
    terms,
    [course.certification, course.certifierName].join(' '),
    FIELD_WEIGHTS.certification
  )
  addTerms(
    terms,
    [course.shortDescription, stripHtml(course.description)].join(' '),
    FIELD_WEIGHTS.description
  )
  addTerms(
    terms,
    course.modalities.map((m) => MODALITY_LABELS[m] ?? m).join(' '),
    FIELD_WEIGHTS.modalities
  )
  addTerms(terms, locationText, FIELD_WEIGHTS.location)
  return terms
}

/**
 * Index en mémoire des formations publiées : termes pondérés (BM25) +
 * vecteur d'embedding par formation. Reconstruit à la demande quand le
 * catalogue change (abonnement aux invalidations du cache) ou après
 * `MAX_AGE_MS` — et sur ordre (`POST /admin/retrieval/reindex`).
 */
@Injectable()
export class CatalogIndexService implements OnModuleDestroy {
  private readonly logger = new Logger(CatalogIndexService.name)
  private readonly fallback = new HashingEmbeddingsProvider()
  private index: RetrievalIndex = EMPTY_INDEX
  private stale = true
  // Incrémentée à chaque invalidation : une purge reçue pendant une
  // construction en cours ne doit pas être perdue quand celle-ci se termine.
  private generation = 0
  private lastSharedSyncAt = 0
  private building?: Promise<RetrievalIndex>
  private readonly unsubscribe: () => void

  constructor(
    private readonly catalog: CatalogService,
    private readonly cache: CacheService,
    @Inject(EMBEDDINGS_PROVIDER) private readonly embeddings: EmbeddingsProvider
  ) {
    this.unsubscribe = this.cache.onCatalogInvalidated(() => this.markStale())
  }

  onModuleDestroy(): void {
    this.unsubscribe()
  }

  /** Force la reconstruction au prochain accès (catalogue modifié). */
  markStale(): void {
    this.stale = true
    this.generation += 1
  }

  get info(): RetrievalIndexInfo {
    return this.index.info
  }

  /**
   * Vecteur de requête, avec le même provider que l'index courant. Si ce
   * provider ne répond plus, la recherche continue en lexical seul : un
   * vecteur du provider local ne serait pas comparable à ceux de l'index.
   */
  async embedQuery(text: string): Promise<number[]> {
    const provider = this.index.info.degraded ? this.fallback : this.embeddings
    try {
      const [vector] = await provider.embed([text])
      return vector ?? []
    } catch (error) {
      this.logger.warn({ error }, `Query embedding failed with ${provider.name} — lexical only`)
      return []
    }
  }

  async getIndex(): Promise<RetrievalIndex> {
    await this.syncSharedInvalidations()
    if (!this.needsRebuild()) return this.index
    return this.rebuild()
  }

  private async syncSharedInvalidations(): Promise<void> {
    const now = Date.now()
    if (now - this.lastSharedSyncAt < SHARED_SYNC_INTERVAL_MS) return
    this.lastSharedSyncAt = now
    // Une invalidation rattrapée passe par le listener → markStale().
    await this.cache.syncInvalidations()
  }

  async rebuild(): Promise<RetrievalIndex> {
    if (!this.building) {
      this.building = this.build().finally(() => {
        this.building = undefined
      })
    }
    return this.building
  }

  private needsRebuild(): boolean {
    if (this.stale) return true
    if (this.index.info.version !== this.cache.version) return true
    return Date.now() - Date.parse(this.index.info.builtAt) > MAX_AGE_MS
  }

  private async build(): Promise<RetrievalIndex> {
    const generation = this.generation
    const entries = await this.catalog.allCourses()
    const version = this.cache.version
    const { vectors, provider, degraded } = await this.embedEntries(entries)

    const documents = entries.map((entry, i): IndexedDocument => {
      const terms = buildTerms(entry.course, entry.locationText)
      let length = 0
      for (const weight of terms.values()) length += weight
      return {
        course: entry.course,
        terms,
        length,
        vector: vectors[i] ?? [],
        locationText: entry.locationText,
        locations: entry.locations
      }
    })

    const documentFrequency = new Map<string, number>()
    for (const document of documents) {
      for (const term of document.terms.keys()) {
        documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
      }
    }
    const totalLength = documents.reduce((sum, document) => sum + document.length, 0)

    this.index = {
      info: {
        version,
        builtAt: new Date().toISOString(),
        provider,
        degraded,
        documents: documents.length
      },
      documents,
      documentFrequency,
      averageLength: documents.length > 0 ? totalLength / documents.length : 0
    }
    // Un catalogue vide (Directus indisponible) n'est jamais figé, ni un
    // index dont le catalogue a changé pendant la construction : on
    // retentera au prochain accès.
    this.stale = documents.length === 0 || generation !== this.generation
    this.logger.log(
      `Retrieval index built: ${documents.length} courses, provider ${provider}${degraded ? ' (degraded)' : ''}`
    )
    return this.index
  }

  private async embedEntries(
    entries: CatalogIndexEntry[]
  ): Promise<{ vectors: number[][]; provider: string; degraded: boolean }> {
    const texts = entries.map((entry) => documentText(entry.course, entry.locationText))
    if (texts.length === 0) {
      return { vectors: [], provider: this.embeddings.name, degraded: false }
    }
    try {
      return {
        vectors: await this.embeddings.embed(texts),
        provider: this.embeddings.name,
        degraded: false
      }
    } catch (error) {
      if (this.embeddings === this.fallback) throw error
      this.logger.warn(
        { error },
        `Embeddings provider ${this.embeddings.name} failed — falling back to ${this.fallback.name}`
      )
      return {
        vectors: await this.fallback.embed(texts),
        provider: this.fallback.name,
        degraded: true
      }
    }
  }
}
