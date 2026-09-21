#!/usr/bin/env bash
# Prepare a web session so tests and linters can actually run.
#
# Idempotent and quiet on the happy path: installs dependencies if they are
# missing, brings up Postgres, and applies migrations. Never seeds over an
# existing catalogue.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 0

log() { printf '  %s\n' "$*"; }

if [ ! -d node_modules ]; then
  log "Installing dependencies…"
  pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  log "Created .env from .env.example"
fi

# Start Postgres if this image ships one and it is not already up.
if ! pg_isready -q 2>/dev/null; then
  if command -v pg_ctlcluster >/dev/null 2>&1; then
    pg_ctlcluster 16 main start >/dev/null 2>&1
    for _ in $(seq 1 15); do pg_isready -q 2>/dev/null && break; sleep 1; done
  fi
fi

if pg_isready -q 2>/dev/null; then
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='postgres'\"" >/dev/null 2>&1 \
    && su postgres -c "psql -c \\\"ALTER USER postgres PASSWORD 'postgres';\\\"" >/dev/null 2>&1
  for database in jewels_dev jewels_test; do
    su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${database}'\"" 2>/dev/null \
      | grep -q 1 || su postgres -c "createdb ${database}" >/dev/null 2>&1
  done

  pnpm exec prisma generate >/dev/null 2>&1
  pnpm exec prisma migrate deploy >/dev/null 2>&1 && log "Database ready (migrations applied)"

  if [ "$(pnpm exec prisma db execute --stdin <<< 'SELECT 1' 2>/dev/null; echo $?)" = "0" ]; then :; fi
else
  log "Postgres unavailable — unit tests will still run; integration tests will not."
fi

log "Aurelia ready. pnpm dev · pnpm check · pnpm test:e2e"
exit 0
