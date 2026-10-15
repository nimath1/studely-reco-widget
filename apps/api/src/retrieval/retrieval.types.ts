import type { CourseListItem } from '@studely/types'

/** Contrat interne requête → formations candidates (grounding IA, fallback déterministe). */
export interface RetrievalQuery {
  /** Besoin exprimé en langage naturel. */
  text: string
  /** Nombre de candidats renvoyés (défaut 5, max 20). */
  limit?: number
  /** Filtre strict sur le slug de famille. */
  family?: string
  /** Filtre : au moins une modalité parmi celles-ci. */
  modalities?: string[]
  /** Filtre texte de localisation (ville, département, région, CP). */
  location?: string
}

export interface RetrievalCandidate {
  course: CourseListItem
  /** Score fusionné [0, 1] — 1 = meilleur candidat de la requête. */
  score: number
  /** BM25 brut (recherche lexicale). */
  lexicalScore: number
  /** Similarité cosinus [0, 1] avec la requête (recherche sémantique). */
  semanticScore: number
  /** Termes de la requête retrouvés dans la formation (racinisés). */
  matchedTerms: string[]
  /** Part (pondérée idf) des termes de la requête couverts par la formation. */
  coverage: number
  /**
   * Candidat jugé solide : couverture lexicale majoritaire ou forte
   * similarité sémantique. Les seuils métier (« aucun résultat », « hors
   * catalogue ») restent la décision du consommateur.
   */
  confident: boolean
}

export interface RetrievalResult {
  query: string
  /** Termes de la requête après normalisation (racinisés, sans bruit). */
  terms: string[]
  candidates: RetrievalCandidate[]
  /** Nombre de formations indexées (publiées). */
  indexed: number
  index: RetrievalIndexInfo
}

export interface RetrievalIndexInfo {
  /** Version des clés catalogue au moment de la construction. */
  version: number
  builtAt: string
  /** Provider d'embeddings effectivement utilisé. */
  provider: string
  /** `true` quand le provider configuré a échoué et que le repli local a servi. */
  degraded: boolean
  documents: number
}

export interface EmbeddingsProvider {
  readonly name: string
  /** Vecteurs L2-normalisés, un par texte, tous de même dimension. */
  embed(texts: string[]): Promise<number[][]>
}

export const EMBEDDINGS_PROVIDER = Symbol('EMBEDDINGS_PROVIDER')
