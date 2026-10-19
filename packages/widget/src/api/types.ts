/**
 * Types du contrat d'API, générés depuis l'OpenAPI (§6) — ne pas modifier
 * à la main.
 */

/** Choix affiché dans le questionnaire : `id` envoyé à l'API, `label` affiché. */
export interface RecoOption {
  id: string
  label: string
}

/** Réponse de GET /v1/options — déjà traduite dans la locale demandée. */
export interface RecoOptions {
  levels: RecoOption[]
  fields: RecoOption[]
  destinations: RecoOption[]
  languages: RecoOption[]
  /** Niveaux de langue proposés dans le select de chaque langue choisie. */
  languageLevels: RecoOption[]
  budgets: RecoOption[]
  intakes: RecoOption[]
}

export interface LanguagePair {
  language: string
  level: string
}

/** Profil du questionnaire (§5.1), embarqué dans le payload (§6.1). */
export interface RecoProfile {
  level: string
  fields: string[]
  destinations: string[]
  languages: LanguagePair[]
  budget: string
  intake: string
  goal?: string
}

export interface RecommendationsRequest {
  locale: string
  origin: string
  profile: RecoProfile
  consent: {
    accepted: true
    version: string
  }
}

export interface RecoRecommendation {
  type?: string
  title: string
  destination?: string
  reason?: string
  tags?: string[]
  url?: string
}

export interface RecommendationsResponse {
  recommendations: RecoRecommendation[]
}
