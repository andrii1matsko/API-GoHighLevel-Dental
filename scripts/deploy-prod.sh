#!/usr/bin/env bash
#
# Production deploy on EC2 (also used by GitHub Actions SSH step).
# Usage (on server): bash scripts/deploy-prod.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

echo "==> Repo: $APP_DIR"
echo "==> Branch before: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"

git fetch origin main
git checkout main
# Force-with-lease rewrites on origin leave EC2 unable to ff-only; hard reset is intentional for this deploy path.
if ! git pull --ff-only origin main; then
  echo "==> ff-only failed (diverged history) — resetting to origin/main"
  git reset --hard origin/main
fi

if command -v pnpm >/dev/null 2>&1; then
  PKG=pnpm
elif command -v npm >/dev/null 2>&1; then
  PKG=npm
else
  echo "Neither pnpm nor npm found" >&2
  exit 1
fi

echo "==> Install + migrate + build ($PKG)"
if [ "$PKG" = "pnpm" ]; then
  pnpm install --frozen-lockfile
  pnpm exec prisma generate
  pnpm exec prisma migrate deploy
  pnpm build
else
  # Repo ships pnpm-lock.yaml only; npm install is the fallback on servers without pnpm.
  npm install
  npx prisma generate
  npx prisma migrate deploy
  npm run build
fi

echo "==> Restart pm2 ghl-api"
pm2 restart ghl-api --update-env
pm2 save

echo "==> Health check"
sleep 3
curl -fsS http://127.0.0.1:3000/api/health
echo
echo "==> Deploy OK: $(git rev-parse --short HEAD)"
