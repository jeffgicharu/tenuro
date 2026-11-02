#!/bin/bash
# Checks the systemd units: the hardening every unit must carry, the Node-specific settings,
# systemd-analyze verify, and (when a user systemd instance is available) that Node's os
# module works under the app unit's own sandbox settings.
#   deploy/test/units.sh
set -uo pipefail
U=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../server/etc/systemd/system" && pwd)
pass=0 fail=0
ok() { local d=$1; shift; if "$@"; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL $d"; fi; }
has() { grep -qx -- "$2" "$U/$1"; }
lacks() { ! grep -q -- "$2" "$U/$1"; }

NODE_UNITS=(tenuro@.service tenuro-migrate@.service tenuro-smoke@.service tenuro-reset.service)
BASH_UNITS=(tenuro-backup.service tenuro-restore-test.service)

for u in "${NODE_UNITS[@]}" "${BASH_UNITS[@]}"; do
  for line in NoNewPrivileges=yes ProtectSystem=strict ProtectHome=yes PrivateTmp=yes PrivateDevices=yes \
              ProtectProc=invisible CapabilityBoundingSet= AmbientCapabilities= IPAddressDeny=any \
              IPAddressAllow=localhost MemorySwapMax=0 RestrictNamespaces=yes RestrictSUIDSGID=yes \
              LockPersonality=yes SystemCallArchitectures=native 'SystemCallFilter=~@privileged'; do
    ok "$u has $line" has "$u" "$line"
  done
  ok "$u has MemoryMax" grep -qE '^MemoryMax=[0-9]+M$' "$U/$u"
  ok "$u writes only to its StateDirectory (no ReadWritePaths)" lacks "$u" '^ReadWritePaths='
done
for u in "${NODE_UNITS[@]}"; do
  ok "$u turns off MemoryDenyWriteExecute for V8" has "$u" MemoryDenyWriteExecute=no
  ok "$u has no ProcSubset (it hides /proc/cpuinfo and /proc/meminfo from Node)" lacks "$u" '^ProcSubset='
  ok "$u allows AF_NETLINK for os.networkInterfaces()" has "$u" 'RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK'
done
for u in "${BASH_UNITS[@]}"; do
  ok "$u keeps MemoryDenyWriteExecute on" has "$u" MemoryDenyWriteExecute=yes
  ok "$u has no netlink" has "$u" 'RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX'
done
for line in Nice=10 IOSchedulingClass=idle CPUQuota=50%; do
  ok "tenuro-reset has $line" has tenuro-reset.service "$line"
done
ok "tenuro@ can be enabled for boot" has tenuro@.service WantedBy=multi-user.target
ok "tenuro@ runs the bundled Node" grep -q '^ExecStart=/srv/tenuro/slots/%i/runtime/bin/node ' "$U/tenuro@.service"

# systemd-analyze verify: the only acceptable complaint is the missing executable, since
# /srv/tenuro doesn't exist on a test machine.
if command -v systemd-analyze >/dev/null; then
  d=$(mktemp -d)
  cp "$U"/tenuro* "$d/"
  for u in tenuro@blue.service tenuro-migrate@blue.service tenuro-smoke@blue.service tenuro-reset.service \
           tenuro-backup.service tenuro-restore-test.service tenuro-reset.timer tenuro-backup.timer tenuro-restore-test.timer; do
    out=$(systemd-analyze verify --man=no "$d/$u" 2>&1 | grep -F "${u%%@*}" | grep -v "is not executable: No such file or directory")
    ok "systemd-analyze verify $u${out:+: $out}" test -z "$out"
  done
  score=$(systemd-analyze security --offline=yes "$d/tenuro@blue.service" 2>/dev/null | grep -Eo 'exposure level for tenuro@blue.service: [0-9.]+' | grep -Eo '[0-9.]+$')
  echo "     tenuro@ exposure score: ${score:-unknown}"
  ok "tenuro@ exposure score at most 2.0" awk -v s="${score:-99}" 'BEGIN { exit !(s <= 2.0) }'
  rm -rf -- "$d"
fi

# Node under the app unit's own sandbox settings, where a user systemd instance allows it.
if command -v node >/dev/null && systemd-run --user --quiet --wait --collect true 2>/dev/null; then
  props=(-p PrivateUsers=yes)
  while IFS= read -r line; do
    case ${line%%=*} in
      ProtectProc | ProcSubset | RestrictAddressFamilies | SystemCallFilter | SystemCallArchitectures | \
      MemoryDenyWriteExecute | NoNewPrivileges | LockPersonality | RestrictRealtime | RestrictSUIDSGID)
        props+=(-p "$line") ;;
    esac
  done < <(grep -E '^[A-Za-z]+=' "$U/tenuro@.service")
  probe='const os=require("os"); let n; try { n=Object.keys(os.networkInterfaces()).length } catch (e) { n=-1 }
         let m; try { m=os.totalmem() } catch (e) { m=-1 }
         console.log(os.cpus().length + " " + m + " " + n)'
  read -r cpus mem ifaces < <(systemd-run --user --quiet --wait --pipe --collect "${props[@]}" -- "$(command -v node)" -e "$probe" 2>/dev/null)
  echo "     node under tenuro@ sandbox: cpus=${cpus:-?} totalmem=${mem:-?} interfaces=${ifaces:-?}"
  ok "os.cpus() is not empty under the unit's sandbox" test "${cpus:-0}" -gt 0
  ok "os.totalmem() works under the unit's sandbox" test "${mem:-0}" -gt 0
  ok "os.networkInterfaces() works under the unit's sandbox" test "${ifaces:--1}" -ge 0
else
  echo "     (no user systemd instance: sandboxed Node probe skipped)"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
((fail == 0))
