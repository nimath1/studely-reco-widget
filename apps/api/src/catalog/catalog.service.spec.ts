import { Test, TestingModule } from '@nestjs/testing'
import type { Course, CourseListItem, FamilyWithCount, Paginated } from '@studely/types'
import { CatalogService } from './catalog.service'
import { CacheService } from '../common/cache/cache.service'
import {
  DirectusCatalogService,
  type DirectusFormation
} from '../directus/directus.catalog.service'
import { SearchMissesService } from '../search-misses/search-misses.service'
import {
  CourseAvailability,
  CourseSortField,
  CourseSortOrder,
  type ListCoursesDto
} from './catalog.dto'

const baseFormation: DirectusFormation = {
  id: 1,
  status: 'published',
  digiforma_id: 'prog-001',
  slug: 'pilotage-de-projet',
  title: 'Pilotage de projet',
  description: 'Apprendre à piloter.',
  short_description: null,
  duration_days: 3,
  duration_hours: 21,
  price: 1500,
  cpf: true,
  cpf_code: 'CPF-12345',
  certification: 'Certificat',
  certifier_name: 'LEARN UP',
  category_name: 'Management',
  center_slug: null,
  center_slugs: [],
  centres: null,
  modalities: [],
  sessions: null,
  locations_text: null,
  blocks: [{ name: 'Objectifs' }],
  pedagogy: [{ title: 'Inter, en centre.', description: 'Sessions planifiées' }],
  evaluation: ['Épreuve pratique'],
  validity: '5 ans',
  image: null,
  generated_program_url: null,
  seo_title: 'Pilotage de projet',
  seo_description: 'Apprendre à piloter.',
  seo_canonical: null,
  raw: { targets: [{ text: 'Managers' }], prerequisites: [{ text: 'Aucun' }] },
  famille: { id: 1, slug: 'management' },
  sous_famille: { id: 10, slug: 'pilotage-projet', name: 'Pilotage de projet' },
  created_at: '2026-01-15T10:00:00.000Z',
  updated_at: '2026-01-20T10:00:00.000Z'
}

const secondFormation: DirectusFormation = {
  ...baseFormation,
  id: 2,
  digiforma_id: 'prog-002',
  slug: 'securite',
  title: 'Sécurité',
  description: 'Bien se protéger.',
  duration_days: 1,
  duration_hours: 7,
  price: 800,
  cpf: false,
  certification: null,
  certifier_name: null,
  category_name: 'Sécurité',
  cpf_code: null,
  famille: { id: 2, slug: 'securite' },
  sous_famille: null,
  updated_at: '2026-01-22T10:00:00.000Z',
  raw: {}
} as unknown as DirectusFormation

const formations = [baseFormation, secondFormation]

function mockCache() {
  const get = vi.fn()
  const set = vi.fn()
  const invalidateCatalog = vi.fn()

  return {
    cache: { get, set, invalidateCatalog } as unknown as CacheService,
    get,
    set,
    invalidateCatalog
  }
}

function mockCatalog() {
  const fetchAllFormations = vi.fn().mockResolvedValue(formations)
  const fetchAllCentres = vi.fn().mockResolvedValue([])
  const getFamilyIdsBySlug = vi.fn().mockResolvedValue(new Map([['management', 1]]))
  const getSubFamilyIdsByFamilySlug = vi
    .fn()
    .mockResolvedValue(new Map([['management', new Map([['pilotage-projet', 10]])]]))
  const applyFamilyAssignments = vi
    .fn()
    .mockResolvedValue({ assigned: 1, cleared: 0, subAssigned: 0 })

  return {
    catalog: {
      fetchAllFormations,
      fetchAllCentres,
      getFamilyIdsBySlug,
      getSubFamilyIdsByFamilySlug,
      applyFamilyAssignments
    } as unknown as DirectusCatalogService,
    fetchAllFormations,
    fetchAllCentres,
    getFamilyIdsBySlug,
    getSubFamilyIdsByFamilySlug,
    applyFamilyAssignments
  }
}

describe('CatalogService', () => {
  let service: CatalogService
  let cache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }
  let catalog: {
    fetchAllFormations: ReturnType<typeof vi.fn>
    fetchAllCentres: ReturnType<typeof vi.fn>
  }

  let searchMisses: { record: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    const { cache: cacheMock, get, set } = mockCache()
    const { catalog: catalogMock, fetchAllFormations, fetchAllCentres } = mockCatalog()
    searchMisses = { record: vi.fn().mockResolvedValue(true) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CacheService, useValue: cacheMock },
        { provide: DirectusCatalogService, useValue: catalogMock },
        { provide: SearchMissesService, useValue: searchMisses }
      ]
    }).compile()

    service = module.get<CatalogService>(CatalogService)
    cache = { get, set }
    catalog = { fetchAllFormations, fetchAllCentres }
  })

  it('records a search miss when a text search returns nothing', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({
      search: 'drone',
      family: 'management',
      location: 'lyon',
      page: 1,
      limit: 20
    } as ListCoursesDto)

    expect(result.total).toBe(0)
    expect(searchMisses.record).toHaveBeenCalledWith({
      query: 'drone',
      outcome: 'no_result',
      source: 'catalog',
      context: { family: 'management', location: 'lyon' }
    })
    expect(cache.set).not.toHaveBeenCalledWith(
      expect.stringMatching(/^courses:list:/),
      expect.anything()
    )
  })

  it('matches accented searches against the normalized text', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({ search: 'Sécurité', page: 1, limit: 20 } as ListCoursesDto)

    expect(result.items.map((item) => item.slug)).toEqual(['securite'])
  })

  it('exposes the published courses with their location text to the assistant and the retrieval index', async () => {
    cache.get.mockResolvedValue(null)

    const rows = await service.allCourses()

    expect(rows.map((row) => row.course.slug)).toEqual(['pilotage-de-projet', 'securite'])
    expect(rows[0]).toMatchObject({ locationText: '' })
  })

  it('does not record a miss when results exist or without search text', async () => {
    cache.get.mockResolvedValue(null)

    await service.list({ search: 'piloter', page: 1, limit: 20 } as ListCoursesDto)
    await service.list({ family: 'inconnue', page: 1, limit: 20 } as ListCoursesDto)

    expect(searchMisses.record).not.toHaveBeenCalled()
  })

  it('does not record a miss while the catalogue itself is empty', async () => {
    cache.get.mockResolvedValue(null)
    catalog.fetchAllFormations.mockResolvedValue([])

    const result = await service.list({ search: 'drone', page: 1, limit: 20 } as ListCoursesDto)

    expect(result.total).toBe(0)
    expect(searchMisses.record).not.toHaveBeenCalled()
  })

  it('returns cached list when available', async () => {
    const cached: Paginated<CourseListItem> = {
      items: [{ id: 1, slug: 'pilotage-de-projet', title: 'Pilotage de projet' } as CourseListItem],
      total: 1,
      page: 1,
      pageSize: 20
    }
    cache.get.mockResolvedValue(cached)

    const result = await service.list({} as ListCoursesDto)

    expect(result).toEqual(cached)
    expect(catalog.fetchAllFormations).not.toHaveBeenCalled()
  })

  it('queries Directus and sets the cache on list miss', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({ page: 1, limit: 20 } as ListCoursesDto)

    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
    expect(cache.set).toHaveBeenCalledWith(expect.stringMatching(/^courses:list:/), result)
    expect(catalog.fetchAllFormations).toHaveBeenCalled()
  })

  it('canonicalizes the list cache key regardless of query field order', async () => {
    cache.get.mockResolvedValue(null)

    await service.list({
      page: 1,
      limit: 10,
      family: 'management',
      durations: 'courte,longue'
    } as ListCoursesDto)
    await service.list({
      limit: 10,
      durations: 'longue,courte',
      family: 'management',
      page: 1
    } as unknown as ListCoursesDto)

    const keys = [...cache.get.mock.calls, ...cache.set.mock.calls]
      .map((call) => String(call[0]))
      .filter((key) => key.startsWith('courses:list:'))
    expect(keys.length).toBeGreaterThan(0)
    expect(new Set(keys).size).toBe(1)
  })

  it('never caches free-text search or location queries', async () => {
    cache.get.mockResolvedValue(null)

    const bySearch = await service.list({
      search: 'pilotage',
      page: 1,
      limit: 10
    } as ListCoursesDto)
    const byLocation = await service.list({
      location: '45.77,4.88|Lyon',
      page: 1,
      limit: 10
    } as ListCoursesDto)
    expect(bySearch.items.length).toBeGreaterThan(0)

    const touchedKeys = [...cache.get.mock.calls, ...cache.set.mock.calls].map((call) =>
      String(call[0])
    )
    expect(touchedKeys.some((key) => key.startsWith('courses:list:'))).toBe(false)
    expect(byLocation.items).toHaveLength(0)
  })

  it('filters by family, CPF and search', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({
      family: 'management',
      search: 'piloter',
      page: 1,
      limit: 10
    } as ListCoursesDto)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].slug).toBe('pilotage-de-projet')
  })

  it('matches accented search terms against de-accented text', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({
      search: 'sécurité',
      page: 1,
      limit: 10
    } as ListCoursesDto)

    expect(result.items.map((i) => i.slug)).toEqual(['securite'])
  })

  it('ignores accented stop words in search', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({
      search: 'sécurité dès',
      page: 1,
      limit: 10
    } as ListCoursesDto)

    expect(result.items.map((i) => i.slug)).toEqual(['securite'])
  })

  it('filters by sub-family', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({
      family: 'management',
      subFamily: 'pilotage-projet',
      page: 1,
      limit: 10
    } as ListCoursesDto)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].subFamilySlug).toBe('pilotage-projet')
    expect(result.items[0].subFamilyName).toBe('Pilotage de projet')
  })

  it('returns no item for an unknown sub-family', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({
      subFamily: 'inexistant',
      page: 1,
      limit: 10
    } as ListCoursesDto)

    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('filters by price and duration', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({
      priceMin: 1000,
      priceMax: 2000,
      durationMin: 20,
      durationMax: 30,
      page: 1,
      limit: 20
    } as ListCoursesDto)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].slug).toBe('pilotage-de-projet')
  })

  it.each([
    { sort: CourseSortField.updatedAt, order: CourseSortOrder.asc },
    { sort: CourseSortField.name, order: undefined },
    { sort: CourseSortField.price, order: CourseSortOrder.desc },
    { sort: undefined, order: undefined }
  ])('sorts by $sort $order', async ({ sort, order }) => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({ sort, order, page: 1, limit: 20 } as ListCoursesDto)

    expect(result.items.length).toBeGreaterThan(0)
  })

  it('paginates correctly', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.list({ page: 2, limit: 1 } as ListCoursesDto)

    expect(result.items).toHaveLength(1)
    expect(result.page).toBe(2)
  })

  it('returns cached detail when available', async () => {
    const cached: Course = {
      id: 1,
      slug: 'pilotage-de-projet',
      title: 'Pilotage de projet',
      description: 'Apprendre à piloter.',
      shortDescription: null,
      durationDays: 3,
      durationHours: 21,
      durationBucket: 'moyenne',
      price: 1500,
      cpf: true,
      cpfCode: 'CPF-12345',
      certification: 'Certificat',
      certifierName: 'LEARN UP',
      category: 'Management',
      familySlug: 'management',
      subFamilySlug: 'pilotage-projet',
      subFamilyName: 'Pilotage de projet',
      centerSlug: null,
      centerSlugs: [],
      modalities: [],
      sessions: null,
      image: null,
      imageUrl: null,
      generatedProgramUrl: null,
      status: 'published',
      seoTitle: 'Pilotage de projet',
      seoDescription: 'Apprendre à piloter.',
      seoCanonical: null,
      blocks: null,
      targets: ['Managers'],
      prerequisites: ['Aucun'],
      pedagogy: null,
      evaluation: null,
      validity: null,
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-01-20T10:00:00.000Z'
    }
    cache.get.mockResolvedValue(cached)

    const result = await service.findBySlug('pilotage-de-projet', 'management')

    expect(result).toEqual(cached)
    expect(catalog.fetchAllFormations).not.toHaveBeenCalled()
  })

  it('finds a course by slug and family', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.findBySlug('pilotage-de-projet', 'management')

    expect(result).not.toBeNull()
    expect(result?.slug).toBe('pilotage-de-projet')
    expect(result?.familySlug).toBe('management')
    expect(result?.createdAt).toBe('2026-01-15T10:00:00.000Z')
  })

  it('exposes editable pedagogy, evaluation and validity fields', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.findBySlug('pilotage-de-projet', 'management')

    expect(result?.pedagogy).toEqual([
      { title: 'Inter, en centre.', description: 'Sessions planifiées' }
    ])
    expect(result?.evaluation).toEqual(['Épreuve pratique'])
    expect(result?.validity).toBe('5 ans')
  })

  it('returns null when a course is not found', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.findBySlug('inexistant')

    expect(result).toBeNull()
    expect(cache.set).toHaveBeenCalledWith('formations:all', expect.any(Array))
  })

  it('returns cached families', async () => {
    const cached: FamilyWithCount[] = [{ slug: 'management', count: 5 }]
    cache.get.mockResolvedValue(cached)

    const result = await service.families()

    expect(result).toEqual(cached)
    expect(catalog.fetchAllFormations).not.toHaveBeenCalled()
  })

  it('counts families from Directus formations', async () => {
    cache.get.mockResolvedValue(null)

    const result = await service.families()

    expect(result).toEqual([
      { slug: 'management', count: 1 },
      { slug: 'securite', count: 1 }
    ])
    expect(cache.set).toHaveBeenCalledWith('courses:families', result)
  })

  it('returns an empty family list when nothing is published', async () => {
    cache.get.mockResolvedValue(null)
    catalog.fetchAllFormations.mockResolvedValue([])

    const result = await service.families()

    expect(result).toEqual([])
  })

  it('does not cache an empty catalog', async () => {
    cache.get.mockResolvedValue(null)
    catalog.fetchAllFormations.mockResolvedValue([])

    const families = await service.families()
    const list = await service.list({ page: 1, limit: 20 } as ListCoursesDto)

    expect(families).toEqual([])
    expect(list.items).toEqual([])
    // Jamais de résultat vide en cache — ni catalogue ni référentiel centres.
    const cachedKeys = cache.set.mock.calls.map((call) => call[0])
    expect(cachedKeys).not.toContain('courses:families')
    expect(cachedKeys).not.toContain('courses:rows')
    expect(cachedKeys).not.toContain('formations:all')
    expect(cachedKeys).not.toContain('centres:all')
    expect(cachedKeys.some((key) => String(key).startsWith('courses:list:'))).toBe(false)
  })

  // Entrées vides écrites par une version antérieure sans garde anti-vide :
  // elles ne doivent jamais être resservies — on retombe sur la source.
  describe('stale empty cache entries', () => {
    it('refetches formations when formations:all is an empty array', async () => {
      cache.get.mockImplementation((key: string) =>
        Promise.resolve(key === 'formations:all' ? [] : null)
      )

      const result = await service.findBySlug('pilotage-de-projet')

      expect(catalog.fetchAllFormations).toHaveBeenCalled()
      expect(result?.slug).toBe('pilotage-de-projet')
    })

    it('refetches rows when courses:rows is an empty array', async () => {
      cache.get.mockImplementation((key: string) =>
        Promise.resolve(key === 'courses:rows' ? [] : null)
      )

      const result = await service.list({ page: 1, limit: 20 } as ListCoursesDto)

      expect(catalog.fetchAllFormations).toHaveBeenCalled()
      expect(result.items).toHaveLength(2)
    })

    it('refetches centres when centres:all is an empty array', async () => {
      cache.get.mockImplementation((key: string) =>
        Promise.resolve(key === 'centres:all' ? [] : null)
      )

      await service.list({ page: 1, limit: 20 } as ListCoursesDto)

      expect(catalog.fetchAllCentres).toHaveBeenCalled()
    })

    it('recomputes when a cached list page is empty', async () => {
      cache.get.mockImplementation((key: string) =>
        Promise.resolve(
          String(key).startsWith('courses:list:')
            ? { items: [], total: 0, page: 1, pageSize: 20 }
            : null
        )
      )

      const result = await service.list({ page: 1, limit: 20 } as ListCoursesDto)

      expect(result.items).toHaveLength(2)
    })

    it('recomputes families when the cached list is empty', async () => {
      cache.get.mockImplementation((key: string) =>
        Promise.resolve(key === 'courses:families' ? [] : null)
      )

      const result = await service.families()

      expect(result).toHaveLength(2)
      expect(catalog.fetchAllFormations).toHaveBeenCalled()
    })

    it('does not cache an empty centres list', async () => {
      cache.get.mockResolvedValue(null)
      catalog.fetchAllCentres.mockResolvedValue([])

      await service.list({ page: 1, limit: 20 } as ListCoursesDto)

      const cachedKeys = cache.set.mock.calls.map((call) => call[0])
      expect(cachedKeys).not.toContain('centres:all')
    })

    it('does not cache an empty result page on a healthy dataset', async () => {
      cache.get.mockResolvedValue(null)

      const result = await service.list({
        search: 'zzzz-introuvable',
        page: 1,
        limit: 20
      } as ListCoursesDto)

      expect(result.items).toHaveLength(0)
      const cachedKeys = cache.set.mock.calls.map((call) => call[0])
      expect(cachedKeys.some((key) => String(key).startsWith('courses:list:'))).toBe(false)
    })
  })

  describe('location filter', () => {
    const geoFormation = {
      ...baseFormation,
      id: 4,
      digiforma_id: 'prog-geo',
      slug: 'geo',
      sessions: [
        {
          id: 's1',
          startDate: null,
          endDate: null,
          modality: 'presentiel',
          seatsRemaining: null,
          location: {
            name: 'Centre LEARN UP de Lyon',
            city: 'Lyon',
            postalCode: '69003',
            department: 'Rhône',
            region: 'Auvergne-Rhône-Alpes',
            centreSlug: null
          }
        },
        {
          id: 's2',
          startDate: null,
          endDate: null,
          modality: 'presentiel',
          seatsRemaining: null,
          location: {
            name: 'Centre LEARN UP de Marseille',
            city: 'Marseille',
            postalCode: '13002',
            department: 'Bouches-du-Rhône',
            region: 'Provence-Alpes-Côte d’Azur',
            centreSlug: null
          }
        }
      ]
    } as unknown as DirectusFormation

    async function listWithLocation(location: string) {
      cache.get.mockResolvedValue(null)
      catalog.fetchAllFormations.mockResolvedValue([geoFormation])
      const result = await service.list({ location, page: 1, limit: 10 } as ListCoursesDto)
      return result.items.length
    }

    it.each([
      { query: '69003', expected: 1 },
      { query: '69', expected: 1 },
      { query: 'lyon', expected: 1 },
      { query: 'lyon 69003', expected: 1 },
      { query: 'rhone', expected: 1 },
      { query: 'auvergne', expected: 1 }
    ])('matches « $query » → $expected résultat(s)', async ({ query, expected }) => {
      expect(await listWithLocation(query)).toBe(expected)
    })

    it('ne matche pas « lyon 13002 » (tokens répartis sur deux sessions)', async () => {
      expect(await listWithLocation('lyon 13002')).toBe(0)
    })

    it('ne matche pas « aris » (pas de sous-chaîne — frontière de mot)', async () => {
      expect(await listWithLocation('aris')).toBe(0)
    })

    it('ne matche pas un token numérique de plus de 5 chiffres', async () => {
      expect(await listWithLocation('123456')).toBe(0)
    })

    it('retombe sur la localisation de session quand le fetch des centres échoue', async () => {
      cache.get.mockResolvedValue(null)
      catalog.fetchAllFormations.mockResolvedValue([geoFormation])
      catalog.fetchAllCentres.mockRejectedValue(new Error('directus down'))

      const result = await service.list({ location: 'lyon', page: 1, limit: 10 } as ListCoursesDto)

      expect(result.items).toHaveLength(1)
    })

    it('résout la localisation via les centres servis par le cache', async () => {
      const centred = {
        ...geoFormation,
        sessions: [
          {
            id: 's1',
            startDate: null,
            endDate: null,
            modality: 'presentiel',
            seatsRemaining: null,
            location: {
              name: null,
              city: null,
              postalCode: null,
              department: null,
              region: null,
              centreSlug: 'lyon'
            }
          }
        ]
      } as unknown as DirectusFormation
      const cachedCentre = {
        id: 1,
        slug: 'lyon',
        name: 'Centre LEARN UP de Lyon',
        status: 'published',
        address: '12 rue de la Part-Dieu, 69003 Lyon',
        city: 'Lyon',
        postal_code: '69003',
        department: 'Rhône',
        region: 'Auvergne-Rhône-Alpes',
        latitude: 45.76,
        longitude: 4.85
      }
      cache.get.mockImplementation((key: string) => {
        if (key === 'formations:all') return Promise.resolve([centred])
        if (key === 'centres:all') return Promise.resolve([cachedCentre])
        return Promise.resolve(null)
      })

      const result = await service.list({ location: 'lyon', page: 1, limit: 10 } as ListCoursesDto)

      expect(result.items).toHaveLength(1)
      expect(catalog.fetchAllFormations).not.toHaveBeenCalled()
      expect(catalog.fetchAllCentres).not.toHaveBeenCalled()
    })

    it('résout la localisation via le centre rattaché (centreSlug)', async () => {
      cache.get.mockResolvedValue(null)
      const centred = {
        ...geoFormation,
        sessions: [
          {
            id: 's1',
            startDate: null,
            endDate: null,
            modality: 'presentiel',
            seatsRemaining: null,
            location: {
              name: null,
              city: null,
              postalCode: null,
              department: null,
              region: null,
              centreSlug: 'lyon'
            }
          }
        ]
      } as unknown as DirectusFormation
      catalog.fetchAllFormations.mockResolvedValue([centred])
      catalog.fetchAllCentres.mockResolvedValue([
        {
          id: 1,
          slug: 'lyon',
          name: 'Centre LEARN UP de Lyon',
          status: 'published',
          address: '12 rue de la Part-Dieu, 69003 Lyon',
          city: 'Lyon',
          postal_code: '69003',
          department: 'Rhône',
          region: 'Auvergne-Rhône-Alpes',
          latitude: 45.76,
          longitude: 4.85
        }
      ])

      for (const query of ['lyon', '69003', '69', 'part-dieu', 'rhone']) {
        const result = await service.list({ location: query, page: 1, limit: 10 } as ListCoursesDto)
        expect(result.items, `query ${query}`).toHaveLength(1)
      }
    })

    it('matche par rayon (lat,lng) sur les coordonnées du centre', async () => {
      cache.get.mockResolvedValue(null)
      const centred = {
        ...geoFormation,
        sessions: [
          {
            id: 's1',
            startDate: null,
            endDate: null,
            modality: 'presentiel',
            seatsRemaining: null,
            location: {
              name: null,
              city: null,
              postalCode: null,
              department: null,
              region: null,
              centreSlug: 'lyon'
            }
          }
        ]
      } as unknown as DirectusFormation
      catalog.fetchAllFormations.mockResolvedValue([centred])
      catalog.fetchAllCentres.mockResolvedValue([
        {
          id: 1,
          slug: 'lyon',
          name: 'Centre LEARN UP de Lyon',
          status: 'published',
          address: '12 rue de la Part-Dieu, 69003 Lyon',
          city: 'Lyon',
          postal_code: '69003',
          department: 'Rhône',
          region: 'Auvergne-Rhône-Alpes',
          latitude: 45.76,
          longitude: 4.85
        }
      ])

      // Villeurbanne ≈ 5 km du centre → match ; Brest ≈ 700 km → pas de match.
      const near = await service.list({
        location: '45.77,4.88',
        page: 1,
        limit: 10
      } as ListCoursesDto)
      expect(near.items).toHaveLength(1)
      const far = await service.list({
        location: '48.39,-4.49',
        page: 1,
        limit: 10
      } as ListCoursesDto)
      expect(far.items).toHaveLength(0)
    })

    it('retombe sur locations_text quand aucune session n’est géolocalisée', async () => {
      cache.get.mockResolvedValue(null)
      catalog.fetchAllFormations.mockResolvedValue([
        { ...geoFormation, sessions: null, locations_text: 'Toute la France' }
      ])
      const result = await service.list({
        location: 'france',
        page: 1,
        limit: 10
      } as ListCoursesDto)
      expect(result.items).toHaveLength(1)
    })

    it('retombe sur locationText en mode géo (lat,lng|label) sans centre géocodé', async () => {
      // geoFormation : sessions avec lieux Digiforma (pas de centreSlug) →
      // aucune coordonnée ; le geosuggest transporte le nom de la commune.
      expect(await listWithLocation('45.77,4.88|Lyon')).toBe(1)
      expect(await listWithLocation('45.77,4.88|Brest')).toBe(0)
    })

    it('exclut en mode géo sans label quand aucun centre n’est géocodé', async () => {
      expect(await listWithLocation('45.77,4.88')).toBe(0)
    })

    it('distingue les départements corses « 2A » et « 2B »', async () => {
      const corsica = (slug: string, postalCode: string, department: string, city: string) =>
        ({
          ...baseFormation,
          id: slug === 'ajaccio' ? 5 : 6,
          digiforma_id: `prog-${slug}`,
          slug,
          sessions: [
            {
              id: 's1',
              startDate: null,
              endDate: null,
              modality: 'presentiel',
              seatsRemaining: null,
              location: {
                name: null,
                city,
                postalCode,
                department,
                region: 'Corse',
                centreSlug: null
              }
            }
          ]
        }) as unknown as DirectusFormation
      cache.get.mockResolvedValue(null)
      catalog.fetchAllFormations.mockResolvedValue([
        corsica('ajaccio', '20090', 'Corse-du-Sud', 'Ajaccio'),
        corsica('bastia', '20200', 'Haute-Corse', 'Bastia')
      ])

      const sud = await service.list({ location: '2A', page: 1, limit: 10 } as ListCoursesDto)
      expect(sud.items.map((i) => i.slug)).toEqual(['ajaccio'])
      const nord = await service.list({ location: '2B', page: 1, limit: 10 } as ListCoursesDto)
      expect(nord.items.map((i) => i.slug)).toEqual(['bastia'])
    })

    it('matche « 2A » via locations_text quand aucune session n’est structurée', async () => {
      cache.get.mockResolvedValue(null)
      catalog.fetchAllFormations.mockResolvedValue([
        { ...geoFormation, sessions: null, locations_text: 'Ajaccio 20090 Corse-du-Sud' }
      ])
      const result = await service.list({ location: '2A', page: 1, limit: 10 } as ListCoursesDto)
      expect(result.items).toHaveLength(1)
    })

    it('garde locations aligné sur sessions quand une session n’a pas de localisation', async () => {
      const withHole = {
        ...geoFormation,
        id: 5,
        digiforma_id: 'prog-hole',
        slug: 'hole',
        sessions: [
          geoFormation.sessions?.[0],
          {
            id: 's-mid',
            startDate: null,
            endDate: null,
            modality: 'presentiel',
            seatsRemaining: null,
            location: null
          },
          geoFormation.sessions?.[1]
        ]
      } as unknown as DirectusFormation
      cache.get.mockResolvedValue(null)
      catalog.fetchAllFormations.mockResolvedValue([withHole])

      const rows = await service.allCourses()
      // L'index de `locations` suit celui de `sessions` : trou en position 1.
      expect(rows[0].locations).toHaveLength(3)
      expect(rows[0].locations[1]).toBeNull()
      expect(rows[0].locations[2]?.city).toBe('Marseille')

      // Le trou ne fausse ni le matching ni le repli locationText.
      const result = await service.list({
        location: 'marseille',
        page: 1,
        limit: 10
      } as ListCoursesDto)
      expect(result.items.map((i) => i.slug)).toEqual(['hole'])
    })
  })

  describe('facets', () => {
    it('compte chaque dimension en ignorant son propre filtre', async () => {
      cache.get.mockResolvedValue(null)

      const result = await service.list({
        family: 'management',
        page: 1,
        limit: 20
      } as ListCoursesDto)

      // Le filtre family est ignoré pour les compteurs de familles…
      expect(result.facets.families).toEqual({ management: 1, securite: 1 })
      // …mais appliqué aux autres dimensions.
      expect(result.facets.subFamilies).toEqual({ 'pilotage-projet': 1 })
      expect(result.items).toHaveLength(1)
    })

    it('compte les buckets de durée multi-valués sans son propre filtre', async () => {
      cache.get.mockResolvedValue(null)

      const result = await service.list({
        durations: 'courte',
        page: 1,
        limit: 20
      } as ListCoursesDto)

      expect(result.facets.durations).toEqual({ courte: 1, moyenne: 1 })
      expect(result.items.map((i) => i.slug)).toEqual(['securite'])
    })

    it('compte département et région comme localisations', async () => {
      cache.get.mockResolvedValue(null)
      catalog.fetchAllFormations.mockResolvedValue([
        {
          ...baseFormation,
          id: 3,
          digiforma_id: 'prog-003',
          slug: 'avec-session',
          sessions: [
            {
              id: 's1',
              startDate: '2026-03-01',
              endDate: '2026-03-03',
              modality: 'presentiel',
              seatsRemaining: 5,
              location: {
                name: 'Centre de Lyon',
                city: 'Lyon',
                postalCode: '69003',
                department: 'Rhône',
                region: 'Auvergne-Rhône-Alpes',
                centreSlug: null
              }
            }
          ]
        }
      ])

      const result = await service.list({ page: 1, limit: 20 } as ListCoursesDto)

      expect(result.facets.locations).toEqual({
        Rhône: 1,
        'Auvergne-Rhône-Alpes': 1
      })
    })
  })

  describe('availability filter', () => {
    // Dates relatives : dernier jour du mois courant (toujours « ce mois-ci »,
    // y compris quand le test tourne ce jour-là) et un mois plus tard.
    const now = new Date()
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10)
    const later = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 15))
      .toISOString()
      .slice(0, 10)

    const withSession = (id: number, slug: string, startDate: string | null) =>
      ({
        ...baseFormation,
        id,
        digiforma_id: `prog-${id}`,
        slug,
        sessions: startDate
          ? [
              {
                id: `s-${id}`,
                startDate,
                endDate: null,
                modality: 'presentiel',
                seatsRemaining: null,
                location: null
              }
            ]
          : null
      }) as unknown as DirectusFormation

    beforeEach(() => {
      cache.get.mockResolvedValue(null)
      catalog.fetchAllFormations.mockResolvedValue([
        withSession(3, 'ce-mois', endOfMonth),
        withSession(4, 'plus-tard', later),
        withSession(5, 'sur-demande', null)
      ])
    })

    it.each([
      { availability: CourseAvailability.thisMonth, expected: ['ce-mois'] },
      { availability: CourseAvailability.scheduled, expected: ['plus-tard'] },
      { availability: CourseAvailability.onDemand, expected: ['sur-demande'] }
    ])('filtre $availability → $expected', async ({ availability, expected }) => {
      const result = await service.list({ availability, page: 1, limit: 20 } as ListCoursesDto)

      expect(result.items.map((i) => i.slug)).toEqual(expected)
    })
  })

  it('proposes famille and sous-famille on applyFamilies, without overwriting', async () => {
    const {
      catalog: catalogMock,
      applyFamilyAssignments,
      fetchAllFormations,
      getSubFamilyIdsByFamilySlug
    } = mockCatalog()
    getSubFamilyIdsByFamilySlug.mockResolvedValue(
      new Map([['management', new Map([['management', 42]])]])
    )
    const unset: DirectusFormation = {
      ...baseFormation,
      id: 3,
      digiforma_id: 'prog-003',
      slug: 'coaching',
      famille: null,
      sous_famille: null
    }
    fetchAllFormations.mockResolvedValue([unset])

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CacheService, useValue: mockCache().cache },
        { provide: DirectusCatalogService, useValue: catalogMock },
        { provide: SearchMissesService, useValue: { record: vi.fn() } }
      ]
    }).compile()
    const local = module.get<CatalogService>(CatalogService)

    await local.applyFamilies()

    expect(applyFamilyAssignments).toHaveBeenCalledWith(
      new Map([['prog-003', { famille: 'management', sousFamille: 'management' }]])
    )
  })

  it('never proposes a sous-famille already set', async () => {
    const {
      catalog: catalogMock,
      applyFamilyAssignments,
      fetchAllFormations,
      getSubFamilyIdsByFamilySlug
    } = mockCatalog()
    getSubFamilyIdsByFamilySlug.mockResolvedValue(
      new Map([['management', new Map([['management', 42]])]])
    )
    fetchAllFormations.mockResolvedValue([baseFormation])

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CacheService, useValue: mockCache().cache },
        { provide: DirectusCatalogService, useValue: catalogMock },
        { provide: SearchMissesService, useValue: { record: vi.fn() } }
      ]
    }).compile()
    const local = module.get<CatalogService>(CatalogService)

    await local.applyFamilies()

    expect(applyFamilyAssignments).toHaveBeenCalledWith(
      new Map([['prog-001', { famille: 'management' }]])
    )
  })
})

describe('list filters and field normalization', () => {
  let service: CatalogService
  let cache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }
  let catalog: {
    fetchAllFormations: ReturnType<typeof vi.fn>
    fetchAllCentres: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    const { cache: cacheMock, get, set } = mockCache()
    const { catalog: catalogMock, fetchAllFormations, fetchAllCentres } = mockCatalog()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CacheService, useValue: cacheMock },
        { provide: DirectusCatalogService, useValue: catalogMock },
        { provide: SearchMissesService, useValue: { record: vi.fn() } }
      ]
    }).compile()

    service = module.get<CatalogService>(CatalogService)
    cache = { get, set }
    catalog = { fetchAllFormations, fetchAllCentres }
    cache.get.mockResolvedValue(null)
  })

  it('filters by modalities, ignoring blank entries', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      { ...baseFormation, modalities: ['e-learning'] },
      { ...secondFormation, modalities: ['presentiel'] }
    ])

    const matching = await service.list({
      modalities: 'e-learning, ',
      page: 1,
      limit: 20
    } as ListCoursesDto)
    expect(matching.items).toHaveLength(1)
    expect(matching.items[0].slug).toBe('pilotage-de-projet')

    const all = await service.list({ modalities: ' ,,', page: 1, limit: 20 } as ListCoursesDto)
    expect(all.items).toHaveLength(2)
  })

  it('filters by duration buckets with day fallback', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      { ...baseFormation, slug: 'short', duration_hours: 7, duration_days: 1 },
      { ...baseFormation, slug: 'long', duration_hours: 50, duration_days: 7 },
      {
        ...baseFormation,
        slug: 'long-days',
        duration_hours: null,
        duration_days: 6
      },
      { ...baseFormation, slug: 'mid', duration_hours: 20, duration_days: 3 }
    ] as unknown as DirectusFormation[])

    const courte = await service.list({ durations: 'courte', page: 1, limit: 20 } as ListCoursesDto)
    expect(courte.items.map((i) => i.slug)).toEqual(['short'])

    const longue = await service.list({ durations: 'longue', page: 1, limit: 20 } as ListCoursesDto)
    expect(longue.items.map((i) => i.slug)).toEqual(['long', 'long-days'])

    const moyenne = await service.list({
      durations: 'moyenne',
      page: 1,
      limit: 20
    } as ListCoursesDto)
    expect(moyenne.items.map((i) => i.slug)).toEqual(['mid'])

    const unknown = await service.list({
      durations: 'invalide',
      page: 1,
      limit: 20
    } as ListCoursesDto)
    expect(unknown.items).toHaveLength(4)
  })

  it('filters by duration range', async () => {
    const minOnly = await service.list({ durationMin: 22, page: 1, limit: 20 } as ListCoursesDto)
    expect(minOnly.items).toHaveLength(0)

    const maxOnly = await service.list({ durationMax: 10, page: 1, limit: 20 } as ListCoursesDto)
    expect(maxOnly.items.map((i) => i.slug)).toEqual(['securite'])
  })

  it('excludes courses without price from a max price filter', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      { ...baseFormation, price: null },
      secondFormation
    ] as unknown as DirectusFormation[])

    const result = await service.list({ priceMax: 1000, page: 1, limit: 20 } as ListCoursesDto)
    expect(result.items.map((i) => i.slug)).toEqual(['securite'])
  })

  it('filters by center on centerSlug or centerSlugs', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      { ...baseFormation, center_slug: 'creteil' },
      { ...secondFormation, center_slugs: ['creteil', 'lyon'] }
    ] as unknown as DirectusFormation[])

    const creteil = await service.list({ center: 'creteil', page: 1, limit: 20 } as ListCoursesDto)
    expect(creteil.items).toHaveLength(2)

    const paris = await service.list({ center: 'paris', page: 1, limit: 20 } as ListCoursesDto)
    expect(paris.items).toHaveLength(0)
  })

  it('filters by center on the M2M centres selection, which wins over center_slugs', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        center_slugs: ['creteil'],
        centres: [{ centre: { slug: 'lyon' } }, { centre: { slug: 'paris' } }]
      },
      // M2M vide → repli sur la liste legacy `center_slugs`.
      { ...secondFormation, center_slugs: ['creteil'], centres: [] }
    ] as unknown as DirectusFormation[])

    const lyon = await service.list({ center: 'lyon', page: 1, limit: 20 } as ListCoursesDto)
    expect(lyon.items.map((i) => i.slug)).toEqual(['pilotage-de-projet'])

    const paris = await service.list({ center: 'paris', page: 1, limit: 20 } as ListCoursesDto)
    expect(paris.items.map((i) => i.slug)).toEqual(['pilotage-de-projet'])

    // La sélection éditoriale remplace la liste legacy : 'creteil' ne matche
    // plus la formation une fois le M2M renseigné.
    const creteil = await service.list({ center: 'creteil', page: 1, limit: 20 } as ListCoursesDto)
    expect(creteil.items.map((i) => i.slug)).toEqual(['securite'])
  })

  it('aligns centerSlug on the first editorial centre slug', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        center_slug: 'creteil',
        center_slugs: ['creteil'],
        centres: [{ centre: { slug: 'lyon' } }, { centre: { slug: 'paris' } }]
      }
    ] as unknown as DirectusFormation[])

    const result = await service.list({ page: 1, limit: 20 } as ListCoursesDto)
    // centerSlug ne contredit pas centerSlugs : la sélection éditoriale
    // prime — repli sur center_slug seulement si tout est vide.
    expect(result.items[0]?.centerSlugs).toEqual(['lyon', 'paris'])
    expect(result.items[0]?.centerSlug).toBe('lyon')

    catalog.fetchAllFormations.mockResolvedValue([
      { ...baseFormation, center_slug: 'creteil', center_slugs: [], centres: [] }
    ] as unknown as DirectusFormation[])
    const legacy = await service.list({ page: 1, limit: 20 } as ListCoursesDto)
    expect(legacy.items[0]?.centerSlug).toBe('creteil')
  })

  it('filters by certifying flag', async () => {
    const certifying = await service.list({
      certifying: true,
      page: 1,
      limit: 20
    } as ListCoursesDto)
    expect(certifying.items.map((i) => i.slug)).toEqual(['pilotage-de-projet'])

    const notCertifying = await service.list({
      certifying: false,
      page: 1,
      limit: 20
    } as ListCoursesDto)
    expect(notCertifying.items.map((i) => i.slug)).toEqual(['securite'])
  })

  it('sorts by duration ascending and descending', async () => {
    const asc = await service.list({
      sort: CourseSortField.duration,
      order: CourseSortOrder.asc,
      page: 1,
      limit: 20
    } as ListCoursesDto)
    expect(asc.items.map((i) => i.slug)).toEqual(['securite', 'pilotage-de-projet'])

    const desc = await service.list({
      sort: CourseSortField.duration,
      order: CourseSortOrder.desc,
      page: 1,
      limit: 20
    } as ListCoursesDto)
    expect(desc.items.map((i) => i.slug)).toEqual(['pilotage-de-projet', 'securite'])
  })

  it('serves formations from cache without fetching Directus', async () => {
    cache.get.mockImplementation((key: string) => {
      if (key === 'formations:all') return Promise.resolve(formations)
      return Promise.resolve(null)
    })

    const result = await service.list({ page: 1, limit: 20 } as ListCoursesDto)

    expect(result.items).toHaveLength(2)
    expect(catalog.fetchAllFormations).not.toHaveBeenCalled()
  })

  it('normalizes pedagogy strings and objects', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        pedagogy: [
          'Inter en centre',
          { title: 'Séances en ligne', description: 5 },
          { title: ' ' },
          { name: 'no-title' },
          '   ',
          null
        ]
      }
    ])

    const course = await service.findBySlug('pilotage-de-projet')

    expect(course?.pedagogy).toEqual([
      { title: 'Inter en centre', description: null },
      { title: 'Séances en ligne', description: null }
    ])
  })

  it('falls back to pedagogy blocks when the pedagogy field is empty', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        pedagogy: null,
        blocks: [
          { type: 'objectifs', name: 'Objectifs' },
          { type: 'pedagogie', name: 'Ateliers pratiques', description: '4 ateliers' },
          { type: 'pedagogie', name: ' ' },
          { type: 'pedagogie' },
          'not-an-object',
          null
        ]
      }
    ])

    const course = await service.findBySlug('pilotage-de-projet')

    expect(course?.pedagogy).toEqual([{ title: 'Ateliers pratiques', description: '4 ateliers' }])
  })
})

describe('branch coverage: fallbacks', () => {
  let service: CatalogService
  let cache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }
  let catalog: {
    fetchAllFormations: ReturnType<typeof vi.fn>
    fetchAllCentres: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    const { cache: cacheMock, get, set } = mockCache()
    const { catalog: catalogMock, fetchAllFormations, fetchAllCentres } = mockCatalog()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CacheService, useValue: cacheMock },
        { provide: DirectusCatalogService, useValue: catalogMock },
        { provide: SearchMissesService, useValue: { record: vi.fn() } }
      ]
    }).compile()

    service = module.get<CatalogService>(CatalogService)
    cache = { get, set }
    catalog = { fetchAllFormations, fetchAllCentres }
    cache.get.mockResolvedValue(null)
  })

  it('ignores invalid session entries and keeps null fields', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        slug: 'sessions-mix',
        sessions: [
          null,
          'junk',
          {
            id: 7,
            startDate: 123,
            endDate: null,
            modality: 'presentiel',
            seatsRemaining: 5,
            location: 'pas-un-objet'
          },
          {
            id: 's2',
            startDate: '2027-01-10',
            endDate: null,
            modality: null,
            seatsRemaining: null,
            location: { name: 'Lyon', city: null }
          }
        ]
      }
    ] as unknown as DirectusFormation[])

    const course = await service.findBySlug('sessions-mix')

    expect(course?.sessions).toHaveLength(2)
    expect(course?.sessions?.[0].seatsRemaining).toBe(5)
    expect(course?.sessions?.[0].location).toBeNull()
    expect(course?.sessions?.[1].location?.name).toBe('Lyon')
    expect(course?.sessions?.[1].location?.city).toBeNull()
  })

  it('returns null sessions when every entry is invalid', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      { ...baseFormation, sessions: [null, 42, 'x'] },
      { ...secondFormation, sessions: [] }
    ] as unknown as DirectusFormation[])

    const first = await service.findBySlug('pilotage-de-projet')
    const second = await service.findBySlug('securite')

    expect(first?.sessions).toBeNull()
    expect(second?.sessions).toBeNull()
  })

  it('maps non-numeric duration and price fields to null', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        duration_days: 'abc',
        duration_hours: '14',
        price: null
      }
    ] as unknown as DirectusFormation[])

    const course = await service.findBySlug('pilotage-de-projet')

    expect(course?.durationDays).toBeNull()
    expect(course?.durationHours).toBe(14)
    expect(course?.price).toBeNull()
  })

  it('serializes Date created_at and updated_at', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        created_at: new Date('2026-02-01T12:00:00.000Z'),
        updated_at: new Date('2026-02-05T08:30:00.000Z')
      }
    ] as unknown as DirectusFormation[])

    const course = await service.findBySlug('pilotage-de-projet')

    expect(course?.createdAt).toBe('2026-02-01T12:00:00.000Z')
    expect(course?.updatedAt).toBe('2026-02-05T08:30:00.000Z')
  })

  it('falls back when extractTexts/toStringList entries are unusable', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        raw: null,
        evaluation: 'pas-un-tableau',
        blocks: 'pas-un-tableau'
      },
      {
        ...secondFormation,
        raw: { targets: 'string', prerequisites: [{ noText: true }, { text: 5 }] },
        evaluation: ['ok', ' ', 3, null],
        blocks: []
      }
    ] as unknown as DirectusFormation[])

    const first = await service.findBySlug('pilotage-de-projet')
    const second = await service.findBySlug('securite')

    expect(first?.targets).toBeNull()
    expect(first?.blocks).toBeNull()
    expect(first?.evaluation).toBeNull()
    expect(second?.targets).toBeNull()
    expect(second?.prerequisites).toBeNull()
    expect(second?.evaluation).toEqual(['ok'])
    expect(second?.blocks).toEqual([])
  })

  it('returns pedagogy null when no editable field nor blocks match', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        pedagogy: null,
        blocks: 'non-array'
      }
    ] as unknown as DirectusFormation[])

    const course = await service.findBySlug('pilotage-de-projet')

    expect(course?.pedagogy).toBeNull()
  })

  it('extracts imageUrl fallbacks from raw image', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        raw: { image: { url: 'https://img.test/a.png' } }
      },
      {
        ...secondFormation,
        raw: { image: { url: 42 } }
      }
    ] as unknown as DirectusFormation[])

    const first = await service.findBySlug('pilotage-de-projet')
    const second = await service.findBySlug('securite')

    expect(first?.imageUrl).toBe('https://img.test/a.png')
    expect(second?.imageUrl).toBeNull()
  })

  it('finds a course by slug without a family filter', async () => {
    const course = await service.findBySlug('pilotage-de-projet')

    expect(course?.slug).toBe('pilotage-de-projet')
  })

  it('rejects a slug when the family mismatches', async () => {
    const course = await service.findBySlug('pilotage-de-projet', 'securite')

    expect(course).toBeNull()
  })

  it('counts repeated families and skips rows without family slug', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      baseFormation,
      { ...baseFormation, id: 5, digiforma_id: 'prog-005', slug: 'autre', famille: null },
      { ...baseFormation, id: 6, digiforma_id: 'prog-006', slug: 'encore' }
    ] as unknown as DirectusFormation[])

    const families = await service.families()

    expect(families).toEqual([{ slug: 'management', count: 2 }])
  })

  it('matches a location by postal code prefix', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        sessions: [
          {
            id: 's1',
            startDate: null,
            endDate: null,
            modality: null,
            seatsRemaining: null,
            location: { postalCode: '69003' }
          }
        ]
      }
    ] as unknown as DirectusFormation[])

    const result = await service.list({ location: '6900', page: 1, limit: 10 } as ListCoursesDto)

    expect(result.items).toHaveLength(1)
  })

  it('does not filter when location/search tokens are all stripped', async () => {
    const result = await service.list({
      location: 'x',
      search: 'le',
      page: 1,
      limit: 10
    } as ListCoursesDto)

    expect(result.items).toHaveLength(2)
  })

  it('buckette une durée courte via les jours seuls', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      { ...baseFormation, duration_hours: null, duration_days: 1 },
      { ...secondFormation, duration_hours: null, duration_days: 2 }
    ] as unknown as DirectusFormation[])

    const result = await service.list({ durations: 'courte', page: 1, limit: 10 } as ListCoursesDto)

    expect(result.items.map((i) => i.slug)).toEqual(['pilotage-de-projet'])
  })

  it.each([
    { hours: 8, days: 2, expected: 'courte' },
    { hours: 8.5, days: null, expected: 'moyenne' },
    { hours: 9, days: null, expected: 'moyenne' },
    { hours: 40, days: null, expected: 'moyenne' },
    { hours: 40.5, days: null, expected: 'longue' },
    { hours: null, days: 1, expected: 'courte' },
    { hours: null, days: 1.5, expected: 'moyenne' },
    { hours: null, days: 2, expected: 'moyenne' },
    { hours: null, days: 5, expected: 'moyenne' },
    { hours: null, days: 5.5, expected: 'longue' }
  ])(
    'no duration falls between buckets: $hours h / $days j → $expected',
    async ({ hours, days, expected }) => {
      catalog.fetchAllFormations.mockResolvedValue([
        { ...baseFormation, duration_hours: hours, duration_days: days }
      ] as unknown as DirectusFormation[])

      const result = await service.list({
        durations: expected,
        page: 1,
        limit: 10
      } as ListCoursesDto)

      expect(result.items).toHaveLength(1)
      expect(result.items[0].durationBucket).toBe(expected)
    }
  )

  it('falls back to updatedAt when duration and price are equal', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        duration_hours: 7,
        price: 100,
        updated_at: '2026-01-10T00:00:00.000Z'
      },
      {
        ...secondFormation,
        duration_hours: 7,
        price: 100,
        updated_at: '2026-01-20T00:00:00.000Z'
      }
    ] as unknown as DirectusFormation[])

    for (const sort of [CourseSortField.duration, CourseSortField.price]) {
      const asc = await service.list({
        sort,
        order: CourseSortOrder.asc,
        page: 1,
        limit: 10
      } as ListCoursesDto)
      expect(asc.items[0].slug).toBe('pilotage-de-projet')

      const desc = await service.list({
        sort,
        order: CourseSortOrder.desc,
        page: 1,
        limit: 10
      } as ListCoursesDto)
      expect(desc.items[0].slug).toBe('securite')
    }
  })

  it('orders by updatedAt desc by default and honors order=asc', async () => {
    const desc = await service.list({
      sort: CourseSortField.updatedAt,
      order: CourseSortOrder.desc,
      page: 1,
      limit: 10
    } as ListCoursesDto)
    expect(desc.items.map((i) => i.slug)).toEqual(['securite', 'pilotage-de-projet'])

    const implicit = await service.list({ page: 1, limit: 10 } as ListCoursesDto)
    expect(implicit.items.map((i) => i.slug)).toEqual(['securite', 'pilotage-de-projet'])

    const asc = await service.list({
      sort: CourseSortField.updatedAt,
      order: CourseSortOrder.asc,
      page: 1,
      limit: 10
    } as ListCoursesDto)
    expect(asc.items.map((i) => i.slug)).toEqual(['pilotage-de-projet', 'securite'])
  })

  it('recomputes rows when the cache entry is malformed', async () => {
    cache.get.mockImplementation((key: string) => {
      if (key === 'courses:rows') return Promise.resolve([{ junk: true }])
      return Promise.resolve(null)
    })

    const result = await service.list({ page: 1, limit: 10 } as ListCoursesDto)

    expect(result.items).toHaveLength(2)
    expect(catalog.fetchAllFormations).toHaveBeenCalled()
  })

  it('skips formations without category in applyFamilies', async () => {
    const {
      catalog: catalogMock,
      applyFamilyAssignments,
      fetchAllFormations,
      getFamilyIdsBySlug
    } = mockCatalog()
    getFamilyIdsBySlug.mockResolvedValue(new Map([['management', 1]]))
    fetchAllFormations.mockResolvedValue([
      { ...baseFormation, category_name: null },
      {
        ...baseFormation,
        id: 7,
        digiforma_id: 'prog-007',
        slug: 'deja-posee',
        famille: { id: 99, slug: 'autre-famille' },
        sous_famille: null
      }
    ] as unknown as DirectusFormation[])

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CacheService, useValue: mockCache().cache },
        { provide: DirectusCatalogService, useValue: catalogMock },
        { provide: SearchMissesService, useValue: { record: vi.fn() } }
      ]
    }).compile()
    const local = module.get<CatalogService>(CatalogService)

    await local.applyFamilies()

    expect(applyFamilyAssignments).toHaveBeenCalledWith(new Map())
  })

  it('slugifies categories with punctuation in applyFamilies', async () => {
    const {
      catalog: catalogMock,
      applyFamilyAssignments,
      fetchAllFormations,
      getFamilyIdsBySlug
    } = mockCatalog()
    getFamilyIdsBySlug.mockResolvedValue(new Map([['gestion-co', 3]]))
    fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        category_name: '« Gestion & Co »',
        famille: null,
        sous_famille: null
      }
    ] as unknown as DirectusFormation[])

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CacheService, useValue: mockCache().cache },
        { provide: DirectusCatalogService, useValue: catalogMock },
        { provide: SearchMissesService, useValue: { record: vi.fn() } }
      ]
    }).compile()
    const local = module.get<CatalogService>(CatalogService)

    await local.applyFamilies()

    expect(applyFamilyAssignments).toHaveBeenCalledWith(
      new Map([['prog-001', { famille: 'gestion-co' }]])
    )
  })
})

describe('branch coverage: residual arms', () => {
  let service: CatalogService
  let cache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }
  let catalog: {
    fetchAllFormations: ReturnType<typeof vi.fn>
    fetchAllCentres: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    const { cache: cacheMock, get, set } = mockCache()
    const { catalog: catalogMock, fetchAllFormations, fetchAllCentres } = mockCatalog()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CacheService, useValue: cacheMock },
        { provide: DirectusCatalogService, useValue: catalogMock },
        { provide: SearchMissesService, useValue: { record: vi.fn() } }
      ]
    }).compile()

    service = module.get<CatalogService>(CatalogService)
    cache = { get, set }
    catalog = { fetchAllFormations, fetchAllCentres }
    cache.get.mockResolvedValue(null)
  })

  it('retourne null quand les listes de textes sont vides', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        raw: { targets: [{ text: 'ok' }, 'x', { text: ' ' }] },
        evaluation: [null, ' '],
        pedagogy: [null, '  '],
        blocks: [
          { type: 'pedagogie', name: 'Sans description' },
          { type: 'autre', name: 'Ignoré' }
        ]
      },
      {
        ...secondFormation,
        pedagogy: null,
        blocks: [{ type: 'objectifs', name: 'Objectifs' }]
      }
    ] as unknown as DirectusFormation[])

    const first = await service.findBySlug('pilotage-de-projet')
    const second = await service.findBySlug('securite')

    expect(first?.targets).toEqual(['ok'])
    expect(first?.evaluation).toBeNull()
    expect(first?.pedagogy).toEqual([{ title: 'Sans description', description: null }])
    expect(second?.pedagogy).toBeNull()
  })

  it('applique les fallbacks de listes Directus absentes', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        center_slugs: undefined,
        modalities: undefined,
        cpf: null
      }
    ] as unknown as DirectusFormation[])

    const course = await service.findBySlug('pilotage-de-projet')

    expect(course?.centerSlugs).toEqual([])
    expect(course?.modalities).toEqual([])

    const cpf = await service.list({ cpf: true, page: 1, limit: 10 } as ListCoursesDto)
    expect(cpf.items).toHaveLength(0)
  })

  it('retombe sur les jours et coordonnées nulls', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        duration_days: null,
        duration_hours: null,
        sessions: [
          {
            id: 's1',
            startDate: null,
            endDate: null,
            modality: null,
            seatsRemaining: null,
            location: { city: 'Lyon', postalCode: null, centreSlug: 'lyon' }
          }
        ]
      }
    ] as unknown as DirectusFormation[])
    catalog.fetchAllCentres.mockResolvedValue([
      {
        id: 1,
        slug: 'lyon',
        name: 'Lyon',
        status: 'published',
        address: 'Lyon',
        city: 'Lyon',
        postal_code: '69003',
        department: 'Rhône',
        region: 'ARA',
        latitude: null,
        longitude: null
      }
    ])

    const bucket = await service.list({ durations: 'courte', page: 1, limit: 10 } as ListCoursesDto)
    expect(bucket.items).toHaveLength(1)

    const geo = await service.list({
      location: '45.76,4.85',
      page: 1,
      limit: 10
    } as ListCoursesDto)
    expect(geo.items).toHaveLength(0)
  })

  it('matche un token numérique quand postalCode est absent', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      {
        ...baseFormation,
        sessions: [
          {
            id: 's1',
            startDate: null,
            endDate: null,
            modality: null,
            seatsRemaining: null,
            location: { city: 'Lyon', postalCode: null }
          }
        ]
      }
    ] as unknown as DirectusFormation[])

    const miss = await service.list({ location: '69', page: 1, limit: 10 } as ListCoursesDto)
    expect(miss.items).toHaveLength(0)
  })

  it('utilise les fallbacks numériques du tri', async () => {
    catalog.fetchAllFormations.mockResolvedValue([
      secondFormation,
      { ...baseFormation, duration_hours: null, price: null },
      {
        ...secondFormation,
        id: 9,
        digiforma_id: 'prog-009',
        slug: 'troisieme',
        duration_hours: null,
        price: null
      }
    ] as unknown as DirectusFormation[])

    const byDuration = await service.list({
      sort: CourseSortField.duration,
      order: CourseSortOrder.desc,
      page: 1,
      limit: 10
    } as ListCoursesDto)
    expect(byDuration.items[0].slug).toBe('securite')

    const byPrice = await service.list({
      sort: CourseSortField.price,
      order: CourseSortOrder.desc,
      page: 1,
      limit: 10
    } as ListCoursesDto)
    expect(byPrice.items[0].slug).toBe('securite')
  })

  it('sert les rows depuis le cache quand elles sont valides', async () => {
    const cachedRow = {
      course: {
        id: 1,
        slug: 'cached',
        title: 'Cachée',
        description: null,
        durationDays: null,
        durationHours: null,
        price: null,
        cpf: null,
        cpfCode: null,
        certification: null,
        certifierName: null,
        category: null,
        familySlug: 'management',
        subFamilySlug: null,
        subFamilyName: null,
        centerSlug: null,
        centerSlugs: [],
        modalities: [],
        sessions: null,
        image: null,
        imageUrl: null,
        generatedProgramUrl: null,
        status: 'published',
        seoTitle: null,
        seoDescription: null,
        seoCanonical: null
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
      searchText: 'cachee',
      locationText: '',
      locations: []
    }
    cache.get.mockImplementation((key: string) => {
      if (key === 'courses:rows') return Promise.resolve([cachedRow])
      return Promise.resolve(null)
    })

    const result = await service.list({ page: 1, limit: 10 } as ListCoursesDto)

    expect(result.items[0].slug).toBe('cached')
    expect(catalog.fetchAllFormations).not.toHaveBeenCalled()
  })

  it('propose une sous-famille via la famille existante', async () => {
    const {
      catalog: catalogMock,
      applyFamilyAssignments,
      fetchAllFormations,
      getFamilyIdsBySlug,
      getSubFamilyIdsByFamilySlug
    } = mockCatalog()
    getFamilyIdsBySlug.mockResolvedValue(new Map())
    getSubFamilyIdsByFamilySlug.mockResolvedValue(
      new Map([['management', new Map([['atelier', 7]])]])
    )
    fetchAllFormations.mockResolvedValue([
      { ...baseFormation, category_name: 'Atelier', sous_famille: null },
      {
        ...baseFormation,
        id: 8,
        digiforma_id: 'prog-008',
        slug: 'sans-famille',
        category_name: 'Atelier',
        famille: null,
        sous_famille: null
      }
    ] as unknown as DirectusFormation[])

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CacheService, useValue: mockCache().cache },
        { provide: DirectusCatalogService, useValue: catalogMock },
        { provide: SearchMissesService, useValue: { record: vi.fn() } }
      ]
    }).compile()
    const local = module.get<CatalogService>(CatalogService)

    await local.applyFamilies()

    expect(applyFamilyAssignments).toHaveBeenCalledWith(
      new Map([['prog-001', { sousFamille: 'atelier' }]])
    )
  })
})
