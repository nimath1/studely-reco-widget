import { ServiceUnavailableException } from '@nestjs/common'
import type { CourseListItem, CourseSession } from '@studely/types'
import { CacheService } from '../../common/cache/cache.service'
import { CatalogService, type CatalogRow } from '../../catalog/catalog.service'
import { CatalogIndexService, type CatalogIndexEntry } from '../../retrieval/catalog-index.service'
import { HashingEmbeddingsProvider } from '../../retrieval/embeddings/hashing-embeddings.provider'
import { RETRIEVAL_CORPUS } from '../../retrieval/retrieval.fixtures'
import { RetrievalService } from '../../retrieval/retrieval.service'
import { FallbackRecommendationService, needText } from './fallback-recommendation.service'

const SST = 'sst-sauveteur-secouriste-du-travail'
const LYON_COURSES = [SST, 'communication-non-violente', 'habilitation-electrique-b0-h0']

function session(id: string, startDate: string, city: string): CourseSession {
  return {
    id,
    startDate,
    endDate: null,
    modality: 'presentiel',
    seatsRemaining: 6,
    location: {
      name: `Centre LEARN UP de ${city}`,
      city,
      postalCode: null,
      department: null,
      region: null,
      centreSlug: city.toLowerCase()
    }
  }
}

function toRow(entry: CatalogIndexEntry): CatalogRow {
  return {
    ...entry,
    updatedAt: '2026-01-01T00:00:00.000Z',
    searchText: entry.course.title.toLowerCase(),
    locations: (entry.course.sessions ?? []).flatMap((s) =>
      s.location ? [{ ...s.location, address: null, latitude: null, longitude: null }] : []
    )
  }
}

function withSessions(slug: string, sessions: CourseSession[]): CatalogRow[] {
  return RETRIEVAL_CORPUS.map((entry) =>
    toRow(entry.course.slug === slug ? { ...entry, course: { ...entry.course, sessions } } : entry)
  )
}

function makeService(rows: CatalogRow[] = RETRIEVAL_CORPUS.map(toRow)) {
  const catalog = { allCourses: vi.fn().mockResolvedValue(rows) }
  const cache = {
    version: 1,
    onCatalogInvalidated: vi.fn(() => () => undefined),
    syncInvalidations: vi.fn().mockResolvedValue(false)
  }
  const index = new CatalogIndexService(
    catalog as unknown as CatalogService,
    cache as unknown as CacheService,
    new HashingEmbeddingsProvider()
  )
  const service = new FallbackRecommendationService(
    catalog as unknown as CatalogService,
    new RetrievalService(index)
  )
  return { service, catalog }
}

describe('needText', () => {
  it('aggregates the last two visitor turns with the current message', () => {
    expect(
      needText({
        message: 'en présentiel',
        history: [
          { role: 'user', content: 'bonjour' },
          { role: 'user', content: 'former mes équipes aux premiers secours' },
          { role: 'assistant', content: 'Quelle modalité ?' },
          { role: 'user', content: '8 personnes' }
        ]
      })
    ).toBe('former mes équipes aux premiers secours 8 personnes en présentiel')
    expect(needText({ message: '  formation SST ' })).toBe('formation SST')
  })

  it('keeps the most recent part of an oversized need', () => {
    const text = needText({ message: `${'a'.repeat(1200)} habilitation` })

    expect(text).toHaveLength(1000)
    expect(text.endsWith('habilitation')).toBe(true)
  })
})

describe('FallbackRecommendationService', () => {
  it('recommends one primary and up to two alternatives, grounded on the catalogue', async () => {
    const { service } = makeService()

    const reply = await service.recommend({
      message: 'Mes managers doivent mieux gérer les conflits dans leurs équipes'
    })

    expect(reply.kind).toBe('recommend')
    expect(reply.text).toBe('Nous vous recommandons')
    const [primary, ...alternatives] = reply.recommendations ?? []
    expect(primary).toMatchObject({
      slug: 'gestion-des-conflits-en-equipe',
      familySlug: 'management',
      title: 'Gestion des conflits en équipe',
      rank: 'primary',
      availability: null,
      url: '/formations/management/gestion-des-conflits-en-equipe'
    })
    // Les mots du visiteur, tels que saisis — jamais les termes racinisés de l'index.
    expect(primary.justification).toBe(
      'Cette formation semble correspondre à votre besoin : sa fiche catalogue couvre « managers », « gérer », « conflits ».'
    )
    expect(alternatives.length).toBeLessThanOrEqual(2)
    for (const alternative of alternatives) {
      expect(alternative.rank).toBe('alternative')
      expect(alternative.justification).toMatch(/^Semble pertinente/)
      expect(alternative.slug).not.toBe(primary.slug)
    }
  })

  it('answers « aucun résultat » on a weak match, with the exact wording', async () => {
    const { service } = makeService()

    const reply = await service.recommend({
      message: 'pilotage de drone',
      context: { location: 'Créteil' }
    })

    expect(reply).toEqual({
      kind: 'no_results',
      text: "Nous n'avons pas identifié de formation correspondant exactement à votre besoin."
    })
  })

  it('answers « hors catalogue » without any candidate, never an approximate course', async () => {
    const { service } = makeService()

    const reply = await service.recommend({ message: 'xylophone' })

    expect(reply.kind).toBe('out_of_catalog')
    expect(reply.text).toContain('Ce besoin ne correspond pas aux formations')
    expect(reply.recommendations).toBeUndefined()
  })

  it('reads the need from the conversation, not only from the last message', async () => {
    const { service } = makeService()

    const reply = await service.recommend({
      message: 'en présentiel',
      history: [
        { role: 'user', content: 'je dois former des salariés sauveteurs secouristes' },
        { role: 'assistant', content: 'Quelle modalité préférez-vous ?' }
      ]
    })

    expect(reply.recommendations?.[0].slug).toBe(SST)
  })

  it('exposes the real session of the requested location', async () => {
    const { service } = makeService(
      withSessions(SST, [
        session('lyon-1', '2999-09-10', 'Lyon'),
        session('creteil-1', '2999-10-05', 'Créteil')
      ])
    )

    const reply = await service.recommend({
      message: 'formation SST pour 8 salariés',
      context: { location: 'Créteil' }
    })

    expect(reply.recommendations?.[0]).toMatchObject({
      slug: SST,
      justification:
        'Cette formation semble correspondre à votre besoin : sa fiche catalogue couvre « SST ».',
      availability: {
        sessionId: 'creteil-1',
        startDate: '2999-10-05',
        seatsRemaining: 6,
        centreName: 'Centre LEARN UP de Créteil',
        city: 'Créteil'
      }
    })
  })

  it('prefers the courses given near the requested location', async () => {
    const { service } = makeService()
    const message = 'mes managers doivent mieux communiquer et gérer les conflits'

    const anywhere = await service.recommend({ message })
    const nearLyon = await service.recommend({ message, context: { location: 'Lyon' } })

    // « Gestion des conflits » (Marseille, Lille) l'emporte sans lieu ; à Lyon,
    // la formation solide donnée sur place passe devant.
    expect(anywhere.recommendations?.[0].slug).toBe('gestion-des-conflits-en-equipe')
    expect(nearLyon.recommendations?.[0].slug).toBe('communication-non-violente')
    expect((nearLyon.recommendations ?? []).every((r) => LYON_COURSES.includes(r.slug))).toBe(true)
  })

  it('searches the whole catalogue when nothing solid exists near the location', async () => {
    const { service } = makeService()

    // L'habilitation n'est donnée qu'à Lyon : à Nantes, rien de solide sur place.
    const reply = await service.recommend({
      message: 'habilitation électrique pour nos techniciens',
      context: { location: 'Nantes' }
    })

    expect(reply.recommendations?.[0].slug).toBe('habilitation-electrique-b0-h0')
  })

  it('never recommends the course the visitor comes from', async () => {
    const { service } = makeService()

    const reply = await service.recommend({
      message: 'formation SST sauveteur secouriste',
      context: { source: 'formation', formationSlug: SST }
    })

    expect((reply.recommendations ?? []).map((r) => r.slug)).not.toContain(SST)
  })

  it('drops candidates of a stale index that left the published catalogue', async () => {
    const rows = RETRIEVAL_CORPUS.map(toRow)
    const { service, catalog } = makeService(rows)
    // 1er appel : rows du repli (SST dépubliée) · 2e : construction de l'index (encore présente).
    catalog.allCourses.mockResolvedValueOnce(rows.filter((row) => row.course.slug !== SST))

    const reply = await service.recommend({ message: 'formation SST sauveteur secouriste' })

    expect((reply.recommendations ?? []).map((r) => r.slug)).not.toContain(SST)
  })

  it('fails with 503 when the catalogue itself is empty or unreachable', async () => {
    const { service } = makeService([])
    await expect(service.recommend({ message: 'formation SST' })).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )

    const { service: offline, catalog } = makeService()
    catalog.allCourses.mockRejectedValue(new TypeError('fetch failed'))
    await expect(offline.recommend({ message: 'formation SST' })).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
  })

  it('stays conditional when the match is only semantic (typo, no retained term)', async () => {
    const rows = RETRIEVAL_CORPUS.map(toRow)
    const candidate = (slug: string, category: string | null, score: number) => {
      const course = rows.find((row) => row.course.slug === slug)!.course
      return {
        course: { ...course, category },
        score,
        lexicalScore: 0,
        semanticScore: score,
        matchedTerms: [],
        coverage: 0,
        confident: true
      }
    }
    const retrieval = {
      search: vi.fn().mockResolvedValue({
        candidates: [
          candidate('habilitation-electrique-b0-h0', 'Habilitations électriques', 0.7),
          candidate(SST, null, 0.5),
          candidate('pilotage-de-projet', 'Management', 0.2)
        ]
      })
    }
    const service = new FallbackRecommendationService(
      { allCourses: vi.fn().mockResolvedValue(rows) } as unknown as CatalogService,
      retrieval as unknown as RetrievalService
    )

    const reply = await service.recommend({ message: 'abilitation electrik' })

    expect((reply.recommendations ?? []).map((r) => [r.slug, r.justification])).toEqual([
      [
        'habilitation-electrique-b0-h0',
        'Cette formation semble correspondre à votre besoin : sa fiche catalogue est proche des termes de votre demande.'
      ],
      [
        SST,
        'Semble pertinente si votre besoin porte plutôt sur sécurité & prévention : elle relève du même domaine.'
      ]
    ])
  })

  it('states a real difference for each alternative, read from the catalogue', async () => {
    // Le catalogue (rows) fait foi : même domaine et mêmes modalités que la
    // principale pour la CNV, modalité en plus pour le pilotage, autre domaine
    // pour la finance.
    const shared = {
      category: 'Management',
      modalities: ['inter', 'presentiel'],
      certification: null
    }
    const overrides: Record<string, Partial<CourseListItem>> = {
      'gestion-des-conflits-en-equipe': shared,
      'communication-non-violente': shared,
      'pilotage-de-projet': { ...shared, modalities: ['distanciel'] },
      'finance-pour-managers': { ...shared, category: 'Finance' },
      'cybersecurite-fondamentaux': { ...shared, certification: 'ISO 27001' },
      [SST]: { ...shared, modalities: ['visio'] }
    }
    const rows = RETRIEVAL_CORPUS.map(toRow).map((row) => ({
      ...row,
      course: { ...row.course, ...overrides[row.course.slug] }
    }))
    const candidate = (slug: string, score: number) => ({
      course: rows.find((row) => row.course.slug === slug)!.course,
      score,
      lexicalScore: 1,
      semanticScore: 0.6,
      matchedTerms: ['conflit'],
      coverage: 1,
      confident: true
    })
    const search = vi.fn()
    const service = new FallbackRecommendationService(
      { allCourses: vi.fn().mockResolvedValue(rows) } as unknown as CatalogService,
      { search } as unknown as RetrievalService
    )
    const justificationOf = async (slug: string) => {
      search.mockResolvedValue({
        candidates: [candidate('gestion-des-conflits-en-equipe', 0.9), candidate(slug, 0.7)]
      })
      const reply = await service.recommend({ message: 'conflits' })
      return reply.recommendations?.[1]?.justification
    }

    await expect(justificationOf('communication-non-violente')).resolves.toBe(
      'Semble pertinente en alternative : elle couvre « conflits ».'
    )
    await expect(justificationOf('pilotage-de-projet')).resolves.toBe(
      'Semble pertinente si vous préférez suivre la formation à distance : elle couvre « conflits ».'
    )
    await expect(justificationOf('finance-pour-managers')).resolves.toBe(
      'Semble pertinente si votre besoin porte plutôt sur finance : elle couvre « conflits ».'
    )
    await expect(justificationOf('cybersecurite-fondamentaux')).resolves.toBe(
      'Semble pertinente si vous visez la certification ISO 27001 : elle couvre « conflits ».'
    )
    // Modalité inconnue du libellé : rendue telle quelle.
    await expect(justificationOf(SST)).resolves.toBe(
      'Semble pertinente si vous préférez suivre la formation visio : elle couvre « conflits ».'
    )
  })
})
