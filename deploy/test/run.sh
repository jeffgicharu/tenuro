#!/bin/bash
# Exercises tenuro-activate against a temporary tree with stubbed systemctl, nginx, curl,
# chown, logger and systemd-run. flock, rsync, find and sha256sum are the real ones.
#   deploy/test/run.sh
set -uo pipefail

HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$HERE/../server/usr/local/sbin/tenuro-activate
ORIG_PATH=$PATH
PASS=0 FAIL=0 T=

sha() { printf '%040d' "$1"; }

setup() {
  [[ -n $T ]] && rm -rf -- "$T"
  T=$(mktemp -d)
  mkdir -p "$T"/base/{releases,slots,incoming,state,assets,fallback}
  # shellcheck disable=SC2016  # nginx variables are literal text
  printf 'set $tenuro_slot blue;\nset $tenuro_port 9000;\n' >"$T/active-slot.conf"
  : >"$T/calls.log"
  unset STUB_FAIL_IDLE_HEALTH STUB_FAIL_NGINX_T STUB_FAIL_NGINX_CHECK STUB_FAIL_MIGRATE STUB_FAIL_SMOKE
  export TENURO_ACTIVATE_TEST=1 TENURO_TEST_BASE=$T/base TENURO_TEST_SNIPPET=$T/active-slot.conf \
         TENURO_TEST_LOCK=$T/lock STUB_LOG=$T/calls.log PATH="$HERE/stubs:$ORIG_PATH"
}

upload() { # $1 sha, $2 node binary contents
  local d=$T/base/incoming/$1
  mkdir -p "$d"/{runtime/bin,server,public/assets,ops}
  printf '%s\n' "$1" >"$d/REVISION"
  printf '%s' "${2:-node-binary-v22.23.4}" >"$d/runtime/bin/node"
  sha256sum "$d/runtime/bin/node" | cut -d' ' -f1 >"$d/runtime/SHA256"
  for f in index migrate smoke rebuild; do printf '// %s\n' "$f" >"$d/server/$f.mjs"; done
  printf 'console.log(1)\n' >"$d/public/assets/app-${1: -8}.js"
  printf '{"id":"smoke"}\n' >"$d/ops/smoke-query.json"
}

activate() { : >"$T/calls.log"; bash "$SCRIPT" "$@" >"$T/out.log" 2>&1; }
deploy() { upload "$1" "${2:-}"; activate "$1"; }

ok() { # $1 description, then a command that must succeed
  local desc=$1
  shift
  if "$@"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL: %s\n' "$desc"
    printf '  output:\n'; while IFS= read -r l; do printf '    %s\n' "$l"; done <"$T/out.log"
  fi
}
has() { grep -qF -- "$2" "$1"; }
lacks() { ! grep -qF -- "$2" "$1"; }
slot_is() { grep -qx "set \$tenuro_slot $1;" "$T/active-slot.conf" && grep -qx "set \$tenuro_port $2;" "$T/active-slot.conf"; }
state_is() { [[ $(cat "$T/base/state/active" 2>/dev/null) == "$1" ]]; }
inode() { stat -c %i -- "$1"; }
count() { find "$1" -mindepth 1 -maxdepth 1 | wc -l; }

# ----------------------------------------------------------------------------------------
echo "first activation goes to blue"
setup
S1=$(sha 1)
deploy "$S1"; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "state is blue" state_is blue
ok "snippet names blue" slot_is blue 9000
ok "current points at the release" test "$(readlink -f "$T/base/current")" = "$T/base/releases/$S1"
ok "upload consumed" test ! -e "$T/base/incoming/$S1"
ok "migrations ran on blue" has "$T/calls.log" "systemctl start tenuro-migrate@blue.service"
ok "blue restarted" has "$T/calls.log" "systemctl restart tenuro@blue.service"
ok "journeys ran on blue" has "$T/calls.log" "systemctl start tenuro-smoke@blue.service"
ok "ownership fixed without following links" has "$T/calls.log" "chown -hR root:tenuro --"
ok "one nginx reload" test "$(grep -c 'systemctl reload nginx' "$T/calls.log")" -eq 1
ok "nothing to retire on first run" lacks "$T/calls.log" "systemd-run"
ok "node is 0750" test "$(stat -c %a "$T/base/releases/$S1/runtime/bin/node")" = 750
ok "public is world-readable" test "$(stat -c %a "$T/base/releases/$S1/public/assets/app-${S1: -8}.js")" = 644
ok "server files are not" test "$(stat -c %a "$T/base/releases/$S1/server/index.mjs")" = 640
ok "asset in shared pool" test -f "$T/base/assets/app-${S1: -8}.js"
ok "no leftover snippet backup" test ! -e "$T/active-slot.conf.prev"

echo "second activation goes to green, shares node, retires blue later"
S2=$(sha 2)
deploy "$S2"; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "state is green" state_is green
ok "snippet names green" slot_is green 9001
ok "old slot retired later" has "$T/calls.log" "systemd-run --quiet --collect --on-active=120"
ok "node hardlinked to the previous release" test "$(inode "$T/base/releases/$S2/runtime/bin/node")" = "$(inode "$T/base/releases/$S1/runtime/bin/node")"

echo "a different node binary is not shared"
S3=$(sha 3)
deploy "$S3" "node-binary-v22.23.5"; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "separate inode" test "$(inode "$T/base/releases/$S3/runtime/bin/node")" != "$(inode "$T/base/releases/$S2/runtime/bin/node")"

echo "re-activating a kept release (rollback)"
activate "$S2"; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "says it reused the release" has "$T/out.log" "reusing kept release $S2"
ok "state flipped to green" state_is green

# ----------------------------------------------------------------------------------------
echo "bad shas are refused"
setup
for bad in "ABC" "$(sha 1 | cut -c1-39)" "$(sha 1)0" "$(printf '%040d' 0 | tr 0 G)" "../../etc" ""; do
  activate "$bad"; rc=$?
  ok "refuses '$bad'" test "$rc" -ne 0
  ok "nothing touched for '$bad'" test "$(count "$T/base/releases")" -eq 0
done
activate; rc=$?
ok "refuses no argument" test "$rc" -ne 0
activate "$(sha 1)" "$(sha 2)"; rc=$?
ok "refuses two arguments" test "$rc" -ne 0

echo "a missing upload is refused"
activate "$(sha 9)"; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "no upload found"

echo "a symlink in the upload is rejected"
setup
S=$(sha 4); upload "$S"; ln -s /etc/passwd "$T/base/incoming/$S/public/passwd"
activate "$S"; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "upload rejected: symlink, hardlink or special file"
ok "no release created" test ! -e "$T/base/releases/$S"
ok "no temp left behind" test "$(count "$T/base/releases")" -eq 0
ok "never started a slot" lacks "$T/calls.log" "tenuro@"

echo "a hardlinked file in the upload is rejected"
setup
S=$(sha 5); upload "$S"; ln "$T/base/incoming/$S/server/index.mjs" "$T/base/incoming/$S/public/index.mjs"
activate "$S"; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "upload rejected: symlink, hardlink or special file"
ok "no release created" test ! -e "$T/base/releases/$S"

echo "a special file in the upload is rejected"
setup
S=$(sha 6); upload "$S"; mkfifo "$T/base/incoming/$S/public/pipe"
activate "$S"; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "no release created" test ! -e "$T/base/releases/$S"

echo "node that doesn't match runtime/SHA256 is rejected"
setup
S=$(sha 7); upload "$S"; printf 'tampered' >"$T/base/incoming/$S/runtime/bin/node"
activate "$S"; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "runtime/bin/node does not match runtime/SHA256"
ok "no release created" test ! -e "$T/base/releases/$S"

echo "a previous release whose node no longer matches its checksum is never linked"
setup
S1=$(sha 1); deploy "$S1"
printf 'tampered-after-freeze' >"$T/base/releases/$S1/runtime/bin/node"
S2=$(sha 2); deploy "$S2"; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "not linked to the tampered file" test "$(inode "$T/base/releases/$S2/runtime/bin/node")" != "$(inode "$T/base/releases/$S1/runtime/bin/node")"
ok "own node intact" test "$(sha256sum "$T/base/releases/$S2/runtime/bin/node" | cut -d' ' -f1)" = "$(cat "$T/base/releases/$S2/runtime/SHA256")"

echo "a release with a wrong REVISION or a missing file is rejected"
setup
S=$(sha 8); upload "$S"; printf '%s\n' "$(sha 9)" >"$T/base/incoming/$S/REVISION"
activate "$S"; rc=$?
ok "wrong REVISION refused" test "$rc" -ne 0
ok "explains" has "$T/out.log" "REVISION does not match"
S=$(sha 10); upload "$S"; rm "$T/base/incoming/$S/server/smoke.mjs"
activate "$S"; rc=$?
ok "missing smoke.mjs refused" test "$rc" -ne 0
ok "explains" has "$T/out.log" "missing server/smoke.mjs"

# ----------------------------------------------------------------------------------------
echo "idle slot never healthy: no switch"
setup
S1=$(sha 1); deploy "$S1"
cp "$T/active-slot.conf" "$T/snippet.before"
S2=$(sha 2); upload "$S2"
export STUB_FAIL_IDLE_HEALTH=1
activate "$S2"; rc=$?
unset STUB_FAIL_IDLE_HEALTH
ok "exits non-zero" test "$rc" -ne 0
ok "state still blue" state_is blue
ok "snippet unchanged" cmp -s "$T/snippet.before" "$T/active-slot.conf"
ok "green stopped" has "$T/calls.log" "systemctl stop tenuro@green.service"
ok "nginx never reloaded" lacks "$T/calls.log" "systemctl reload nginx"

echo "journey checks fail: no switch"
export STUB_FAIL_SMOKE=1
activate "$S2"; rc=$?
unset STUB_FAIL_SMOKE
ok "exits non-zero" test "$rc" -ne 0
ok "state still blue" state_is blue
ok "nginx never reloaded" lacks "$T/calls.log" "systemctl reload nginx"

echo "migrations fail: no switch"
export STUB_FAIL_MIGRATE=1
activate "$S2"; rc=$?
unset STUB_FAIL_MIGRATE
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "migrations failed"
ok "green never started" lacks "$T/calls.log" "systemctl restart tenuro@green.service"

echo "nginx -t fails: snippet restored, no reload"
export STUB_FAIL_NGINX_T=1
activate "$S2"; rc=$?
unset STUB_FAIL_NGINX_T
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "nginx -t failed; nothing was switched"
ok "snippet byte-identical" cmp -s "$T/snippet.before" "$T/active-slot.conf"
ok "no backup left" test ! -e "$T/active-slot.conf.prev"
ok "nginx never reloaded" lacks "$T/calls.log" "systemctl reload nginx"
ok "state still blue" state_is blue

echo "checks through nginx fail: rolled back"
export STUB_FAIL_NGINX_CHECK=1
activate "$S2"; rc=$?
unset STUB_FAIL_NGINX_CHECK
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "rolled back to blue"
ok "snippet restored" cmp -s "$T/snippet.before" "$T/active-slot.conf"
ok "reloaded twice (switch, rollback)" test "$(grep -c 'systemctl reload nginx' "$T/calls.log")" -eq 2
ok "green stopped" has "$T/calls.log" "systemctl stop tenuro@green.service"
ok "state still blue" state_is blue
ok "current still blue's release" test "$(readlink -f "$T/base/current")" = "$T/base/releases/$S1"

echo "and a clean retry afterwards succeeds"
activate "$S2"; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "state green" state_is green

# ----------------------------------------------------------------------------------------
echo "keeps 3 releases and prunes the asset pool to match"
setup
for i in 1 2 3 4 5; do deploy "$(sha "$i")" || true; done
ok "three releases kept" test "$(count "$T/base/releases")" -eq 3
for i in 3 4 5; do ok "kept $(sha "$i" | cut -c37-)" test -d "$T/base/releases/$(sha "$i")"; done
for i in 1 2; do ok "pruned $(sha "$i" | cut -c37-)" test ! -e "$T/base/releases/$(sha "$i")"; done
ok "pool holds three assets" test "$(count "$T/base/assets")" -eq 3
ok "pruned assets gone" test ! -e "$T/base/assets/app-$(sha 1 | cut -c33-).js"
ok "both slots still resolve" test -d "$(readlink -f "$T/base/slots/blue")" -a -d "$(readlink -f "$T/base/slots/green")"

echo "an old release a slot still points at is never pruned"
setup
deploy "$(sha 1)"
deploy "$(sha 2)"
activate "$(sha 1)"   # back to sha 1, now on blue again
for i in 3 4 5; do deploy "$(sha "$i")" || true; done
for s in blue green; do ok "slot $s target exists" test -d "$(readlink -f "$T/base/slots/$s")"; done

# ----------------------------------------------------------------------------------------
echo "a second activation while one holds the lock is refused"
setup
upload "$(sha 1)"
exec 8>"$T/lock"; flock -n 8
activate "$(sha 1)"; rc=$?
exec 8>&-
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "another activation is running"
ok "upload untouched" test -d "$T/base/incoming/$(sha 1)"

echo "test mode needs the explicit flag"
setup
unset TENURO_ACTIVATE_TEST
upload "$(sha 1)"
had_lock=0; [[ -e /run/lock/tenuro-activate.lock ]] && had_lock=1
activate "$(sha 1)"; rc=$?
((had_lock)) || rm -f /run/lock/tenuro-activate.lock 2>/dev/null
ok "without the flag it uses the real paths and fails here" test "$rc" -ne 0
ok "and never touched the test tree" test -d "$T/base/incoming/$(sha 1)"

rm -rf -- "$T"
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
((FAIL == 0))
