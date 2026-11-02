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
ok "tenuro-boot runs at boot" has tenuro-boot.service WantedBy=multi-user.target
ok "tenuro-boot runs only once there is a state" has tenuro-boot.service ConditionPathExists=/srv/tenuro/state/active
ok "tenuro-boot comes after nginx and postgres" grep -q '^After=.*postgresql.service.*nginx.service' "$U/tenuro-boot.service"

S=tenuro-incoming-sweep.service
for line in User=tenuro-ci NoNewPrivileges=yes ProtectSystem=strict ProtectHome=yes PrivateTmp=yes PrivateDevices=yes \
            ProtectProc=invisible CapabilityBoundingSet= IPAddressDeny=any IPAddressAllow=localhost MemorySwapMax=0 \
            MemoryDenyWriteExecute=yes RestrictAddressFamilies=AF_UNIX BindPaths=/srv/tenuro/incoming \
            'TemporaryFileSystem=/var:ro /srv:ro /opt:ro /mnt:ro /media:ro'; do
  ok "$S has $line" has "$S" "$line"
done
ok "sweep runs hourly" has tenuro-incoming-sweep.timer OnCalendar=hourly

# The sweep's own command, pointed at a temp folder: entries older than 6 hours go, newer stay.
d=$(mktemp -d)
mkdir -p "$d/incoming/old/sub" "$d/incoming/new"
printf x >"$d/incoming/old/sub/f"; printf x >"$d/incoming/new/f"
touch -d '7 hours ago' "$d/incoming/old"
touch -d '5 hours ago' "$d/incoming/new"
cmd=$(grep '^ExecStart=' "$U/$S"); cmd=${cmd#ExecStart=}; cmd=${cmd//\/srv\/tenuro\/incoming/$d/incoming}
eval "$cmd"
ok "sweep removes an upload older than 6 hours" test ! -e "$d/incoming/old"
ok "sweep keeps an upload younger than 6 hours" test -f "$d/incoming/new/f"
rm -rf -- "$d"
ok "tenuro@ runs the bundled Node" grep -q '^ExecStart=/srv/tenuro/slots/%i/runtime/bin/node ' "$U/tenuro@.service"

# systemd-analyze verify: the only acceptable complaint is the missing executable, since
# /srv/tenuro doesn't exist on a test machine.
if command -v systemd-analyze >/dev/null; then
  d=$(mktemp -d)
  cp "$U"/tenuro* "$d/"
  for u in tenuro@blue.service tenuro-migrate@blue.service tenuro-smoke@blue.service tenuro-reset.service \
           tenuro-backup.service tenuro-restore-test.service tenuro-reset.timer tenuro-backup.timer tenuro-restore-test.timer \
           tenuro-boot.service tenuro-incoming-sweep.service tenuro-incoming-sweep.timer; do
    out=$(systemd-analyze verify --man=no "$d/$u" 2>&1 | grep -F "${u%%@*}" | grep -v "is not executable: No such file or directory")
    ok "systemd-analyze verify $u${out:+: $out}" test -z "$out"
  done
  score=$(systemd-analyze security --offline=yes "$d/tenuro@blue.service" 2>/dev/null | grep -Eo 'exposure level for tenuro@blue.service: [0-9.]+' | grep -Eo '[0-9.]+$')
  echo "     tenuro@ exposure score: ${score:-unknown}"
  ok "tenuro@ exposure score at most 2.0" awk -v s="${score:-99}" 'BEGIN { exit !(s <= 2.0) }'
  rm -rf -- "$d"
fi

for u in "${NODE_UNITS[@]}" "${BASH_UNITS[@]}"; do
  ok "$u hides /var, /srv, /opt, /mnt and /media" has "$u" 'TemporaryFileSystem=/var:ro /srv:ro /opt:ro /mnt:ro /media:ro'
  ok "$u hides other services' config" has "$u" 'InaccessiblePaths=-/etc/nginx -/etc/letsencrypt -/etc/ssl/private -/etc/ssl/cloudflare'
done
for u in "${NODE_UNITS[@]}"; do
  ok "$u sees /srv/tenuro read-only" has "$u" 'BindReadOnlyPaths=/srv/tenuro'
done
ok "tenuro@ gets its own state folder back" has tenuro@.service 'BindPaths=/var/lib/tenuro-%i'
ok "tenuro-migrate@ gets its state folder back" has tenuro-migrate@.service 'BindPaths=/var/lib/tenuro-jobs'
ok "tenuro-reset gets its state folder back" has tenuro-reset.service 'BindPaths=/var/lib/tenuro-jobs'
ok "backup gets its folder back" has tenuro-backup.service 'BindPaths=/var/lib/tenuro-backup'
ok "restore test gets its folder back" has tenuro-restore-test.service 'BindPaths=/var/lib/tenuro-backup'

# Node under the app unit's own filesystem and sandbox settings, where a user systemd instance
# allows it. A stand-in release is bound at /srv/tenuro and a state folder at
# /var/lib/tenuro-blue, exactly where the unit binds the real ones. The probe must read its
# release, write its state, reach a TCP port on 127.0.0.1 (as it reaches PostgreSQL), and fail
# to read world-readable files that belong to the rest of the box.
if command -v node >/dev/null && command -v python3 >/dev/null &&
   systemd-run --user --quiet --wait --collect -p PrivateUsers=yes true 2>/dev/null; then
  T=$(mktemp -d)
  SHA=0123456789abcdef0123456789abcdef01234567
  R=$T/srv-tenuro/releases/$SHA
  mkdir -p "$R/server" "$R/runtime/bin" "$T/srv-tenuro/slots" "$T/state"
  : >"$R/runtime/bin/node"   # mount point for the real node binary
  ln -s "/srv/tenuro/releases/$SHA" "$T/srv-tenuro/slots/blue"
  printf 'release-file\n' >"$R/server/marker.txt"
  cat >"$R/server/probe.mjs" <<'EOF'
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
const out = {};
const can = (f) => { try { f(); return true; } catch { return false; } };
out.release = can(() => fs.readFileSync("server/marker.txt", "utf8") === "release-file\n");
out.stateWrite = can(() => fs.writeFileSync("/var/lib/tenuro-blue/probe", "x"));
out.denied = Object.fromEntries(JSON.parse(process.env.PROBE_DENY).map((p) => [p, !can(() => fs.readFileSync(p))]));
out.cpus = os.cpus().length;
out.mem = can(() => os.totalmem()) ? os.totalmem() : -1;
out.ifaces = can(() => os.networkInterfaces()) ? Object.keys(os.networkInterfaces()).length : -1;
const s = net.connect(Number(process.env.PROBE_PORT), "127.0.0.1");
s.setTimeout(3000, () => { out.tcp = false; console.log(JSON.stringify(out)); process.exit(0); });
s.on("error", () => { out.tcp = false; console.log(JSON.stringify(out)); });
s.on("connect", () => s.write("ping"));
s.on("data", (d) => { out.tcp = d.toString() === "pong"; s.end(); console.log(JSON.stringify(out)); });
EOF

  # Stand-ins for other sites' files: world-readable, readable outside the sandbox.
  deny=()
  for f in /var/lib/dpkg/status /etc/nginx/nginx.conf /etc/nginx/mime.types \
           $(find /srv /opt /var/www -maxdepth 3 -type f -perm -o+r 2>/dev/null | head -n 2); do
    [[ -r $f ]] && deny+=("$f")
  done
  deny_json=$(printf '%s\n' "${deny[@]}" | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')

  # A loopback TCP service standing in for PostgreSQL on 127.0.0.1.
  python3 - "$T/port" <<'PY' &
import socket, sys
s = socket.socket(); s.bind(("127.0.0.1", 0)); s.listen(1)
open(sys.argv[1], "w").write(str(s.getsockname()[1]))
c, _ = s.accept(); c.recv(4); c.sendall(b"pong"); c.close()
PY
  lpid=$!
  for _ in $(seq 50); do [[ -s $T/port ]] && break; sleep 0.1; done

  props=(-p PrivateUsers=yes -p WorkingDirectory=/srv/tenuro/slots/blue
         -p "BindReadOnlyPaths=$(command -v node):/srv/tenuro/releases/$SHA/runtime/bin/node"
         -E "PROBE_DENY=$deny_json" -E "PROBE_PORT=$(cat "$T/port")")
  while IFS= read -r line; do
    key=${line%%=*} val=${line#*=}
    case $key in
      BindReadOnlyPaths) props+=(-p "BindReadOnlyPaths=${val/\/srv\/tenuro/$T/srv-tenuro:/srv/tenuro}") ;;
      BindPaths) props+=(-p "BindPaths=$T/state:${val//%i/blue}") ;;
      TemporaryFileSystem | InaccessiblePaths | ProtectSystem | ProtectHome | PrivateTmp | ProtectProc | \
      RestrictAddressFamilies | SystemCallFilter | SystemCallArchitectures | MemoryDenyWriteExecute | \
      NoNewPrivileges | LockPersonality | RestrictRealtime | RestrictSUIDSGID | RestrictNamespaces | UMask)
        props+=(-p "$line") ;;
    esac
  done < <(grep -E '^[A-Za-z]+=' "$U/tenuro@.service")

  # systemd-run looks the program up on the host, so start it through sh to resolve the path
  # inside the sandbox, as systemd does for the real unit.
  json=$(systemd-run --user --quiet --wait --pipe --collect "${props[@]}" -- \
           /bin/sh -c 'exec /srv/tenuro/slots/blue/runtime/bin/node server/probe.mjs' 2>&1 | tail -n 1)
  kill "$lpid" 2>/dev/null
  echo "     node under tenuro@ sandbox: $json"
  q() { python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(eval(sys.argv[2]))" "$json" "$1" 2>/dev/null; }
  ok "Node starts and reads its release at /srv/tenuro" test "$(q 'd["release"]')" = True
  ok "Node writes its own state folder" test "$(q 'd["stateWrite"]')" = True
  ok "Node reaches a TCP service on 127.0.0.1 (as it reaches PostgreSQL)" test "$(q 'd["tcp"]')" = True
  ok "at least two stand-in files to try" test "${#deny[@]}" -ge 2
  for f in "${deny[@]}"; do
    ok "Node can't read $f (world-readable outside the sandbox)" test "$(q "d['denied']['$f']")" = True
  done
  ok "os.cpus() is not empty" test "$(q 'd["cpus"]')" -gt 0
  ok "os.totalmem() works" test "$(q 'd["mem"]')" -gt 0
  ok "os.networkInterfaces() works" test "$(q 'd["ifaces"]')" -ge 0
  rm -rf -- "$T"
else
  echo "     (no user systemd instance: sandboxed Node probe skipped)"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
((fail == 0))
