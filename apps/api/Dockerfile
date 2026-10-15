# ─── API NestJS — build multi-stage ───────────────────────────
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --filter @studely/api... --frozen-lockfile
COPY packages/types packages/types
COPY apps/api apps/api
RUN pnpm --filter @studely/api build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/test/fixtures ./test/fixtures
COPY --from=build /app/apps/api/test/fixtures ./dist/test/fixtures
COPY --from=build /app/apps/api/package.json ./package.json

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/src/main.js"]
