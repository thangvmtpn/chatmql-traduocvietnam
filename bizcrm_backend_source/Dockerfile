# ─── BizCRM Backend — Production Dockerfile ────────────────────────────
# The app runs DIRECTLY from TypeScript source via tsx (no compile step), so
# tsx + prisma are runtime dependencies. Install in a separate `deps` stage so the
# yarn download cache (~1.3GB) is discarded — the runtime image carries only the
# pruned production node_modules (vitest/@vitest/rolldown/lightningcss left out).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production --ignore-scripts

# ─── Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4520

# Production node_modules only (no yarn cache, no dev/test tooling).
COPY --from=deps /app/node_modules ./node_modules
# App source + Prisma schema (host node_modules excluded via .dockerignore), then
# generate the Prisma client for this image.
COPY . .
RUN npx prisma generate

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:$PORT/health || exit 1

# Startup: create required extensions (vector/unaccent) → db push (schema-first;
# --accept-data-loss for non-interactive destructive ops, e.g. adding unique
# constraints) → start app via tsx. See docker-entrypoint.sh. ⚠️ db push auto-applies
# REAL destructive changes (column/table drops) — review schema diffs before deploy.
# ⚠️ Requires a pgvector-enabled Postgres image (pgvector/pgvector:pgNN), not stock postgres.
CMD ["sh", "docker-entrypoint.sh"]
