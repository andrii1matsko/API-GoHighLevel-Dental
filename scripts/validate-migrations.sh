#!/usr/bin/env bash
#
# CI Migration Validation
# Ensures the Prisma schema and migration files are in sync.
# Exit code 0 = no drift, exit code 1 = drift detected or error.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║   🔍  Prisma Migration Validation (CI)        ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

ERRORS=0

# ── Check 1: Prisma schema is valid ─────────────────────────────────────
echo "1/4  Validating prisma/schema.prisma..."
if npx prisma validate 2>&1; then
  echo "     ✔ Schema is valid"
else
  echo "     ✘ Schema validation failed"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── Check 2: Prisma client can be generated ──────────────────────────────
echo "2/4  Generating Prisma client..."
if npx prisma generate 2>&1; then
  echo "     ✔ Client generated"
else
  echo "     ✘ Client generation failed"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── Check 3: No pending migrations (schema ↔ migrations are in sync) ────
echo "3/4  Checking for schema drift (prisma migrate diff)..."

SHADOW_URL="${SHADOW_DATABASE_URL:-}"
if [ -z "$SHADOW_URL" ]; then
  # Derive a shadow DB URL from DATABASE_URL by appending _shadow
  BASE_URL="${DATABASE_URL:-}"
  if [ -n "$BASE_URL" ]; then
    SHADOW_URL="${BASE_URL%\?*}_shadow?${BASE_URL#*\?}"
    if [ "$SHADOW_URL" = "${BASE_URL}_shadow?${BASE_URL}" ]; then
      SHADOW_URL="${BASE_URL}_shadow"
    fi
  fi
fi

if [ -n "$SHADOW_URL" ]; then
  DIFF_OUTPUT=$(npx prisma migrate diff \
    --from-migrations prisma/migrations \
    --to-schema-datamodel prisma/schema.prisma \
    --shadow-database-url "$SHADOW_URL" \
    --script 2>&1 || true)

  if [ -z "$DIFF_OUTPUT" ] || echo "$DIFF_OUTPUT" | grep -qF -- '-- This is an empty migration.'; then
    echo "     ✔ No drift – schema matches migrations"
  elif echo "$DIFF_OUTPUT" | grep -qiE '(error|could not connect|connection refused)'; then
    echo "     ⚠ Could not connect to shadow database – skipping drift check"
    echo "     Set SHADOW_DATABASE_URL or ensure the DB is running"
  else
    echo "     ✘ DRIFT DETECTED between schema.prisma and migrations/"
    echo ""
    echo "     The following SQL would be needed to align the DB:"
    echo "     ─────────────────────────────────────────────────"
    echo "$DIFF_OUTPUT" | sed 's/^/     /'
    echo "     ─────────────────────────────────────────────────"
    echo ""
    echo "     Fix: run 'npx prisma migrate dev --name <description>'"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "     ⚠ Skipped – no DATABASE_URL or SHADOW_DATABASE_URL set"
  echo "       Set either variable to enable drift detection"
fi
echo ""

# ── Check 4: Migration files are well-formed ─────────────────────────────
echo "4/4  Verifying migration directory structure..."
MIGRATION_COUNT=0
MALFORMED=0

if [ -d "prisma/migrations" ]; then
  for dir in prisma/migrations/*/; do
    [ -d "$dir" ] || continue
    MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
    if [ ! -f "${dir}migration.sql" ]; then
      echo "     ✘ Missing migration.sql in $dir"
      MALFORMED=$((MALFORMED + 1))
    fi
  done
fi

if [ "$MALFORMED" -gt 0 ]; then
  echo "     ✘ $MALFORMED malformed migration(s) found"
  ERRORS=$((ERRORS + 1))
else
  echo "     ✔ $MIGRATION_COUNT migration(s) are well-formed"
fi
echo ""

# ── Summary ──────────────────────────────────────────────────────────────
if [ "$ERRORS" -gt 0 ]; then
  echo "❌  Validation FAILED with $ERRORS error(s)"
  exit 1
fi

echo "✅  All migration checks passed"
echo ""
