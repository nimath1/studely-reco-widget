# Changelog

## [0.1.0-rc.1] — widget de recommandation

### Fonctionnel

- Parcours en 5 étapes (niveau, domaines ≤ 3, destinations, langues,
  budget/rentrée) avec validation à la sortie de chaque étape, progression
  « Étape x sur 5 », brouillon `sessionStorage` restauré au rechargement —
  sauf le consentement, jamais pré-coché (R15).
- Recommandations via `POST /v1/recommendations` : ≤ 5 cartes, ≤ 4 tags,
  URLs filtrées sur `https://(www.)studely.com`, score jamais affiché,
  mention disclaimer, état `empty` si tout est écarté.
- Erreurs §5.3 : réseau/timeout (20 s), 429 + verrou `Retry-After`,
  5xx, 400 avec `field` → retour à l'étape du champ, 403 → relance du défi
  Turnstile puis `reco.error.captcha` au second échec.
- Turnstile chargé uniquement à l'arrivée sur l'étape 5 (§9.1).
- 5 locales (fr, es, en, de, ar), arabe en `dir="rtl"`, libellés 100 %
  externes (`data-reco-labels`), repli fr + warn sur clé absente.
- Tracking §9.2 : événements `reco_*` dans `dataLayer` avec consentement
  « mesure d'audience », paramètres communs + `duration_ms`, aucune
  réponse du questionnaire trackée ; `CustomEvent('studely:reco')` par
  transition ; `goal` nettoyé des données personnelles avant envoi.
- Lazy init `IntersectionObserver` (marge 200 px), plusieurs widgets par
  page, `init()` idempotent, API `window.StudelyReco`.

### Qualité

- Mock MSW dev/CI (10 scénarios, 5 locales), hors bundle.
- 130+ tests Vitest dont intégration MSW par scénario ; couverture ≥ 90 %.
- E2E Playwright (chromium + mobile 360 px) + audits axe-core : zéro
  violation sérieuse/critique par état.
- Builds `.env.staging` / `.env.production`, bundle ~6 ko gzip (limite 25).
