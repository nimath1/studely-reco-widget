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

## Règles

- Données de l'API injectées via `textContent` uniquement : `innerHTML`,
  `outerHTML` et `insertAdjacentHTML` sont interdits par ESLint.
- Aucun texte en dur : les libellés viennent du bloc `[data-reco-labels]`.
- Bundle ≤ 25 ko gzip : `pnpm build` échoue au-delà (`scripts/check-size.mjs`,
  relançable seul avec `pnpm size`).
