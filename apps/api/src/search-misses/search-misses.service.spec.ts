import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import type { RechercheSansResultat } from '@studely/types'
import { DirectusItemsClient } from '../directus/directus.items.client'
import type { ListSearchMissesDto } from './search-misses.dto'
import { SEARCH_MISSES_COLLECTION, SearchMissesService } from './search-misses.service'

type Mock = ReturnType<typeof vi.fn>

function row(overrides: Partial<RechercheSansResultat> = {}): RechercheSansResultat {
  return {
    id: 1,
    date_created: '2026-09-20T10:00:00.000Z',
    query_text: 'Formation drone',
    query_normalized: 'formation drone',
    outcome: 'no_result',
    source: 'catalog',
    intent: null,
    context: null,
    reviewed: false,
    ...overrides
  }
}

describe('SearchMissesService', () => {
  let service: SearchMissesService
  let directus: { enabled: boolean; createOne: Mock; readMany: Mock; deleteMany: Mock }
  let env: Record<string, string | undefined>

  async function build(): Promise<void> {
    const module = await Test.createTestingModule({
      providers: [
        SearchMissesService,
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
        { provide: DirectusItemsClient, useValue: directus }
      ]
    }).compile()
    service = module.get(SearchMissesService)
  }

  beforeEach(async () => {
    env = {}
    directus = {
      enabled: true,
      createOne: vi.fn().mockResolvedValue({ id: 1 }),
      readMany: vi.fn().mockResolvedValue({ data: [] }),
      deleteMany: vi.fn().mockResolvedValue(undefined)
    }
    await build()
  })

  describe('record', () => {
    it('stores the scrubbed text, its normalized key and a clean context', async () => {
      const stored = await service.record({
        query: '  Former 8 salariés au CACES — contact jean@exemple.fr ',
        outcome: 'no_result',
        source: 'catalog',
        context: {
          family: 'logistique',
          location: '45.76421,4.83559',
          modalities: '',
          cpf: true,
          nested: { not: 'allowed' }
        }
      })

      expect(stored).toBe(true)
      expect(directus.createOne).toHaveBeenCalledWith(SEARCH_MISSES_COLLECTION, {
        query_text: 'Former 8 salariés au CACES — contact [email]',
        query_normalized: 'former 8 salaries au caces contact email',
        outcome: 'no_result',
        source: 'catalog',
        intent: null,
        context: { family: 'logistique', location: '45.8,4.8', cpf: true }
      })
    })

    it('keeps the intent, drops an empty context and truncates long queries', async () => {
      await service.record({
        query: 'a'.repeat(600),
        outcome: 'out_of_catalog',
        source: 'assistant',
        intent: ' formation-pilotage ',
        context: { empty: '' }
      })

      const payload = directus.createOne.mock.calls[0]![1] as Record<string, unknown>
      expect((payload.query_text as string).length).toBe(500)
      expect(payload.intent).toBe('formation-pilotage')
      expect(payload.context).toBeNull()
    })

    it('masks personal data in the intent and the context as well', async () => {
      await service.record({
        query: 'former mes équipes',
        outcome: 'no_result',
        source: 'assistant',
        intent: 'contact jean@example.fr · SST',
        context: { location: 'Lyon, rappel au 06 12 34 56 78' }
      })

      const payload = directus.createOne.mock.calls[0]![1] as Record<string, unknown>
      expect(payload.intent).toBe('contact [email] · SST')
      expect(payload.context).toEqual({ location: 'Lyon, rappel au [téléphone]' })
    })

    it('ignores blank or too short queries', async () => {
      expect(await service.record({ query: '  ', outcome: 'no_result', source: 'catalog' })).toBe(
        false
      )
      expect(await service.record({ query: '?!', outcome: 'no_result', source: 'catalog' })).toBe(
        false
      )
      expect(directus.createOne).not.toHaveBeenCalled()
    })

    it('deduplicates the same query within the window, per source and outcome', async () => {
      const input = { query: 'Drone', outcome: 'no_result', source: 'catalog' } as const

      expect(await service.record(input)).toBe(true)
      expect(await service.record({ ...input, query: 'drône !' })).toBe(false)
      expect(await service.record({ ...input, source: 'assistant' })).toBe(true)
      expect(await service.record({ ...input, outcome: 'out_of_catalog' })).toBe(true)
      expect(directus.createOne).toHaveBeenCalledTimes(3)
    })

    it('accepts the same query again once the window has elapsed', async () => {
      vi.useFakeTimers()
      const input = { query: 'Drone', outcome: 'no_result', source: 'catalog' } as const

      await service.record(input)
      vi.advanceTimersByTime(61_000)
      expect(await service.record(input)).toBe(true)
      expect(directus.createOne).toHaveBeenCalledTimes(2)
      vi.useRealTimers()
    })

    it('evicts stale keys when the dedupe map is full', async () => {
      vi.useFakeTimers()
      for (let i = 0; i < 1_000; i += 1) {
        await service.record({ query: `requête ${i}`, outcome: 'no_result', source: 'catalog' })
      }
      vi.advanceTimersByTime(61_000)

      expect(
        await service.record({ query: 'requête 0', outcome: 'no_result', source: 'catalog' })
      ).toBe(true)
      vi.useRealTimers()
    })

    it('clears the dedupe map when it is full of fresh keys', async () => {
      for (let i = 0; i < 1_001; i += 1) {
        await service.record({ query: `requête ${i}`, outcome: 'no_result', source: 'catalog' })
      }

      expect(
        await service.record({ query: 'requête 0', outcome: 'no_result', source: 'catalog' })
      ).toBe(true)
    })

    it('returns false without writing when Directus is disabled', async () => {
      directus.enabled = false

      expect(
        await service.record({ query: 'Drone', outcome: 'no_result', source: 'catalog' })
      ).toBe(false)
      expect(directus.createOne).not.toHaveBeenCalled()
    })

    it('never throws when Directus fails', async () => {
      directus.createOne.mockRejectedValue(new Error('directus down'))

      expect(
        await service.record({ query: 'Drone', outcome: 'no_result', source: 'catalog' })
      ).toBe(false)
    })
  })

  describe('list', () => {
    it('passes range, filters and pagination to Directus', async () => {
      directus.readMany.mockResolvedValue({ data: [row()], meta: { filter_count: 12 } })

      const page = await service.list({
        from: '2026-09-01',
        to: '2026-09-25',
        outcome: 'no_result',
        source: 'catalog',
        page: 2,
        limit: 10
      })

      expect(page).toEqual({ items: [row()], total: 12, page: 2, pageSize: 10 })
      expect(directus.readMany).toHaveBeenCalledWith(SEARCH_MISSES_COLLECTION, {
        filter: {
          date_created: { _gte: '2026-09-01', _lt: '2026-09-26' },
          outcome: { _eq: 'no_result' },
          source: { _eq: 'catalog' }
        },
        fields: expect.arrayContaining(['id', 'query_text', 'context']),
        sort: ['-date_created'],
        limit: 10,
        page: 2,
        meta: 'filter_count'
      })
    })

    it('sends no filter and falls back on the row count without meta', async () => {
      directus.readMany.mockResolvedValue({ data: [row(), row({ id: 2 })] })

      const page = await service.list({ page: 1, limit: 50 } as ListSearchMissesDto)

      expect(page.total).toBe(2)
      expect(directus.readMany.mock.calls[0]![1]).toMatchObject({ filter: undefined })
    })
  })

  describe('aggregate / exportCsv', () => {
    const rows = [
      row({ id: 3, date_created: '2026-09-22T09:00:00.000Z', query_text: 'Drone pro' }),
      row({
        id: 2,
        date_created: '2026-09-21T09:00:00.000Z',
        query_text: 'drone',
        source: 'assistant',
        outcome: 'out_of_catalog',
        intent: 'formation-drone'
      }),
      row({
        id: 1,
        date_created: '2026-09-20T09:00:00.000Z',
        query_text: 'Soudure; "TIG"',
        query_normalized: 'soudure tig',
        intent: 'formation-soudure'
      })
    ]

    it('groups rows by normalized query, most frequent first', async () => {
      directus.readMany.mockResolvedValue({ data: rows })

      const aggregates = await service.aggregate({ from: '2026-09-01' })

      expect(aggregates).toEqual([
        {
          queryNormalized: 'formation drone',
          sampleQuery: 'Drone pro',
          occurrences: 2,
          firstSeen: '2026-09-21T09:00:00.000Z',
          lastSeen: '2026-09-22T09:00:00.000Z',
          outcomes: { no_result: 1, out_of_catalog: 1 },
          sources: { catalog: 1, assistant: 1 },
          intents: ['formation-drone']
        },
        {
          queryNormalized: 'soudure tig',
          sampleQuery: 'Soudure; "TIG"',
          occurrences: 1,
          firstSeen: '2026-09-20T09:00:00.000Z',
          lastSeen: '2026-09-20T09:00:00.000Z',
          outcomes: { no_result: 1, out_of_catalog: 0 },
          sources: { catalog: 1, assistant: 0 },
          intents: ['formation-soudure']
        }
      ])
      expect(directus.readMany.mock.calls[0]![1]).toMatchObject({
        filter: { date_created: { _gte: '2026-09-01' } },
        limit: 500,
        page: 1
      })
    })

    it('orders equally frequent queries by most recent occurrence', async () => {
      directus.readMany.mockResolvedValue({
        data: [
          row({ id: 1, query_normalized: 'ancienne', date_created: '2026-09-01T00:00:00.000Z' }),
          row({ id: 2, query_normalized: 'recente', date_created: '2026-09-10T00:00:00.000Z' })
        ]
      })

      const aggregates = await service.aggregate({})

      expect(aggregates.map((a) => a.queryNormalized)).toEqual(['recente', 'ancienne'])
    })

    it('tolerates rows without a date', async () => {
      directus.readMany.mockResolvedValue({
        data: [row({ id: 1, date_created: null }), row({ id: 2, date_created: '2026-09-10' })]
      })

      const [aggregate] = await service.aggregate({})

      expect(aggregate!.firstSeen).toBe('2026-09-10')
      expect(aggregate!.lastSeen).toBe('2026-09-10')
    })

    it('pages through Directus until a short page comes back', async () => {
      const fullPage = Array.from({ length: 500 }, (_, i) => row({ id: i + 1 }))
      directus.readMany
        .mockResolvedValueOnce({ data: fullPage })
        .mockResolvedValueOnce({ data: [row({ id: 501 })] })

      const [aggregate] = await service.aggregate({})

      expect(aggregate!.occurrences).toBe(501)
      expect(directus.readMany).toHaveBeenCalledTimes(2)
      expect(directus.readMany.mock.calls[1]![1]).toMatchObject({ page: 2 })
    })

    it('refuses to aggregate a period with more than 50 000 entries instead of truncating', async () => {
      const fullPage = Array.from({ length: 500 }, (_, i) => row({ id: i + 1 }))
      directus.readMany.mockResolvedValue({ data: fullPage })

      await expect(service.aggregate({})).rejects.toThrow(/restreignez-la avec from \/ to/)
      expect(directus.readMany).toHaveBeenCalledTimes(100)
    })

    it('exports an Excel-friendly CSV with BOM, semicolons and quoting', async () => {
      directus.readMany.mockResolvedValue({ data: rows })

      const csv = await service.exportCsv({})
      const lines = csv.split('\r\n')

      expect(csv.startsWith('﻿')).toBe(true)
      expect(lines[0]).toBe(
        '﻿requete_normalisee;exemple;occurrences;premiere_occurrence;derniere_occurrence;aucun_resultat;hors_catalogue;catalogue;moteur_ia;intentions'
      )
      expect(lines[1]).toBe(
        'formation drone;Drone pro;2;2026-09-21T09:00:00.000Z;2026-09-22T09:00:00.000Z;1;1;1;1;formation-drone'
      )
      expect(lines[2]).toBe(
        'soudure tig;"Soudure; ""TIG""";1;2026-09-20T09:00:00.000Z;2026-09-20T09:00:00.000Z;1;0;1;0;formation-soudure'
      )
      expect(lines.at(-1)).toBe('')
    })
  })

  describe('purgeExpired', () => {
    it('deletes entries older than the retention period', async () => {
      env = { SEARCH_MISS_RETENTION_DAYS: '30' }
      await build()
      directus.readMany.mockResolvedValue({ data: [{ id: 1 }], meta: { filter_count: 4 } })

      const result = await service.purgeExpired(new Date('2026-09-25T12:00:00.000Z'))

      const filter = { date_created: { _lt: '2026-08-26T12:00:00.000Z' } }
      expect(result).toEqual({ deleted: 4, cutoff: '2026-08-26T12:00:00.000Z' })
      expect(directus.readMany).toHaveBeenCalledWith(SEARCH_MISSES_COLLECTION, {
        filter,
        fields: ['id'],
        limit: 1,
        meta: 'filter_count'
      })
      expect(directus.deleteMany).toHaveBeenCalledWith(SEARCH_MISSES_COLLECTION, filter)
    })

    it('uses the default retention and skips the delete when nothing expired', async () => {
      const result = await service.purgeExpired(new Date('2026-09-25T00:00:00.000Z'))

      expect(result).toEqual({ deleted: 0, cutoff: '2026-03-29T00:00:00.000Z' })
      expect(directus.deleteMany).not.toHaveBeenCalled()
    })

    it('is a no-op when retention is disabled', async () => {
      env = { SEARCH_MISS_RETENTION_DAYS: '0' }
      await build()

      expect(await service.purgeExpired()).toEqual({ deleted: 0, cutoff: null })
      expect(directus.readMany).not.toHaveBeenCalled()
    })
  })
})
