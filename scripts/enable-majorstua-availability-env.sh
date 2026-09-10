#!/usr/bin/env bash
# Update EC2 .env allow-lists: keep Kållered offer + enable all 8 Majorstua calendars.
# Usage (on EC2): bash scripts/enable-majorstua-availability-env.sh && pm2 restart ghl-api
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

LOC_IDS='YqUlz1ErFupeWjrXiiDJ,3hVPjaJpMLtF29L0zaBX'
CAL_IDS='M4fGB5ZSScHmQCMg7y1T,1Wji81CmUx0VmDAYSeAD,v13VJmzV87L2X0g48ycl,Lb3q4BnsHbyYy7zJBROl,BR5LpknCW9ENatACU9CO,D97Dz4eLRSnkaexG1JzR,3s30oeKlZN6hPd3MJp6E,NedrThKZq2oBK2LeY4Mp,oRBoMYo6YOdGTc23OVfK'

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    # portable in-place replace
    awk -v k="$key" -v v="$value" '
      BEGIN { done=0 }
      index($0, k "=")==1 { print k "=" v; done=1; next }
      { print }
      END { if (!done) print k "=" v }
    ' "$ENV_FILE" > "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

upsert_env 'SYNC_GHL_AVAILABILITY_SYNC_ENABLED' 'true'
upsert_env 'SYNC_GHL_AVAILABILITY_LOCATION_IDS' "$LOC_IDS"
upsert_env 'SYNC_GHL_AVAILABILITY_CALENDAR_IDS' "$CAL_IDS"

echo "Updated $ENV_FILE allow-lists (Kållered offer + Majorstua x8)."
grep -E '^SYNC_GHL_AVAILABILITY_(SYNC_ENABLED|LOCATION_IDS|CALENDAR_IDS)=' "$ENV_FILE"
