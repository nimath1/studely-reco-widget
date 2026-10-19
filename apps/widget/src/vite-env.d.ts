/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de l'API de recommandation, fixée au build (§7.4). */
  readonly VITE_RECO_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
