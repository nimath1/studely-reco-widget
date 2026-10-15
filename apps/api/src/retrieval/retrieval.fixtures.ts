import type { CourseListItem } from '@studely/types'
import { normalizeText } from '../common/utils/text.util'
import type { CatalogIndexEntry } from './catalog-index.service'

// Corpus de test du retrieval — dérivé de test/fixtures/programs.json,
// enrichi de formations réglementaires (SST, CACES, habilitation) pour
// couvrir les expansions métier.
interface CourseSeed {
  id: number
  slug: string
  title: string
  description: string
  shortDescription?: string
  category: string
  familySlug: string
  modalities?: string[]
  certification?: string
  /** Une session par ville ; `postalCodes` s'aligne sur `cities`. */
  cities?: string[]
  postalCodes?: string[]
  status?: string
}

export function makeCourse(seed: CourseSeed): CourseListItem {
  return {
    id: seed.id,
    slug: seed.slug,
    title: seed.title,
    description: `<p>${seed.description}</p>`,
    shortDescription: seed.shortDescription ?? null,
    durationDays: 2,
    durationHours: 14,
    durationBucket: 'moyenne',
    price: null,
    cpf: null,
    cpfCode: null,
    certification: seed.certification ?? null,
    certifierName: null,
    category: seed.category,
    familySlug: seed.familySlug,
    subFamilySlug: null,
    subFamilyName: null,
    centerSlug: null,
    centerSlugs: [],
    modalities: seed.modalities ?? ['inter', 'presentiel'],
    sessions: null,
    image: null,
    imageUrl: null,
    generatedProgramUrl: null,
    status: seed.status ?? 'published',
    seoTitle: null,
    seoDescription: null,
    seoCanonical: null
  }
}

export function makeEntry(seed: CourseSeed): CatalogIndexEntry {
  const cities = seed.cities ?? []
  return {
    course: makeCourse(seed),
    // Comme CatalogService.buildLocationText : normalisé, sans accents.
    locationText: normalizeText(cities.join(' ')),
    locations: cities.map((city, index) => ({
      name: `Centre LEARN UP de ${city}`,
      city,
      postalCode: seed.postalCodes?.[index] ?? null,
      department: null,
      region: null,
      centreSlug: null,
      address: null,
      latitude: null,
      longitude: null
    }))
  }
}

export const RETRIEVAL_CORPUS: CatalogIndexEntry[] = [
  makeEntry({
    id: 1,
    slug: 'gestion-des-conflits-en-equipe',
    title: 'Gestion des conflits en équipe',
    description: "Apaiser les tensions et transformer les conflits en opportunités d'amélioration.",
    category: 'Management',
    familySlug: 'management',
    modalities: ['inter', 'presentiel', 'distanciel'],
    cities: ['Marseille', 'Lille']
  }),
  makeEntry({
    id: 2,
    slug: 'communication-non-violente',
    title: 'Communication non-violente',
    description: 'Oser des échanges constructifs et apaisés dans des situations tendues.',
    category: 'Management',
    familySlug: 'management',
    cities: ['Lyon', 'Marseille']
  }),
  makeEntry({
    id: 3,
    slug: 'finance-pour-managers',
    title: 'Finance pour managers',
    description: 'Lire et construire les outils de gestion pour piloter la performance économique.',
    category: 'Finance',
    familySlug: 'finance',
    modalities: ['inter', 'hybride'],
    cities: ['Toulouse', 'Paris']
  }),
  makeEntry({
    id: 4,
    slug: 'cybersecurite-fondamentaux',
    title: 'Cybersécurité : les fondamentaux',
    description: 'Comprendre les menaces, sécuriser les accès et appliquer les bonnes pratiques.',
    category: 'Informatique',
    familySlug: 'informatique',
    modalities: ['inter', 'distanciel'],
    cities: ['Nantes']
  }),
  makeEntry({
    id: 5,
    slug: 'sst-sauveteur-secouriste-du-travail',
    title: 'SST — Sauveteur Secouriste du Travail',
    description: 'Former les salariés à la prévention et aux premiers secours en entreprise.',
    category: 'Sécurité & prévention',
    familySlug: 'securite-prevention',
    certification: 'Certificat SST',
    cities: ['Créteil', 'Lyon']
  }),
  makeEntry({
    id: 6,
    slug: 'caces-r489-chariots-elevateurs',
    title: 'CACES R489 — chariots élévateurs',
    description: 'Conduite en sécurité des chariots automoteurs de manutention.',
    category: "CACES & conduite d'engins",
    familySlug: 'caces-conduite-engins',
    certification: 'CACES R489',
    cities: ['Créteil']
  }),
  makeEntry({
    id: 7,
    slug: 'habilitation-electrique-b0-h0',
    title: 'Habilitation électrique B0-H0',
    description: 'Prévenir les risques électriques pour le personnel non électricien.',
    category: 'Habilitations électriques',
    familySlug: 'habilitations-electriques',
    cities: ['Lyon']
  }),
  makeEntry({
    id: 8,
    slug: 'pilotage-de-projet',
    title: 'Pilotage de projet',
    description:
      'Apprendre à piloter des projets complexes en équipe, de la planification à la livraison.',
    category: 'Management',
    familySlug: 'management',
    cities: ['Créteil', 'Paris']
  })
]
