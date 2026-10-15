import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  RechercheSansResultat,
  SearchMissAggregate,
  SearchMissOutcome,
  SearchMissPage,
  SearchMissSource
} from '@studely/types'
import { DirectusItemsClient, type DirectusFilter } from '../directus/directus.items.client'
import { scrubPersonalData } from '../common/utils/pii.util'
import type { ListSearchMissesDto, SearchMissRangeDto } from './search-misses.dto'
import { normalizeQuery, sanitizeContext } from './search-misses.normalize'
import { aggregateSearchMisses, searchMissesToCsv } from './search-misses.report'

export const SEARCH_MISSES_COLLECTION = 'recherches_sans_resultat'

const MAX_QUERY_LENGTH = 500
const MIN_QUERY_LENGTH = 2
// Deux soumissions identiques dans la minute (double appel SSR/client,
// rechargement, retry) ne comptent qu'une fois.
const DEDUPE_WINDOW_MS = 60_000
const DEDUPE_MAX_ENTRIES = 1_000
const FETCH_PAGE_SIZE = 500
// Au-delà, l'agrégat serait tronqué en silence : on refuse et on invite à
// restreindre la période (`from` / `to`).
const FETCH_MAX_ROWS = 50_000
const DEFAULT_RETENTION_DAYS = 180
const DAY_MS = 86_400_000

const ROW_FIELDS = [
  'id',
  'date_created',
  'query_text',
  'query_normalized',
  'outcome',
  'source',
  'intent',
  'context',
  'reviewed'
]

export interface RecordSearchMissInput {
  query: string
  outcome: SearchMissOutcome
  source: SearchMissSource
  intent?: string | null
  /** Contexte non personnel : les valeurs non primitives ou vides sont ignorées. */
  context?: Record<string, unknown> | null
}

export interface PurgeResult {
  deleted: number
  cutoff: string | null
}

function parseRetentionDays(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isNaN(parsed) ? DEFAULT_RETENTION_DAYS : parsed
}

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)
}

function rangeFilter(range: SearchMissRangeDto): DirectusFilter {
  const bounds: Record<string, string> = {}
  if (range.from) bounds._gte = range.from
  if (range.to) bounds._lt = nextDay(range.to)
  return Object.keys(bounds).length > 0 ? { date_created: bounds } : {}
}

function withFilter(filter: DirectusFilter): DirectusFilter | undefined {
  return Object.keys(filter).length > 0 ? filter : undefined
}

/**
 * Journal des recherches sans correspondance (collection Directus
 * `recherches_sans_resultat`) : capture non bloquante côté API, consultation
 * et export agrégé pour la revue produit, purge des entrées de plus de
 * `SEARCH_MISS_RETENTION_DAYS` jours (RGPD — durée de conservation bornée).
 * La purge est planifiée hors process, comme la sync Digiforma : le workflow
 * GitHub `search-misses-purge.yml` appelle `POST /admin/search-misses/purge`
 * chaque nuit — un planificateur in-process ne tournerait que tant qu'une
 * instance serverless est chaude.
 */
@Injectable()
export class SearchMissesService {
  private readonly logger = new Logger(SearchMissesService.name)
  private readonly retentionDays: number
  private readonly recent = new Map<string, number>()

  constructor(
    config: ConfigService,
    private readonly directus: DirectusItemsClient
  ) {
    this.retentionDays = parseRetentionDays(config.get<string>('SEARCH_MISS_RETENTION_DAYS'))
  }

  /**
   * Journalise une requête sans correspondance. Ne lève jamais : la
   * journalisation ne doit ni faire échouer ni retarder la réponse au
   * visiteur. Retourne `true` quand une ligne a été écrite.
   */
  async record(input: RecordSearchMissInput): Promise<boolean> {
    if (!this.directus.enabled) return false

    const queryText = scrubPersonalData(input.query).trim().slice(0, MAX_QUERY_LENGTH)
    const queryNormalized = normalizeQuery(queryText)
    if (queryNormalized.length < MIN_QUERY_LENGTH) return false
    if (this.isDuplicate(`${input.source}:${input.outcome}:${queryNormalized}`)) return false

    try {
      const created = await this.directus.createOne<{ id: number }>(SEARCH_MISSES_COLLECTION, {
        query_text: queryText,
        query_normalized: queryNormalized,
        outcome: input.outcome,
        source: input.source,
        intent: scrubPersonalData(input.intent ?? '').trim() || null,
        context: sanitizeContext(input.context)
      })
      return created !== null
    } catch (error) {
      this.logger.warn(
        { error, source: input.source, outcome: input.outcome },
        'Failed to record search miss'
      )
      return false
    }
  }

  async list(query: ListSearchMissesDto): Promise<SearchMissPage> {
    const filter: DirectusFilter = rangeFilter(query)
    if (query.outcome) filter.outcome = { _eq: query.outcome }
    if (query.source) filter.source = { _eq: query.source }

    const result = await this.directus.readMany<RechercheSansResultat>(SEARCH_MISSES_COLLECTION, {
      filter: withFilter(filter),
      fields: ROW_FIELDS,
      sort: ['-date_created'],
      limit: query.limit,
      page: query.page,
      meta: 'filter_count'
    })

    return {
      items: result.data,
      total: result.meta?.filter_count ?? result.data.length,
      page: query.page,
      pageSize: query.limit
    }
  }

  /** Regroupe les requêtes par texte normalisé — les plus fréquentes d'abord. */
  async aggregate(range: SearchMissRangeDto): Promise<SearchMissAggregate[]> {
    return aggregateSearchMisses(await this.fetchAll(range))
  }

  async exportCsv(range: SearchMissRangeDto): Promise<string> {
    return searchMissesToCsv(await this.aggregate(range))
  }

  /** Supprime les entrées plus anciennes que la durée de conservation. */
  async purgeExpired(now = new Date()): Promise<PurgeResult> {
    if (this.retentionDays <= 0) return { deleted: 0, cutoff: null }

    const cutoff = new Date(now.getTime() - this.retentionDays * DAY_MS).toISOString()
    const filter: DirectusFilter = { date_created: { _lt: cutoff } }

    const expired = await this.directus.readMany<{ id: number }>(SEARCH_MISSES_COLLECTION, {
      filter,
      fields: ['id'],
      limit: 1,
      meta: 'filter_count'
    })
    const deleted = expired.meta?.filter_count ?? expired.data.length
    if (deleted > 0) {
      await this.directus.deleteMany(SEARCH_MISSES_COLLECTION, filter)
    }

    this.logger.log(`Search-miss purge: ${deleted} entries older than ${cutoff} removed`)
    return { deleted, cutoff }
  }

  private isDuplicate(key: string): boolean {
    const now = Date.now()
    const seenAt = this.recent.get(key)
    if (seenAt !== undefined && now - seenAt < DEDUPE_WINDOW_MS) return true

    if (this.recent.size >= DEDUPE_MAX_ENTRIES) this.evictExpired(now)
    this.recent.set(key, now)
    return false
  }

  private evictExpired(now: number): void {
    for (const [key, seenAt] of this.recent) {
      if (now - seenAt >= DEDUPE_WINDOW_MS) this.recent.delete(key)
    }
    // Rafale de requêtes distinctes dans la fenêtre : on repart de zéro
    // plutôt que de laisser la mémoire croître.
    if (this.recent.size >= DEDUPE_MAX_ENTRIES) this.recent.clear()
  }

  private async fetchAll(range: SearchMissRangeDto): Promise<RechercheSansResultat[]> {
    const filter = withFilter(rangeFilter(range))
    const rows: RechercheSansResultat[] = []

    for (let page = 1; ; page += 1) {
      const result = await this.directus.readMany<RechercheSansResultat>(SEARCH_MISSES_COLLECTION, {
        filter,
        fields: ROW_FIELDS,
        sort: ['-date_created'],
        limit: FETCH_PAGE_SIZE,
        page
      })
      rows.push(...result.data)
      if (result.data.length < FETCH_PAGE_SIZE) break
      if (rows.length >= FETCH_MAX_ROWS) {
        throw new BadRequestException(
          `Plus de ${FETCH_MAX_ROWS} recherches sur la période : restreignez-la avec from / to`
        )
      }
    }

    return rows
  }
}
