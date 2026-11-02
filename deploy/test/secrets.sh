#!/bin/bash
# Exercises gen-secrets with a stub runuser standing in for psql. On failure the stub echoes
# the SQL it was given to stderr, as psql does with a failing statement, so the test can prove
# no password ever reaches the terminal.
#   deploy/test/secrets.sh
set -uo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$HERE/../server/usr/local/lib/tenuro/gen-secrets
T=$(mktemp -d)
trap 'rm -rf -- "$T"' EXIT
mkdir -p "$T/bin"
cat >"$T/bin/runuser" <<'EOF'
#!/bin/bash
sql=$(cat)
printf '%s\n' "$sql" >"$STUB_SQL"
if [[ ${STUB_PSQL_FAIL:-} == 1 ]]; then
  printf 'ERROR:  role "tenuro_app" does not exist\nSTATEMENT:  %s\n' "$sql" >&2
  exit 3
fi
exit 0
EOF
cat >"$T/bin/chown" <<'EOF'
#!/bin/bash
printf 'chown %s\n' "$*" >>"$STUB_LOG"
EOF
chmod +x "$T/bin/runuser" "$T/bin/chown"
export PATH="$T/bin:$PATH" TENURO_SECRETS_TEST=1 STUB_SQL=$T/sql STUB_LOG=$T/calls

pass=0 fail=0
ok() { local d=$1; shift; if "$@"; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL $d"; fi; }
fresh() { rm -rf -- "$T/shared"; mkdir -p "$T/shared"; export TENURO_TEST_SHARED=$T/shared; : >"$T/calls"; }
no_secret_in() { ! grep -Eq '[0-9a-f]{64}' "$1"; }

echo "success"
fresh
bash "$SCRIPT" >"$T/out" 2>&1; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "no secret value printed" no_secret_in "$T/out"
ok "variable names printed" grep -q "PGPASSWORD SESSION_SECRET SANDBOX_SECRET ICS_FEED_SECRET" "$T/out"
ok "first SQL line turns statement logging off" test "$(awk 'NR == 1' "$T/sql")" = "SET log_statement = 'none';"
ok "second SQL line keeps failing statements out of the log" test "$(awk 'NR == 2' "$T/sql")" = "SET log_min_error_statement = panic;"
ok "app.env is 0640" test "$(stat -c %a "$T/shared/app.env")" = 640
ok "ops.env is 0640" test "$(stat -c %a "$T/shared/ops.env")" = 640
ok "app.env goes to group tenuro" grep -q "^chown root:tenuro $T/shared/app.env" "$T/calls"
ok "ops.env goes to group tenuro-ops" grep -q "^chown root:tenuro-ops $T/shared/ops.env" "$T/calls"
app_pw=$(grep '^PGPASSWORD=' "$T/shared/app.env" | cut -d= -f2)
ops_pw=$(grep '^PGPASSWORD=' "$T/shared/ops.env" | cut -d= -f2)
ok "passwords are 64 hex characters" test "${#app_pw}" -eq 64 -a "${#ops_pw}" -eq 64
ok "the two roles get different passwords" test "$app_pw" != "$ops_pw"
ok "the SQL sets exactly those passwords" grep -q "tenuro_app PASSWORD '$app_pw'" "$T/sql"
ok "app.env uses the runtime role" grep -qx "PGUSER=tenuro_app" "$T/shared/app.env"
ok "ops.env uses the owner role" grep -qx "PGUSER=tenuro" "$T/shared/ops.env"
ok "no temp files left" test "$(find "$T/shared" -type f | wc -l)" -eq 2

echo "refuses to overwrite"
bash "$SCRIPT" >"$T/out" 2>&1; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "explains" grep -q "refusing to overwrite" "$T/out"
ok "files unchanged" grep -q "PGPASSWORD=$app_pw" "$T/shared/app.env"

echo "psql fails: nothing leaks and nothing is written"
fresh
STUB_PSQL_FAIL=1 bash "$SCRIPT" >"$T/out" 2>&1; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "fixed message printed" grep -q "psql's output is withheld" "$T/out"
ok "no password in the output" no_secret_in "$T/out"
ok "no ALTER ROLE echoed" bash -c "! grep -q 'ALTER ROLE' '$T/out'"
ok "no env files written" test "$(find "$T/shared" -type f | wc -l)" -eq 0

echo "test mode needs the flag"
fresh
TENURO_SECRETS_TEST='' bash "$SCRIPT" >"$T/out" 2>&1; rc=$?
ok "refuses a non-root caller" test "$rc" -ne 0
ok "explains" grep -q "run as root" "$T/out"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
((fail == 0))
