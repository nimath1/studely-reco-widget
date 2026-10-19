/**
 * Client de l'API de recommandation (§6) : GET /v1/options et
 * POST /v1/recommendations, timeout 20 s, mapping des erreurs (§5.3).
 */

/** Injectée au build par environnement (`VITE_RECO_API_URL`), jamais lue depuis la page. */
export const API_BASE_URL: string = import.meta.env.VITE_RECO_API_URL
