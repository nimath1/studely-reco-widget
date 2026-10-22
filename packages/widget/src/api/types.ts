/**
 * Types du contrat d'API réel (chatbot « AI Mobility Coach », OpenAPI
 * chatbot.dev.ml.studely.com) : POST /chat en SSE.
 */

/** POST /chat body: `mode` defaults to « sav » server-side (no other mode documented). */
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
  /** Legacy field kept for backward compatibility — prefer `source_url`. */
  url?: string
  /** Marker correlating with the literal `[S3]` tags in the reply text. */
  label?: string
  source_url?: string
  updated_at?: string
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
  /** Full retrieval list, carried by the `event: sources` block. */
  sources?: ChatCitation[]
}

/** Réponse complète d'un appel /chat : texte reconstitué + métadonnées. */
export interface ChatReply {
  text: string
  meta: ChatFinal
}
