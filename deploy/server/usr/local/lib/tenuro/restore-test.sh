#!/bin/bash
# Restores the newest dump into tenuro_restore_test, checks it, and records the result in
# ops_check in the live database. Runs as tenuro-backup with owner credentials from ops.env.
set -euo pipefail
umask 077

readonly PGBIN=/usr/lib/postgresql/16/bin
readonly DIR=/var/lib/tenuro-backup
readonly TARGET=tenuro_restore_test

record() { # $1 ok (true|false), $2 detail
  "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -v ok="$1" -v detail="$2" <<'SQL'
INSERT INTO ops_check (kind, ok, detail) VALUES ('restore_test', :ok, :'detail');
SQL
}

latest=$(find "$DIR" -maxdepth 1 -name 'tenuro-*.dump' -printf '%T@ %p\n' | sort -rn | head -n1 | cut -d' ' -f2-)
if [ -z "$latest" ]; then
  echo "no dump to test" >&2
  exit 1
fi
name=$(basename "$latest")
trap 'record false "$name failed at line $LINENO" || true' ERR

start=$(date +%s)
"$PGBIN/pg_restore" --clean --if-exists --no-owner --no-privileges --exit-on-error \
  --dbname="$TARGET" "$latest"
result=$("$PGBIN/psql" -X -A -t -v ON_ERROR_STOP=1 --dbname="$TARGET" -c 'SELECT ops.verify_integrity()')
if [ "$result" != "ok" ]; then
  record false "$name: verify_integrity returned: ${result:0:200}"
  echo "restore test failed: $result" >&2
  exit 1
fi
secs=$(( $(date +%s) - start ))
trap - ERR
record true "$name restored and verified in ${secs}s"
echo "restore test ok: $name in ${secs}s"
