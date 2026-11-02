#!/usr/bin/env bash
# Starts the API and the web dev server for this checkout on the given ports.
# Usage: scripts/dev.sh [api-port] [web-port]   (defaults 4000 and 5173)
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
api_port=${1:-4000}
web_port=${2:-5173}
env_file=${ENV_FILE:-$root/.env.local}
[ -f "$env_file" ] || env_file=/mnt/storage/Projects/Websites/Website-7/.env.local
(cd "$root/apps/web" && FORCE_NO_WATCHMAN=1 npx relay-compiler >/dev/null)
(cd "$root/apps/api" && PORT=$api_port PERSISTED_QUERIES="$root/apps/web/persisted-queries.json" \
  exec node --env-file="$env_file" --experimental-strip-types --no-warnings src/main.ts) &
api=$!
(cd "$root/apps/web" && API_PORT=$api_port WEB_PORT=$web_port exec npx vite --strictPort) &
web=$!
trap 'kill $api $web 2>/dev/null' EXIT INT TERM
wait
