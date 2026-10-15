# Studely Reco

Monorepo **pnpm + Turborepo** du widget de recommandation de parcours
Studely : widget front intégré à Webflow et API de recommandation.

> Socle repris d'un projet existant (API NestJS, moteur assistant/retrieval,
> outillage). Le moteur lit encore le catalogue via Directus et son prompt
> cible l'ancien catalogue : son adaptation au catalogue Studely reste à
> faire (cahier des charges, point Q1).

---

## Lancement rapide

Node 22+ requis.

```bash
cp .env.example .env
pnpm install
pnpm dev
```

| App           | URL                   | Rôle                                                |
| ------------- | --------------------- | --------------------------------------------------- |
| `apps/widget` | http://localhost:5173 | Widget (page de dev reprenant le squelette Webflow) |
| `apps/api`    | http://localhost:3001 | API NestJS (`/health`, `/docs`)                     |

Stack locale complète (Postgres, Redis, MinIO, Directus, API) :

```bash
docker compose up --build
```

---

## Structure du monorepo

```
apps/
  widget/         Bundle reco.js (Vite, IIFE, sans framework) — voir son README
  api/            NestJS — assistant (LLM), retrieval (BM25 + embeddings),
                  catalogue, rate limiting Redis
packages/
  types/          Types TypeScript partagés (@studely/types)
directus/         Schéma et seed Directus (source actuelle du catalogue)
```

---

## Scripts (racine, via Turborepo)

| Script               | Effet                               |
| -------------------- | ----------------------------------- |
| `pnpm dev`           | Démarre widget + api en watch       |
| `pnpm build`         | Build tous les apps/packages        |
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
