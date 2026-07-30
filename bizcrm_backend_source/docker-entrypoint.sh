#!/bin/sh
set -e

# Ensure required Postgres extensions exist BEFORE schema push.
# - `vector` (pgvector): needed for the embedding columns (vector(1536)). Requires a
#   pgvector-enabled Postgres image (e.g. pgvector/pgvector:pg16) — stock postgres has NO
#   `vector` type, so CREATE EXTENSION will fail there.
# - `unaccent`: Vietnamese diacritics-free search (ships with stock postgres contrib).
# Idempotent (IF NOT EXISTS) — safe on every start, fresh or existing DB.
echo "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS unaccent;" \
  | npx prisma db execute --schema prisma/schema.prisma --stdin

# Apply schema (schema-first; --accept-data-loss for non-interactive destructive ops).
npx prisma db push --skip-generate --accept-data-loss

exec npx tsx src/app.ts
