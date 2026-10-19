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

## CI

- **Lint + tests + build** sur chaque push et PR (`.github/workflows/ci.yml`).
- **SonarQube** après un push sur `main` : requiert le secret `SONAR_TOKEN`
  et la variable de dépôt `SONAR_HOST_URL`.
