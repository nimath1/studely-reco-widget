# @studely/widget

Widget de recommandation de parcours Studely, intégré au site Webflow.
Bundle TypeScript sans framework, sans style propre : le visuel et les
libellés vivent dans le composant Webflow `Reco / Widget`, le JS ne fait que
cloner, remplir et basculer les états via les attributs `data-reco-*`.

## Commandes

```bash
pnpm --filter @studely/widget dev               # page de dev (squelette §10.3) sur http://localhost:5173
pnpm --filter @studely/widget build:staging     # dist/reco.js pointant l'API de staging
pnpm --filter @studely/widget build:production  # dist/reco.js pointant l'API de production
pnpm --filter @studely/widget test              # unitaires + intégration MSW (Vitest)
pnpm --filter @studely/widget test:coverage     # seuils : 90 % lignes/fonctions/instructions
pnpm --filter @studely/widget test:e2e:install  # navigateurs Playwright (1re fois)
pnpm --filter @studely/widget test:e2e          # E2E réels sur dev server + mock + axe-core
pnpm --filter @studely/widget lint
```

## Variables de build

| Variable                  | Rôle                                                                |
| ------------------------- | ------------------------------------------------------------------- |
| `VITE_RECO_API_URL`       | URL HTTPS de l'API chatbot (`POST /chat` SSE), fixée dans le bundle |
| `VITE_TURNSTILE_SITE_KEY` | Site key Cloudflare Turnstile (publique, par environnement)         |

- Dev : `.env.development` (versionné, URL publique de dev).
- Staging : `.env.staging`, production : `.env.production` — valeurs
  publiques versionnées ; la site key reste vide et est injectée par
  Vercel/CI. Sans URL HTTPS valide, `pnpm build*` échoue.

L'URL de l'API n'est jamais lue depuis la page (§7.4). Aucun secret ne vit
dans le bundle : Turnstile protège l'API (§9.1).

## Intégration Webflow

```html
<script defer src="https://scripts.studely.com/reco/v1/reco.js"></script>
```

Le chargeur du site ne pose ce `<script>` que si `[data-reco-widget]` est
présent dans la page ; sinon, un `<script defer>` en footer suffit (le
bootstrap scanne le DOM à `DOMContentLoaded` et ne fait rien sans widget).

### Attributs du conteneur

| Attribut                | Obligatoire | Rôle                                               |
| ----------------------- | ----------- | -------------------------------------------------- |
| `data-reco-widget`      | Oui         | Marque le conteneur                                |
| `data-reco-origin`      | Oui         | Slug du pays d'origine (`mexique`), envoyé à l'API |
| `data-reco-advisor-url` | Oui         | Cible du bouton « Parler à un conseiller »         |
| `data-reco-locale`      | Non         | Locale si `<html lang>` est absent (repli `fr`)    |

**Q7 tranché** : `data-reco-origin` et `data-reco-advisor-url` sont posés
sur la `div` englobante qui porte `data-reco-widget` (les propriétés de
composant Webflow ne peuvent pas écrire d'attributs custom) — changer deux
attributs suffit pour poser le widget sur n'importe quelle page d'origine.

Config invalide : le bloc reste sur son panel `fallback` (CTA conseiller,
R12) et un avertissement `[studely-reco]` est émis en console.

### Contrat DOM (résumé §10.2/10.3)

- Panels `data-reco-panel` : `fallback`, `intro`, `steps`, `loading`,
  `results`, `empty`, `error` — un seul porte `is-reco-active` à la fois ;
  l'état courant est écrit dans `data-reco-state`.
- `form` natif avec `novalidate`, 5 `fieldset data-reco-step="1..5"` et
  leur `legend`. Aucune div cliquable : radios, cases, `select` natifs.
- Conteneurs `data-reco-options` : `level`, `fields`, `destinations`,
  `languages`, `budget`, `intake`.
- `textarea data-reco-input="goal"` (300 car.), case
  `data-reco-input="consent"`, bloc `data-reco-turnstile`, erreurs
  `data-reco-error-for`, hint `data-reco-hint="goal"`.
- Boutons `data-reco-action` : `start`, `next`, `back`, `submit`, `edit`,
  `restart`, `retry` ; lien `data-reco-action="advisor"` disponible partout.
- Templates `data-reco-template` : `reply` (bulle de réponse : champ
  `text` + zone `links` remplie de liens-citations),
  `option-radio`, `option-checkbox`, `option-language` ; bloc
  `data-reco-labels` (une entrée `data-reco-label` par clé i18n) ;
  `data-reco-results`, `data-reco-disclaimer`, `data-reco-error-message`,
  `data-reco-live`, `data-reco-progress`, `data-reco-progress-bar`.
- Templates et labels : visibles dans le Designer, masqués en ligne par le
  CSS `[data-reco-template], [data-reco-labels] { display: none }`.
- Le JS n'utilise aucune classe de style : nommage BEM `reco-*` libre pour
  Webflow ; RTL via la feuille `[data-reco-widget][dir="rtl"]`.

## API JS

- `window.StudelyReco.init(element)` — (ré)initialise un bloc.
- `window.StudelyReco.version` — version du bundle.

## Localisation

5 locales : `fr`, `es`, `en`, `de`, `ar` (arabe → `dir="rtl"` sur le
conteneur). Aucun texte en dur côté JS : chaque libellé vient du bloc
`[data-reco-labels]` traduit par Webflow Localization ; clé absente →
`console.warn` nommant la clé + repli sur `[data-reco-label-fr]` si présent.
Nombres et dates via `Intl` dans la locale active.

## RGPD, consentement, tracking

- La case consentement n'est **jamais** pré-cochée — pas même après
  rechargement du brouillon (R15) — et bloque l'envoi.
- Aucun appel API tant que la case n'est pas cochée ; ni nom, email,
  téléphone ni nationalité collectés. Le hint sous `goal` rappelle de ne
  pas saisir de données personnelles ; `goal` est nettoyé
  (`scrubPersonalData`) avant tout log/événement.
- Tracking (§9.2) : chaque transition `studely:reco` est relayée dans
  `window.dataLayer` en `reco_<name>` avec `reco_locale`, `reco_origin`,
  `reco_version` ; `duration_ms` (envoi → affichage) et `result_count` sur
  les états terminaux. Rien n'est poussé si la CMP refuse la mesure
  d'audience (`Cookiebot.consent.statistics === false`, R15) — sans CMP
  détectée, le relais n'est pas bloquant. Jamais de valeur de questionnaire
  dans les événements (R16).
- `CustomEvent('studely:reco', { detail: { name, from, to } })` est émis
  sur le conteneur à chaque transition, pour la page ou la CMP.
- Turnstile : script chargé uniquement à l'arrivée sur l'étape 5, défi rendu
  dans `data-reco-turnstile`, jeton en `X-Turnstile-Token`. Sur 403 : le
  défi est relancé une fois, puis `reco.error.captcha` au second échec.

## Mock de l'API (dev local et CI)

L'API de recommandation est mockée par MSW, uniquement hors bundle —
`mock/` n'entre jamais dans `dist/reco.js`.

Sans `?recoMock=`, la page de dev appelle le **vrai chatbot** : en dev
`VITE_RECO_API_URL` est vide, les appels `/chat` restent même-origine et
`server.proxy` (vite.config.ts) les relaie à `chatbot.dev.ml.studely.com` —
aucun CORS côté navigateur.

```bash
pnpm dev
# http://localhost:5173                  → vrai chatbot (via proxy)
# http://localhost:5173/?recoMock=<scénario>&lang=<fr|es|en|de|ar>
# ou : localStorage.setItem('recoMock', '<scénario>')
```

Scénarios (`?recoMock=`) : `nominal`, `empty`, `field-error` (400 avec
`field`), `forbidden` (403 CAPTCHA_FAILED), `rate` (429 + Retry-After 30 s),
`server` (500), `unavailable` (503), `timeout` (réponse jamais reçue,
timeout 20 s du widget), `bad-url` (URLs hors studely.com), `html-reason`
(HTML injecté dans `reason`). Les réponses sont fournies dans les 5 locales.

## Tests

- `pnpm test` : unitaires Vitest + intégration `src/index.msw.spec.ts` qui
  rejoue chaque scénario du mock via le serveur MSW node (`mock/node.ts`).
- `pnpm test:e2e` : Playwright sur la page de dev + mock — parcours nominal,
  consentement (R15), empty, 429, brouillon sans consentement, RTL arabe,
  mobile 360 px — et audits axe-core (zéro violation sérieuse/critique par
  état). `BASE_URL=https://<staging>` pour rejouer la suite hors mock.
- En CI, le job `e2e` tourne sur chromium ; la phase 2 (staging Webflow)
  réutilise ces specs avec `BASE_URL` et sans `?recoMock=`.

## Règles

- Données de l'API injectées via `textContent` uniquement : `innerHTML`,
  `outerHTML` et `insertAdjacentHTML` sont interdits par ESLint.
- Aucun texte en dur : les libellés viennent du bloc `[data-reco-labels]`.
- Bundle ≤ 25 ko gzip : `pnpm build*` échoue au-delà
  (`scripts/check-size.mjs`, relançable seul avec `pnpm size`).

## Limites connues

- Le widget est branché sur l'API chatbot déployée (`POST /chat`, SSE
  `delta`/`final`, `mode: "sav"` — seul mode accepté par le contrat actuel).
  Le backend répond aujourd'hui `out_of_scope` aux demandes de parcours :
  les recommandations structurées arriveront avec l'évolution serveur ;
  le widget affiche déjà le texte du bot et ses citations.
- Les options du questionnaire sont statiques (`src/api/options.ts`) : à
  resynchroniser si le catalogue produit évolue.
- La CMP reconnue est Cookiebot ; Didomi/Axeptio s'ajoutent dans
  `hasAnalyticsConsent` si le site les utilise.
- Les URL `.env.staging`/`.env.production` suivent le pattern de dev ;
  vérifier contre l'inventaire réel avant déploiement.
