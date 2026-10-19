# @studely/widget

Widget de recommandation de parcours Studely, intégré au site Webflow.
Bundle TypeScript sans framework, sans style propre : le visuel et les
libellés vivent dans le composant Webflow `Reco / Widget`, le JS ne fait que
cloner, remplir et basculer les états via les attributs `data-reco-*`.

## Commandes

```bash
pnpm --filter @studely/widget dev            # page de dev (squelette §10.3) sur http://localhost:5173
pnpm --filter @studely/widget build          # dist/reco.js (IIFE)
pnpm --filter @studely/widget test
pnpm --filter @studely/widget test:coverage  # seuils : 90 % lignes/fonctions/instructions
```

## Variables de build

| Variable            | Rôle                                                       |
| ------------------- | ---------------------------------------------------------- |
| `VITE_RECO_API_URL` | URL HTTPS de l'API de recommandation, fixée dans le bundle |

- Dev : `.env.development` (versionné, URL publique de dev).
- Staging et production : fournie par l'environnement de build (Vercel, CI).
  Sans URL HTTPS valide, `pnpm build` échoue.

L'URL n'est jamais lue depuis la page (§7.4).

## Intégration Webflow

```html
<script defer src="https://scripts.studely.com/reco/v1/reco.js"></script>
```

Sur le conteneur :

| Attribut                | Obligatoire | Rôle                                               |
| ----------------------- | ----------- | -------------------------------------------------- |
| `data-reco-widget`      | Oui         | Marque le conteneur                                |
| `data-reco-origin`      | Oui         | Slug du pays d'origine (`mexique`), envoyé à l'API |
| `data-reco-advisor-url` | Oui         | Cible du bouton « Parler à un conseiller »         |
| `data-reco-locale`      | Non         | Locale si `<html lang>` est absent (repli `fr`)    |

Config invalide : le bloc reste sur son panel `fallback` et un
avertissement `[studely-reco]` est émis en console.

## API JS

- `window.StudelyReco.init(element)` — réinitialise un bloc.
- `window.StudelyReco.version` — version du bundle.

## Mock de l'API (dev local et CI)

L'API de recommandation est mockée par MSW, uniquement sur la page de dev —
`mock/` n'entre jamais dans `dist/reco.js`.

```bash
pnpm dev
# puis ouvrir http://localhost:5173/?recoMock=<scénario>
# ou : localStorage.setItem('recoMock', '<scénario>')
```

Scénarios (`?recoMock=`) : `nominal`, `empty`, `field-error` (400 avec
`field`), `forbidden` (403 CAPTCHA_FAILED), `rate` (429 + Retry-After 30 s),
`server` (500), `unavailable` (503), `timeout` (réponse jamais reçue,
timeout 20 s du widget), `bad-url` (URLs hors studely.com), `html-reason`
(HTML injecté dans `reason`). Les réponses sont fournies dans les 5 locales.

## Règles

- Données de l'API injectées via `textContent` uniquement : `innerHTML`,
  `outerHTML` et `insertAdjacentHTML` sont interdits par ESLint.
- Aucun texte en dur : les libellés viennent du bloc `[data-reco-labels]`.
- Bundle ≤ 25 ko gzip : `pnpm build` échoue au-delà (`scripts/check-size.mjs`,
  relançable seul avec `pnpm size`).
