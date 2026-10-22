# Studely Reco

Monorepo **pnpm + Turborepo** du widget de recommandation de parcours
Studely, intégré à Webflow. Le moteur de recommandation est une API
externe, hors de ce dépôt (cahier des charges, §2).

---

## Lancement rapide

Node 22+ requis.

```bash
cp .env.example .env
pnpm install
pnpm dev
```

| App               | URL                   | Rôle                                                |
| ----------------- | --------------------- | --------------------------------------------------- |
| `packages/widget` | http://localhost:5173 | Widget (page de dev reprenant le squelette Webflow) |

---

## Structure du monorepo

```
packages/
  widget/         Bundle reco.js (Vite, IIFE, sans framework) — voir son README
```

Le front Vue de référence (`reference/front-assistant`) a été retiré : la
logique est portée en TypeScript natif dans `packages/widget` (cahier des
charges : bundle sans framework, ≤ 25 ko gzip, templates Webflow).

---

## Scripts (racine, via Turborepo)

| Script               | Effet                               |
| -------------------- | ----------------------------------- |
| `pnpm dev`           | Démarre le widget en watch          |
| `pnpm build`         | Build tous les packages             |
| `pnpm lint`          | ESLint sur tout le monorepo         |
| `pnpm format`        | Prettier `--write` sur tout le repo |
| `pnpm test`          | Tests unitaires Vitest              |
| `pnpm test:coverage` | Tests unitaires + couverture v8     |

---

## Conventions

- **Commits** — [Conventional Commits](https://www.conventionalcommits.org/),
  vérifiés localement par commitlint + husky (`commit-msg`).
- **Branches** — `{feat,fix,chore}/{ticket-id}-{slug}`, base `main`.
- **PR** — le template `.github/pull_request_template.md` s'applique
  automatiquement. `CODEOWNERS` route la revue.
- **TypeScript strict** partout (`tsconfig.base.json`).

---

## Déploiement Vercel (page de référence + CDN reco.js)

`vercel.json` à la racine publie `packages/widget/dist-site` : la page de
référence (`index.html` buildé par `vite.site.config.ts`) et le bundle
`reco.js` servi aux pages Webflow.

- **Projet Vercel** : racine `.` (repo root), Node 22+, framework `null`,
  build `pnpm --filter @studely/widget build:vercel` (script racine
  `pnpm build:vercel` identique), install `pnpm install --frozen-lockfile`,
  sortie `packages/widget/dist-site`.
- **Variables d'environnement de build** (publiques, pas des secrets) :
  `VITE_RECO_API_URL` — HTTPS, validée au build (`assertApiUrl`), à faire
  vérifier par le owner de l'API — et `VITE_TURNSTILE_SITE_KEY`. Elles sont
  dans `turbo.json` (`env` du build widget) pour éviter un cache périmé.
- **Chemins du bundle** : `reco/<semver>/reco.js` est **immuable**
  (`Cache-Control: max-age=31536000, immutable`) — une version publiée
  n'est jamais réutilisée ni régénérée ; incrémenter `package.json`
  à chaque release. `reco/v1/reco.js` est l'alias réévalué
  (`max-age=0, must-revalidate`) posé par les pages Webflow. Aucun
  rewrite n'invente de version inconnue ; un retour arrière se fait par
  rollback de déploiement Vercel (les déploiements précédents sont
  conservés), pas en réécrivant `v1`.
- **CORS** : le site appelle l'API en direct — le backend doit autoriser
  les origines des domaines Vercel (production, previews `*.vercel.app`
  et domaine custom) **et** des pages Webflow qui chargent `reco.js`, y
  compris les en-têtes `X-Request-Id` et `X-Turnstile-Token`.
- Le lien conseiller de la page de référence (`/mexique#contact`) est un
  placeholder : remplacer par l'URL absolue de contact en production.
- Voir `AUDIT.md` pour les blocants restants (contrat backend, catalogue,
  URL légale, localisation Webflow, env de production).

---

## CI

- **Lint + tests + build** sur chaque push et PR (`.github/workflows/ci.yml`).
- **SonarQube** après un push sur `main` : requiert le secret `SONAR_TOKEN`
  et la variable de dépôt `SONAR_HOST_URL`.
