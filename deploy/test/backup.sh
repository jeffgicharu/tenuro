#!/bin/bash
# shellcheck disable=SC2016,SC2034  # t() evals its condition later, so the quotes and "unused" variables are deliberate
# Runs backup.sh and restore-test.sh against a private throwaway PostgreSQL cluster, using
# copies with only the binary path and backup folder changed.
#   deploy/test/backup.sh            (PGBIN defaults to /usr/lib/postgresql/16/bin)
set -uo pipefail
src=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../server" && pwd)
BIN=${PGBIN:-/usr/lib/postgresql/16/bin}
[[ -x $BIN/initdb ]] || { echo "no PostgreSQL binaries in $BIN (set PGBIN)" >&2; exit 1; }
S=$(mktemp -d)
cleanup() { "$BIN/pg_ctl" -D "$S/data" -m fast -w stop >/dev/null 2>&1; rm -rf -- "$S"; }
trap cleanup EXIT
mkdir -p "$S"/{data,backup,bin}
"$BIN/initdb" -D "$S/data" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$S/data" -o "-k '' -p 55432 -c listen_addresses=127.0.0.1" -l "$S/log" -w start >/dev/null \
  || { cat "$S/log"; exit 1; }
export PGHOST=127.0.0.1 PGPORT=55432
psql() { "$BIN/psql" -X -q -v ON_ERROR_STOP=1 "$@"; }

psql -U postgres -d postgres <<'SQL'
CREATE ROLE tenuro LOGIN; CREATE ROLE tenuro_app LOGIN;
CREATE DATABASE tenuro OWNER tenuro; CREATE DATABASE tenuro_restore_test OWNER tenuro;
SQL
# A small stand-in for what the migrations create: RLS enabled (never forced), a grant to the
# runtime role, ops_check, and the ops.verify_integrity() contract.
psql -U tenuro -d tenuro <<'SQL'
CREATE TABLE lease (id int PRIMARY KEY, tenant_id int NOT NULL, rent numeric NOT NULL);
ALTER TABLE lease ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lease TO tenuro_app USING (tenant_id = current_setting('tenuro.tenant')::int);
GRANT SELECT ON lease TO tenuro_app;
INSERT INTO lease SELECT g, g % 3, g * 100 FROM generate_series(1, 1000) g;
CREATE TABLE ops_check (id serial PRIMARY KEY, kind text, ok boolean, detail text, at timestamptz DEFAULT now());
CREATE SCHEMA ops;
CREATE FUNCTION ops.verify_integrity() RETURNS text LANGUAGE sql AS
  $$ SELECT CASE WHEN (SELECT count(*) FROM lease) = 1000 THEN 'ok' ELSE 'lease count mismatch' END $$;
SQL

python3 - "$src" "$S" "$BIN" <<'PY'
import sys
src, s, b = sys.argv[1:]
for name in ("backup.sh", "restore-test.sh"):
    t = open(f"{src}/usr/local/lib/tenuro/{name}").read()
    assert "/usr/lib/postgresql/16/bin" in t and "/var/lib/tenuro-backup" in t
    t = t.replace("/usr/lib/postgresql/16/bin", b).replace("/var/lib/tenuro-backup", f"{s}/backup")
    open(f"{s}/bin/{name}", "w").write(t)
PY
export PGUSER=tenuro PGDATABASE=tenuro
pass=0 fail=0
t() { if eval "$2"; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1"; fi; }
dumps() { find "$S/backup" -maxdepth 1 -name 'tenuro-*.dump' | wc -l; }

bash "$S/bin/backup.sh"; rc=$?
t "backup exits 0" '[ $rc = 0 ]'
t "one dump written" '[ "$(dumps)" = 1 ]'
t "no partial file left" '[ -z "$(find "$S/backup" -name ".tenuro-*")" ]'
t "dump is mode 600" '[ "$(stat -c %a "$S"/backup/tenuro-*.dump)" = 600 ]'
t "dump keeps the tenuro_app grant" '"$BIN/pg_restore" --list "$S"/backup/tenuro-*.dump | grep -q "ACL public TABLE lease"'

bash "$S/bin/restore-test.sh"; rc=$?
t "restore test exits 0" '[ $rc = 0 ]'
t "restored rows match" '[ "$(psql -At -d tenuro_restore_test -c "select count(*) from lease")" = 1000 ]'
t "success recorded" '[ "$(psql -At -c "select ok from ops_check order by id desc limit 1")" = t ]'

psql -c "DELETE FROM lease WHERE id > 990"
bash "$S/bin/backup.sh" >/dev/null
bash "$S/bin/restore-test.sh" >/dev/null 2>&1; rc=$?
t "integrity failure exits non-zero" '[ $rc != 0 ]'
t "failure recorded" '[ "$(psql -At -c "select ok from ops_check order by id desc limit 1")" = f ]'

for _ in $(seq 11); do sleep 1.05; bash "$S/bin/backup.sh" >/dev/null; done
t "rotation keeps 10 dumps" '[ "$(dumps)" = 10 ]'

latest=$(find "$S/backup" -maxdepth 1 -name 'tenuro-*.dump' -printf '%T@ %p\n' | sort -rn | head -n1 | cut -d' ' -f2-)
"$BIN/pg_restore" --clean --if-exists --no-owner --exit-on-error -d tenuro "$latest"; rc=$?
t "live-style restore exits 0" '[ $rc = 0 ]'
t "tenuro_app still reads through RLS after it" '[ "$(psql -U tenuro_app -At -c "set tenuro.tenant = 1; select count(*) > 0 from lease")" = t ]'

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" = 0 ]
