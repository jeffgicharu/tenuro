#!/bin/bash
# Exercises tenuro-activate and tenuro-retire against a temporary tree with stubbed
# systemctl, systemd-run, nginx, curl, chown and logger, and an mv that can simulate a hostile
# upload user. flock, rsync, find, chmod and sha256sum are the real ones.
#   deploy/test/run.sh
set -uo pipefail

HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$HERE/../server/usr/local/sbin/tenuro-activate
RETIRE=$HERE/../server/usr/local/sbin/tenuro-retire
ORIG_PATH=$PATH
PASS=0 FAIL=0 T=''

sha() { printf '%040d' "$1"; }

setup() {
  [[ -n $T ]] && { chmod -R u+rwX -- "$T" 2>/dev/null; rm -rf -- "$T"; }
  T=$(mktemp -d)
  mkdir -p "$T"/base/{releases,slots,incoming,state,assets,fallback,staging}
  chmod 0700 "$T/base/state" "$T/base/staging"
  # shellcheck disable=SC2016  # nginx variables are literal text
  printf 'set $tenuro_slot blue;\nset $tenuro_port 9000;\n' >"$T/active-slot.conf"
  : >"$T/calls.log"
  unset STUB_FAIL_IDLE_HEALTH STUB_FAIL_NGINX_T STUB_FAIL_NGINX_CHECK STUB_FAIL_MIGRATE STUB_FAIL_SMOKE \
        STUB_FAIL_RESTART STUB_FAIL_RELOAD STUB_SIGNAL_ON_RELOAD STUB_RACE_SYMLINK \
        TENURO_TEST_OWNER_USER TENURO_TEST_OWNER_GROUP TENURO_TEST_DETACH INVOCATION_ID
  export TENURO_ACTIVATE_TEST=1 TENURO_TEST_BASE=$T/base TENURO_TEST_SNIPPET=$T/active-slot.conf \
         STUB_LOG=$T/calls.log PATH="$HERE/stubs:$ORIG_PATH"
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
mode() { stat -c %a -- "$1"; }

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
ok "staging left empty" test "$(count "$T/base/staging")" -eq 0
ok "migrations ran on blue" has "$T/calls.log" "systemctl start tenuro-migrate@blue.service"
ok "blue restarted" has "$T/calls.log" "systemctl restart tenuro@blue.service"
ok "journeys ran on blue" has "$T/calls.log" "systemctl start tenuro-smoke@blue.service"
ok "ownership fixed without following links" has "$T/calls.log" "chown -hR"
ok "one nginx reload" test "$(grep -c 'systemctl reload nginx' "$T/calls.log")" -eq 1
ok "blue enabled for boot" has "$T/calls.log" "systemctl enable --quiet tenuro@blue.service"
ok "nothing disabled or retired on first run" lacks "$T/calls.log" "disable"
ok "nothing to retire on first run" lacks "$T/calls.log" "systemd-run"
ok "node is 0750" test "$(mode "$T/base/releases/$S1/runtime/bin/node")" = 750
ok "public files are world-readable" test "$(mode "$T/base/releases/$S1/public/assets/app-${S1: -8}.js")" = 644
ok "public folders are world-listable" test "$(mode "$T/base/releases/$S1/public/assets")" = 755
ok "server files are not" test "$(mode "$T/base/releases/$S1/server/index.mjs")" = 640
ok "server folder is not" test "$(mode "$T/base/releases/$S1/server")" = 750
ok "asset in shared pool" test -f "$T/base/assets/app-${S1: -8}.js"
ok "no leftover snippet backup" test ! -e "$T/active-slot.conf.prev"

echo "second activation goes to green, shares node, hands boot over, retires blue later"
S2=$(sha 2)
deploy "$S2"; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "state is green" state_is green
ok "snippet names green" slot_is green 9001
ok "green enabled for boot" has "$T/calls.log" "systemctl enable --quiet tenuro@green.service"
ok "blue disabled for boot" has "$T/calls.log" "systemctl disable --quiet tenuro@blue.service"
ok "blue not stopped yet" lacks "$T/calls.log" "systemctl stop tenuro@blue.service"
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
echo "retire stops and disables only the slot that isn't active"
: >"$T/calls.log"
printf 'green\n' >"$T/base/state/active"
bash "$RETIRE" >"$T/out.log" 2>&1; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "stops blue" has "$T/calls.log" "systemctl stop tenuro@blue.service"
ok "disables blue" has "$T/calls.log" "systemctl disable --quiet tenuro@blue.service"
ok "never touches green" lacks "$T/calls.log" "tenuro@green"
: >"$T/calls.log"
rm -f "$T/base/state/active"
bash "$RETIRE" >"$T/out.log" 2>&1; rc=$?
ok "with no state it exits 0" test "$rc" -eq 0
ok "and stops nothing" lacks "$T/calls.log" "stop"

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
activate --run "$(sha 1)"; rc=$?
ok "refuses --run outside the transient unit" test "$rc" -ne 0
ok "explains" has "$T/out.log" "only used inside the transient activation unit"

echo "a missing upload is refused"
activate "$(sha 9)"; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "no upload found"

echo "an upload folder that is itself a symlink is refused"
mkdir -p "$T/decoy"; ln -s "$T/decoy" "$T/base/incoming/$(sha 8)"
activate "$(sha 8)"; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "no upload found"

echo "an upload swapped for a symlink during the move never gets chown/chmod"
setup
S=$(sha 4); upload "$S"
mkdir -p "$T/decoy/sub"; printf 'x' >"$T/decoy/sub/file"; chmod 0777 "$T/decoy" "$T/decoy/sub"; chmod 0666 "$T/decoy/sub/file"
export STUB_RACE_SYMLINK=$T/decoy
activate "$S"; rc=$?
unset STUB_RACE_SYMLINK
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "was not a real folder"
ok "decoy folder modes untouched" test "$(mode "$T/decoy")" = 777 -a "$(mode "$T/decoy/sub")" = 777
ok "decoy file mode untouched" test "$(mode "$T/decoy/sub/file")" = 666
ok "decoy still there" test -f "$T/decoy/sub/file"
ok "no chown attempted" lacks "$T/calls.log" "chown"
ok "staging left empty" test "$(count "$T/base/staging")" -eq 0
ok "no release created" test ! -e "$T/base/releases/$S"

echo "a symlink in the upload is rejected"
setup
S=$(sha 4); upload "$S"; ln -s /etc/passwd "$T/base/incoming/$S/public/passwd"
activate "$S"; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "upload rejected: symlink, hardlink, special file or wrong owner"
ok "no release created" test ! -e "$T/base/releases/$S"
ok "staging left empty" test "$(count "$T/base/staging")" -eq 0
ok "never started a slot" lacks "$T/calls.log" "tenuro@"
ok "/etc/passwd untouched" test "$(mode /etc/passwd)" = 644

echo "a hardlinked file in the upload is rejected"
setup
S=$(sha 5); upload "$S"; ln "$T/base/incoming/$S/server/index.mjs" "$T/base/incoming/$S/public/index.mjs"
activate "$S"; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "upload rejected: symlink, hardlink, special file or wrong owner"
ok "no release created" test ! -e "$T/base/releases/$S"

echo "a special file in the upload is rejected"
setup
S=$(sha 6); upload "$S"; mkfifo "$T/base/incoming/$S/public/pipe"
activate "$S"; rc=$?
ok "exits non-zero" test "$rc" -ne 0
ok "no release created" test ! -e "$T/base/releases/$S"

echo "files not owned by the expected owner are rejected"
setup
S=$(sha 7); upload "$S"
export TENURO_TEST_OWNER_USER=root
activate "$S"; rc=$?
unset TENURO_TEST_OWNER_USER
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "wrong owner"
ok "no release created" test ! -e "$T/base/releases/$S"

echo "loose upload modes are tightened top-down before inspection"
setup
S=$(sha 11); upload "$S"
chmod 0777 "$T/base/incoming/$S" "$T/base/incoming/$S/server"; chmod 0666 "$T/base/incoming/$S/server/index.mjs"
activate "$S"; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "release root is 0751" test "$(mode "$T/base/releases/$S")" = 751
ok "server folder is 0750" test "$(mode "$T/base/releases/$S/server")" = 750
ok "server file is 0640" test "$(mode "$T/base/releases/$S/server/index.mjs")" = 640

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
chmod u+w "$T/base/releases/$S1/runtime/bin/node"
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
ok "boot setup untouched" lacks "$T/calls.log" "enable"

echo "the idle slot fails to restart: no switch"
export STUB_FAIL_RESTART=1
activate "$S2"; rc=$?
unset STUB_FAIL_RESTART
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "tenuro@green failed to start"
ok "green stopped" has "$T/calls.log" "systemctl stop tenuro@green.service"
ok "nginx never reloaded" lacks "$T/calls.log" "systemctl reload nginx"
ok "state still blue" state_is blue

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
ok "boot setup untouched" lacks "$T/calls.log" "enable"

echo "the reload itself fails after the snippet swap: the trap rolls back"
export STUB_FAIL_RELOAD=1
activate "$S2"; rc=$?
unset STUB_FAIL_RELOAD
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "interrupted after the switch; restoring nginx to blue"
ok "snippet restored" cmp -s "$T/snippet.before" "$T/active-slot.conf"
ok "no backup left" test ! -e "$T/active-slot.conf.prev"
ok "green stopped" has "$T/calls.log" "systemctl stop tenuro@green.service"
ok "state still blue" state_is blue

for sig in TERM HUP INT; do
  echo "SIG$sig between the swap and the commit: the trap rolls back"
  rm -f "$T/calls.log.signalled"
  export STUB_SIGNAL_ON_RELOAD=$sig
  activate "$S2"; rc=$?
  unset STUB_SIGNAL_ON_RELOAD
  ok "exits non-zero" test "$rc" -ne 0
  ok "snippet restored" cmp -s "$T/snippet.before" "$T/active-slot.conf"
  ok "green stopped" has "$T/calls.log" "systemctl stop tenuro@green.service"
  ok "state still blue" state_is blue
  ok "never enabled green" lacks "$T/calls.log" "enable --quiet tenuro@green"
done

echo "and a clean retry afterwards succeeds"
activate "$S2"; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "state green" state_is green
ok "snippet green" slot_is green 9001

echo "a run killed outright left nginx on the wrong slot: the next run restores it first"
# Simulate SIGKILL after the swap: nginx names blue, state still says green.
# shellcheck disable=SC2016  # nginx variables are literal text
printf 'set $tenuro_slot blue;\nset $tenuro_port 9000;\n' >"$T/active-slot.conf"
cp "$T/active-slot.conf" "$T/active-slot.conf.prev"
S3=$(sha 3); upload "$S3"
export STUB_FAIL_IDLE_HEALTH=1   # make this run fail later, so we see the reconcile on its own
activate "$S3"; rc=$?
unset STUB_FAIL_IDLE_HEALTH
ok "reconciled before anything else" has "$T/out.log" "nginx names 'blue' but the active slot is green; restoring"
ok "active slot started" has "$T/calls.log" "systemctl start tenuro@green.service"
ok "snippet back on green" slot_is green 9001
ok "stale backup removed" test ! -e "$T/active-slot.conf.prev"
ok "state still green" state_is green

# ----------------------------------------------------------------------------------------
echo "detached mode runs the work as a transient unit and relays its log and status"
setup
export TENURO_TEST_DETACH=1
S1=$(sha 1); upload "$S1"
activate "$S1"; rc=$?
ok "exits 0" test "$rc" -eq 0
ok "ran through systemd-run --wait" has "$T/calls.log" "systemd-run --quiet --wait --collect --unit=tenuro-activate-${S1:0:12}"
ok "printed the unit's log" has "$T/out.log" "OK $S1 blue"
ok "kept the log in state/" test -s "$T/base/state/activate-$S1.log"
ok "state is blue" state_is blue
S2=$(sha 2); upload "$S2"
export STUB_FAIL_SMOKE=1
activate "$S2"; rc=$?
unset STUB_FAIL_SMOKE
ok "a failing run's status comes back" test "$rc" -ne 0
ok "and its log" has "$T/out.log" "journey checks failed on green"
unset TENURO_TEST_DETACH

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
exec 8<"$T/base/state"; flock -n 8
activate "$(sha 1)"; rc=$?
exec 8<&-
ok "exits non-zero" test "$rc" -ne 0
ok "explains" has "$T/out.log" "another activation is running"
ok "upload untouched" test -d "$T/base/incoming/$(sha 1)"

echo "test mode needs the explicit flag"
setup
unset TENURO_ACTIVATE_TEST
upload "$(sha 1)"
activate "$(sha 1)"; rc=$?
ok "without the flag it uses the real paths and refuses a non-root caller" test "$rc" -ne 0
ok "explains" has "$T/out.log" "must run as root"
ok "and never touched the test tree" test -d "$T/base/incoming/$(sha 1)"
ok "and never called systemd-run or systemctl" test ! -s "$T/calls.log"

chmod -R u+rwX -- "$T" 2>/dev/null; rm -rf -- "$T"
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
((FAIL == 0))
