#!/bin/sh
set -e
cd /app

echo "Running migrations..."
npx tsx apps/api/src/db/migrate.ts

if [ "${RUN_SEED:-0}" = "1" ]; then
  echo "Seeding database (RUN_SEED=1)..."
  npx tsx apps/api/src/db/seed.ts
fi

if [ -n "${RENDER_EXTERNAL_URL}" ] && [ -z "${WEB_ORIGIN}" ]; then
  export WEB_ORIGIN="${RENDER_EXTERNAL_URL}"
fi

echo "Starting API on port ${PORT:-3001}..."
exec node apps/api/dist/index.js
