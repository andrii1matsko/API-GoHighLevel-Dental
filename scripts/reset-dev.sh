#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   🔄  Opus Dental – Dev Database Reset    ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# ── Guard: only allow on local/dev DATABASE_URL ──────────────────────────
DB_URL="${DATABASE_URL:-$(grep -E '^DATABASE_URL=' .env.local 2>/dev/null | cut -d= -f2- || grep -E '^DATABASE_URL=' .env 2>/dev/null | cut -d= -f2- || echo '')}"

if [ -z "$DB_URL" ]; then
  echo "❌  DATABASE_URL is not set. Aborting."
  exit 1
fi

if echo "$DB_URL" | grep -qiE '(production|prod\.)'; then
  echo "❌  Refusing to reset a production database."
  echo "    DATABASE_URL contains 'production' or 'prod.'"
  exit 1
fi

echo "📍  Database: $DB_URL"
echo ""

# ── Step 1: Ensure Postgres is running ───────────────────────────────────
if command -v docker &>/dev/null; then
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q opus_dental_postgres; then
    echo "🐳  Starting Postgres container..."
    docker compose up -d postgres
    echo "    Waiting for healthcheck..."
    sleep 3
  else
    echo "🐳  Postgres container already running"
  fi
fi

# ── Step 2: Drop all tables (prisma migrate reset --force) ───────────────
echo ""
echo "🗑️   Resetting database (drop all tables + re-migrate)..."
npx prisma migrate reset --force --skip-seed

# ── Step 3: Generate Prisma client ───────────────────────────────────────
echo ""
echo "⚙️   Generating Prisma client..."
npx prisma generate

# ── Step 4: Seed ─────────────────────────────────────────────────────────
echo ""
echo "🌱  Running seed script..."
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   ✅  Database reset & seeded!            ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "  Default credentials:"
echo "    admin@dentalclinic.se         / password123"
echo "    anna.andersson@dentalclinic.se / password123"
echo "    erik.hansen@dentalclinic.no    / password123"
echo ""
