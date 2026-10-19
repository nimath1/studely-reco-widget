/**
 * Types du contrat d'API réel (chatbot « AI Mobility Coach », OpenAPI
 * chatbot.dev.ml.studely.com) : POST /chat en SSE + structures du
 * questionnaire (options statiques, src/api/options.ts).
 */

/** Choix affiché dans le questionnaire : `id` technique, `label` affiché. */
export interface RecoOption {
  id: string
  label: string
}

/** Options du questionnaire — issues du dictionnaire statique localisé. */
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

/** Réponses du questionnaire (§5.1) — converties en message /chat. */
export interface RecoProfile {
  level: string
  fields: string[]
  destinations: string[]
  languages: LanguagePair[]
  budget: string
  intake: string
  goal?: string
}

/** Corps de POST /chat : `mode` n'accepte que « sav » en surface V0. */
export interface ChatRequest {
  message: string
  session_id?: string | null
  user_id?: string | null
  mode?: string
}

/** Chunk `event: delta` du flux SSE : fragment du texte de réponse. */
export interface ChatDelta {
  text?: string
}

/** Source citée par l'agent dans l'événement `final`. */
export interface ChatCitation {
  title?: string
  url?: string
}

/** Événement `final` du flux SSE : métadonnées de la réponse. */
export interface ChatFinal {
  session_id?: string
  handoff_proposed?: boolean
  out_of_scope?: boolean
  intent?: string
  lang?: string
  topic?: string
  citations?: ChatCitation[]
}

/** Réponse complète d'un appel /chat : texte reconstitué + métadonnées. */
export interface ChatReply {
  text: string
  meta: ChatFinal
}
