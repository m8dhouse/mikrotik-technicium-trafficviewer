#!/usr/bin/env bash
# Starts the dashboard on http://127.0.0.1:${PORT:-3210}.
# Usage: ./start.sh          production build (fast, low memory)
#        ./start.sh --dev    development mode with live reload
# Env:   PORT=3100           use another port
#        NO_OPEN=1           do not open the browser
set -euo pipefail

cd "$(dirname "$0")"
PORT="${PORT:-3210}"
URL="http://127.0.0.1:${PORT}"
MODE="prod"
[[ "${1:-}" == "--dev" ]] && MODE="dev"

fail() { echo "✗ $*" >&2; exit 1; }
open_browser() { [[ -n "${NO_OPEN:-}" ]] || open "${URL}" 2>/dev/null || true; }

command -v node >/dev/null || fail "Node.js is not installed (version 22 recommended)."
[[ -f .env ]] || fail ".env is missing: copy .env.example to .env and fill it in."

if curl -fsS --max-time 3 "${URL}/api/snapshot" 2>/dev/null | grep -q '"success"'; then
  echo "✓ Dashboard already running at ${URL}"
  open_browser
  exit 0
fi

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "Port ${PORT} on 127.0.0.1 is used by another program. Try: PORT=3211 ./start.sh"
fi

if [[ ! -d node_modules || package-lock.json -nt node_modules ]]; then
  echo "→ Installing dependencies"
  npm ci --no-audit --no-fund
fi

GEO="data/geo/dbip-city-lite.mmdb"
CLOUD="data/geo/google-cloud.json"
if [[ ! -f "${GEO}" || ! -f "${CLOUD}" || -n "$(find "${GEO}" "${CLOUD}" -mtime +35 2>/dev/null)" ]]; then
  echo "→ Downloading IP location databases"
  npm run --silent geo:update || echo "! Geo download failed; continuing without fresh location data"
fi

(
  for _ in $(seq 1 60); do
    sleep 1
    if curl -fsS -o /dev/null --max-time 2 "${URL}/" 2>/dev/null; then
      echo "✓ Dashboard ready at ${URL}"
      open_browser
      exit 0
    fi
  done
) &

if [[ "${MODE}" == "dev" ]]; then
  exec npx next dev --hostname 127.0.0.1 --port "${PORT}"
fi

echo "→ Building"
npx next build
exec npx next start --hostname 127.0.0.1 --port "${PORT}"
