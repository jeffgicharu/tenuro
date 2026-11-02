#!/usr/bin/env bash
# Signs in to a listed account against a running dev API and runs one query.
# Usage: scripts/dev-smoke.sh <tenant-slug> <ROLE> '<graphql query>'
set -euo pipefail
API=${API:-http://localhost:4000}
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT
gql() { curl -s -b "$JAR" -c "$JAR" "$API/graphql" -H 'content-type: application/json' -H 'x-tenuro-client: web' -d "$1"; }
id=$(gql '{"query":"{ signInAccounts { id role tenant { slug } } }"}' | python3 -c "
import sys, json, base64
d = json.load(sys.stdin)['data']['signInAccounts']
m = [a for a in d if a['role'] == sys.argv[2] and a['tenant']['slug'] == sys.argv[1]][0]
print(base64.b64decode(m['id']).decode().split(':', 1)[1])" "$1" "$2")
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -c "$JAR" -X POST "$API/api/session" \
  -H 'content-type: application/json' -H 'x-tenuro-client: web' -d "{\"accountId\":\"$id\"}")
echo "sign-in: $code" >&2
gql "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$3")"
