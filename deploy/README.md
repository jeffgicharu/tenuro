# Tenuro server install guide

Everything Tenuro needs on the shared host (Ubuntu 22.04). It runs as two app
slots behind nginx, with nightly jobs for the data rebuild, backups and a weekly restore
test. The files under `deploy/server/` mirror their target paths. `deploy/install.sh`
installs them, and running it again is safe.

```
Cloudflare (proxied) → nginx :443 ─┬─ /assets/  /static/  /storybook/   files on disk
                                   └─ /  /graphql  /api/   → 127.0.0.1:9000 (blue) or :9001 (green)
                                                               → PostgreSQL 16 (127.0.0.1:5432)
```

Nothing here touches anything that isn't Tenuro's. The only shared actions are installing one
nginx site file plus `nginx -t` and `systemctl reload nginx`, creating the system users,
groups, the database roles and databases listed below, one sudoers drop-in, and DNS.

## 1. Before you start

`install.sh` checks all of these and stops if one fails:

| Check | Expected |
|---|---|
| `/usr/bin/rrsync` | present, with `-wo` and `-munge`. `-munge` needs rsync 3.2.4 or later (the server has 3.2.7), so the installer checks both `rsync --version` and that rrsync knows `-munge`. |
| `/usr/lib/postgresql/16/bin/{pg_dump,pg_restore,psql}` | present |
| `/etc/ssl/cloudflare/jeffgicharu.com.{pem,key}` | readable |
| `sysctl fs.protected_hardlinks` | `1`. The release freeze relies on it: an upload can't hardlink files the CI user doesn't own. |
| ports 9000 and 9001 | free, or already held by `tenuro@blue` / `tenuro@green` |

## 2. Install, in order

```bash
# 1. Get the files onto the server (any way you like), then review them.
git clone https://github.com/jeffgicharu/tenuro.git /tmp/tenuro-install   # or scp deploy/
cd /tmp/tenuro-install

# 2. Install. The two public keys come from Website-7; the private halves exist only as
#    GitHub secrets.
sudo deploy/install.sh --upload-key tenuro-upload.pub --activate-key tenuro-activate.pub

# 3. Read the host key on the server itself (not over the network) for the CI secret
#    TENURO_KNOWN_HOSTS, and send the line to Website-7:
awk -v host="$TENURO_DEPLOY_HOST" '{print host, $1, $2}' /etc/ssh/ssh_host_ed25519_key.pub

# 4. DNS: tenuro.jeffgicharu.com, A record to the origin server, proxied. Add it to the zone rule
#    that turns off Web Analytics injection, because the app's nonce-based CSP blocks the
#    injected script and we won't weaken the CSP for it.
```

`install.sh` works in this order, and each step is idempotent:

1. **Prerequisites** (section 1).
2. **Groups and users** (section 4). It creates only what's missing and fixes group membership.
3. **Folders** under `/srv/tenuro`, plus `/etc/nginx/tenuro` and `/usr/local/lib/tenuro`. It checks that `incoming/`, `staging/` and `releases/` share one filesystem, because activation moves releases between them with rename.
4. **Scripts, units, slot env files and the fallback page.** Each file is replaced only if its content, mode or owner differs.
5. **sudoers.** The drop-in is checked with `visudo -cf` before it's installed, and the whole sudoers config is checked again afterwards.
6. **Deploy keys.** `authorized_keys` is written only when both keys are given. Each key must be a single, valid, distinct ed25519 line.
7. **PostgreSQL roles and databases.** Each is created only if missing. Connection limits and the `NOSUPERUSER … NOBYPASSRLS` attributes are re-applied every run.
8. **Secrets.** `gen-secrets` runs only when neither env file exists. It never overwrites, and it prints variable names only.
9. **nginx.** It installs the initial slot snippet only if none exists. Then `install_nginx_site` (in `deploy/lib/nginx-site.sh`) installs and links the site file and runs `nginx -t`.
   - If the test fails, it puts back exactly what was there before: the previous site file, or no file and no link on a first install. It then runs `nginx -t` again and stops without reloading. A bad file therefore never stays in place for the shared nginx's next reload.
   - If `nginx -t` still fails after that, it says the fault lies outside Tenuro's file.
   - Only after a pass does it run `systemctl reload nginx`; `--no-reload` skips the reload.
10. **systemd.** `daemon-reload`, `systemd-analyze verify`, then it enables the four timers (backup, restore test, nightly rebuild, incoming sweep) and `tenuro-boot.service`. The installer never enables an app slot. `tenuro-activate` enables the slot it makes live and disables the old one, so only the active slot starts at boot, and `tenuro-boot` checks this again at every boot.

The first deploy needs nothing more on the server. Once installation is done, Website-7 sets
the repository variable `DEPLOY_ENABLED=true`. It also sets up the `production` environment:
deploys only from `main`, with the three secrets below.

## 3. Files

| Target | Owner, mode | What it does |
|---|---|---|
| `/etc/nginx/sites-available/tenuro.jeffgicharu.com` | root 0644 | The site. TLS uses your origin certificate, the Cloudflare real-IP ranges were fetched 2026-11-02 (15 IPv4, 7 IPv6), and rate limits never apply to loopback. Logs go to `/var/log/nginx/tenuro.{access,error}.log`. |
| `/etc/nginx/tenuro/active-slot.conf` | root 0644 | Two `set` lines naming the live slot and port. Only `tenuro-activate` rewrites it, by atomic rename followed by `nginx -t`. No sed is involved. |
| `/etc/systemd/system/tenuro@.service` | root 0644 | The app, one instance per slot, running as `tenuro-blue` / `tenuro-green`. |
| `/etc/systemd/system/tenuro-migrate@.service` | root 0644 | Expand-only migrations for a slot's release, as `tenuro-jobs` with owner credentials. |
| `/etc/systemd/system/tenuro-smoke@.service` | root 0644 | Journey checks against a slot's port, plus the CPU self-check on this machine's CPU. It gets no credentials. |
| `/etc/systemd/system/tenuro-reset.{service,timer}` | root 0644 | The nightly data rebuild at 03:00 Nairobi time. It runs at `Nice=10`, `IOSchedulingClass=idle` and `CPUQuota=50%`. |
| `/etc/systemd/system/tenuro-backup.{service,timer}` | root 0644 | `pg_dump` nightly at 02:00 Nairobi time, keeping 10. |
| `/etc/systemd/system/tenuro-restore-test.{service,timer}` | root 0644 | Every Sunday at 04:00, restores the newest dump into `tenuro_restore_test`, verifies it and records the result. |
| `/etc/systemd/system/tenuro-boot.service` | root 0644 | Runs once at boot, after PostgreSQL and nginx (it does nothing before the first activation). It starts the slot named in `state/active` and keeps it the only one enabled. If the nginx snippet names another slot, or a switch was interrupted, it rewrites the snippet, runs `nginx -t`, and reloads nginx only if the snippet changed and nginx is running. |
| `/etc/systemd/system/tenuro-incoming-sweep.{service,timer}` | root 0644 | Hourly, as `tenuro-ci`, removes uploads left in `incoming/` for more than 6 hours. |
| `/usr/local/sbin/tenuro-boot` | root 0755 | What `tenuro-boot.service` runs. It holds the activation lock. |
| `/usr/local/sbin/tenuro-activate` | root 0755 | The zero-downtime activation (section 6). It refuses to run unless it is root. It runs its work as a transient unit, so a dropped SSH session can't interrupt it. |
| `/usr/local/sbin/tenuro-activate-ssh` | root 0755 | Forced command for the CI activation key. It accepts a single 40-character sha and nothing else. |
| `/usr/local/sbin/tenuro-retire` | root 0755 | Stops and disables the old slot two minutes after a switch. It holds the activation lock and re-reads the state under it. |
| `/etc/sudoers.d/tenuro-ci` | root 0440 | `tenuro-ci` may run `/usr/local/sbin/tenuro-activate` as root, and nothing else. |
| `/var/lib/tenuro-ci/.ssh/authorized_keys` | root 0644 (dir root 0755, home tenuro-ci 0755) | Two `restrict,command=…` keys. Root-owned, so `tenuro-ci` can't edit it; this works with `StrictModes yes`. |
| `/usr/local/lib/tenuro/backup.sh`, `restore-test.sh` | root 0755 | Call `/usr/lib/postgresql/16/bin/*` by full path. |
| `/usr/local/lib/tenuro/gen-secrets` | root 0700 | Creates the env files once (section 5). |
| `/srv/tenuro/shared/slot-{blue,green}.env` | root 0644 | `PORT` and `SLOT`. Not secret. |
| `/srv/tenuro/fallback/unavailable.html` | root 0644 | The page nginx serves for 502/503/504, as a 503 with `Retry-After: 120`. It's self-contained, works in light and dark mode, and is marked noindex. Its stylesheet is pinned by a CSP hash in the site file, so edit both together. |

Folders:

| Path | Owner, mode | Purpose |
|---|---|---|
| `/srv/tenuro/incoming` | tenuro-ci 0750 | The only place CI can write (`rrsync -wo -munge`). |
| `/srv/tenuro/staging` | root 0700 | Uploads are frozen here, out of the CI user's reach, before they become releases. |
| `/srv/tenuro/releases/<sha>` | root:tenuro, files 0640, dirs 0750; `public/` world-readable | Frozen releases. 3 are kept, plus any a slot still points at. |
| `/srv/tenuro/slots/{blue,green}` | root symlinks | Each points at the release its slot runs. |
| `/srv/tenuro/current` | root symlink | The live release. The nightly rebuild runs from it. |
| `/srv/tenuro/assets` | root 0755 | Hashed JS, CSS and fonts from kept releases, so tabs left open survive a deploy. |
| `/srv/tenuro/state` | root 0700 | `active`, which names the live slot, and each activation's log (`activate-<sha>.log`, kept 14 days). The activation lock is taken on this folder, so no other user can create or hold it. |
| `/srv/tenuro/shared` | root 0711 | The env files. |
| `/var/lib/tenuro-{blue,green,jobs,backup}` | the unit's user, 0700 | Each unit's `StateDirectory`: its only writable path. |

## 4. Users, groups and permissions

| Name | Kind | Groups | Why |
|---|---|---|---|
| `tenuro-blue`, `tenuro-green` | system user, no shell, home `/nonexistent` | `tenuro` | One per app slot. |
| `tenuro-jobs` | system user, no shell | `tenuro`, `tenuro-ops` | Migrations, journey checks and the nightly rebuild. These run scripts from a release, which needs `tenuro`; the owner credentials need `tenuro-ops`. |
| `tenuro-backup` | system user, no shell | `tenuro-ops` | Backup and restore test. Runs only root-owned scripts. |
| `tenuro-ci` | system user, shell `/bin/sh`, home `/var/lib/tenuro-ci` | none | Holds the two forced-command keys. Its password field is set to `*` (no password, but not "locked"), so sshd accepts its keys. |
| `tenuro` | group | | Can read releases and `app.env`. |
| `tenuro-ops` | group | | Can read `ops.env` (owner credentials). |

Every unit runs with:
- `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `PrivateDevices` and `NoNewPrivileges`;
- an empty `CapabilityBoundingSet`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`, and `IPAddressDeny=any` with `IPAddressAllow=localhost`;
- `ProtectProc=invisible`, the kernel, clock and namespace protections, and `SystemCallFilter=@system-service ~@privileged`;
- `MemoryMax` and `MemorySwapMax=0`.

The units that run Node differ in three ways:
- They set `MemoryDenyWriteExecute=no`, which V8's JIT needs.
- They also allow `AF_NETLINK`, so `os.networkInterfaces()` doesn't throw. `IPAddressDeny` still blocks all non-local traffic.
- They leave out `ProcSubset=pid`, which hides `/proc/cpuinfo` and `/proc/meminfo`, so `os.cpus()` would return nothing and `os.totalmem()` would fail.

The backup and restore units, which run only bash, keep `MemoryDenyWriteExecute` on and have no netlink. Each unit's only writable path is its own `StateDirectory`. Uploads are stored in PostgreSQL, so the two slots share no folder. `systemd-analyze security` rates the app unit 1.3 ("OK").

**Filesystem view.** No Tenuro unit can see other sites' files, even world-readable ones such
as another site's `wp-config.php` or `.env`:
- `TemporaryFileSystem=/var:ro /srv:ro /opt:ro /mnt:ro /media:ro` replaces those trees with empty read-only folders.
- The Node units get `/srv/tenuro` back read-only (`BindReadOnlyPaths`): their releases, slots and the public files. The `staging/`, `state/` and `incoming/` folders inside it stay unreadable to them by mode.
- Each unit gets its own `StateDirectory` back read-write (`BindPaths`).
- `InaccessiblePaths` hides `/etc/nginx`, `/etc/letsencrypt`, `/etc/ssl/private` and `/etc/ssl/cloudflare`, and `ProtectHome` already hides `/home` and `/root`.
- The env files don't need to be visible, because systemd reads `EnvironmentFile=` before the sandbox applies.
- `deploy/test/units.sh` runs Node under the app unit's exact settings. It starts, reads its release, writes its state folder and reaches a TCP service on 127.0.0.1, as it reaches PostgreSQL. It can't read world-readable stand-ins under `/var`, `/etc/nginx` and `/opt`.

**Known residual: local TCP ports.** `IPAddressAllow=localhost` lets the units reach every TCP
port on 127.0.0.1, not just PostgreSQL's 5432. systemd 249 can't restrict by port without
custom BPF programs (`SocketBindDeny=` covers only binding, and `IPEgressFilterPath=` needs a
BPF program we'd have to ship). So every local service on the box should require
authentication, which PostgreSQL does here with scram-sha-256. A service that trusts
loopback without a password would be reachable from Tenuro's processes, as it is from every
other site's.

nginx (`www-data`) is in neither group. It can read each release's `public/` and nothing else.

## 5. Secrets

`gen-secrets` creates the passwords and secrets on the server with `openssl rand`. It sets the
database passwords through psql on stdin, with `SET log_statement = 'none'` as the first line,
and writes the two files through a temporary file and a rename. It prints variable names only.

| File | Owner, mode | Variables |
|---|---|---|
| `/srv/tenuro/shared/app.env` | root:tenuro 0640 | `PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD SESSION_SECRET SANDBOX_SECRET ICS_FEED_SECRET` (runtime role `tenuro_app`) |
| `/srv/tenuro/shared/ops.env` | root:tenuro-ops 0640 | `PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD` (owner role `tenuro`) |

CI secrets (GitHub `production` environment): `TENURO_UPLOAD_KEY`, `TENURO_ACTIVATE_KEY`, `TENURO_KNOWN_HOSTS`.

`gen-secrets` discards psql's output entirely, because on an error psql echoes the failing
statement, password included. It also sets `log_min_error_statement = panic` alongside
`log_statement = 'none'`, so a failing statement never reaches the server log. On failure it
prints a fixed message and writes nothing.

## 6. Releases and activation

Each release is a folder named by its full commit sha.

1. CI builds it, with a pinned Node runtime inside (section 9).
2. CI runs the self-check under `qemu-x86_64 -cpu qemu64` (no SSE4, no AVX).
3. CI uploads it with `rsync` to `incoming/<sha>/`, over a key limited to `rrsync -wo -munge /srv/tenuro/incoming`. With `-munge`, any symlink an upload carries is stored in inert, rewritten form. The host key is pinned (`StrictHostKeyChecking=yes`).
4. CI calls the second key with the sha. Its forced command checks the sha and runs `sudo -n tenuro-activate <sha>`.

`tenuro-activate` runs its work as a transient unit:

```
systemd-run --wait --collect --unit=tenuro-activate-<sha prefix> ... tenuro-activate --run <sha>
```

A dropped SSH session can't interrupt it, and the caller ignores SIGHUP and SIGPIPE while it
waits. The unit's log is printed at the end and kept as `state/activate-<sha>.log`, and the
unit's exit status is CI's exit status. `--run` only works inside that unit
(`INVOCATION_ID`), and sudo's `env_reset` removes that variable.

Inside the unit, it holds a lock on the root-only `state/` folder and does the following.

0. **Reconcile.** `state/active` is written only after every check has passed, so the script trusts it, and on every run it:
   - enables and starts the slot it names (`systemctl enable --now`) and disables the other. A power loss between a commit and its boot handover therefore can't leave the live slot off at boot;
   - rewrites the snippet for that slot, runs `nginx -t` and reloads, if nginx names a different slot or the snippet backup (`active-slot.conf.prev`) is still there. That covers a run killed after the switch, and a rollback killed before its reload finished: the backup is deleted only after a successful reload, so its presence is the sign. If `nginx -t` fails at this point, it stops without changing anything else.
1. **Freeze**, in this order:
   1. `mv` the upload from `incoming/` into the root-only `staging/` folder;
   2. check again that what arrived is a real folder and not a symlink. The upload user could have swapped `incoming/<sha>` between the first check and the `mv`; in that case only the link is removed, and nothing is ever handed a link;
   3. refuse it if `du -sxm` measures more than 400 MB, a cap that protects the shared disk;
   4. refuse any hardlinked file (`-type f -links +1`) before `chown`, so a hardlink to a file outside the upload is never re-owned;
   5. `chown -hR root:tenuro`, which never follows links;
   6. modes, applied top-down by `find -xdev -exec chmod … \;`: folders 0750, files 0640. Only files with `-links 1` are touched. `find` never follows links. Each folder is locked before its contents are read, so no entry can be swapped between the check and the `chmod`;
   7. then `find`, which rejects symlinks, special files, hardlinked files and anything not `root:tenuro`.

   It then checks the required files, `REVISION == sha`, and `runtime/bin/node` against `runtime/SHA256`. Only after that does it hardlink `runtime/bin/node` from an earlier frozen, root-owned release, and only if that file's sha256 matches too. It never links into `incoming/` or `staging/`. Last, it makes `public/` world-readable and moves the tree into `releases/<sha>`.
2. **Start the idle slot.** It adds the hashed assets to the pool, points the idle slot at the release, runs `tenuro-migrate@<idle>` and restarts `tenuro@<idle>`. If any of these fails, it stops the idle slot and exits.
3. **Check the idle slot directly:**
   - `/api/health` reports the sha and `db: ok`;
   - `/` carries the `X-Robots-Tag: noindex` header, a robots meta noindex and a CSP header;
   - `tenuro-smoke@<idle>` passes the main journeys and the CPU self-check.
4. **Switch.** It writes the new snippet to a temporary file and renames it into place. If `nginx -t` fails, nginx was never reloaded and still serves the old slot, so it puts the old snippet back, stops the idle slot and exits. Otherwise it runs one `systemctl reload nginx`.
5. **Check again through nginx,** using `curl --resolve tenuro.jeffgicharu.com:443:127.0.0.1`: health and sha, noindex and CSP, a hashed asset, and a persisted GraphQL query sent with `x-tenuro-client: smoke`. On failure it rolls back automatically and exits non-zero:
   - It puts the old snippet back, runs `nginx -t` and reloads.
   - It stops the idle slot only once that reload has succeeded, so nginx no longer points at it.
   - If `nginx -t` or the reload fails, it keeps both slots running, says so plainly ("ROLLBACK INCOMPLETE … both slots are running"), and leaves the snippet backup in place, so the next run's step 0 finishes the job.
   - An EXIT trap covers the whole stretch from the snippet swap to the commit, so a failed reload, an unexpected error, or SIGTERM, SIGHUP or SIGINT gets the same rollback.
   - If the commit had already landed when the signal arrived, the trap sees that in `state/active` and leaves the switch in place.
   - Only SIGKILL or power loss can skip the trap, and step 0 of the next run repairs that.
6. **Commit.**
   - It records the active slot and repoints `current`.
   - It enables `tenuro@<new>` for boot and disables `tenuro@<old>`, so after a reboot exactly the live slot starts and nginx already points at it.
   - Two minutes later `tenuro-retire` stops the old slot. It takes the lock and re-reads `state/active` first, so a later activation can't make it stop the live slot.
   - It then keeps 3 releases, plus any a slot points at, prunes the asset pool to match, and clears uploads and staging leftovers more than 2 days old.

The script's paths are fixed. Its test mode needs both an explicit variable and a non-root
caller, so it can't apply under sudo (EUID 0, and `env_reset` drops the variable). Outside
test mode it refuses any non-root caller. The forced command passes no environment in any case.

`/api/health` returns JSON `{"sha": "...", "slot": "...", "db": "ok", ...}`. Activation
checks `sha` and `db`.

**Build contract**, implemented by `deploy/ci/build-release.sh`:

| Release path | Comes from |
|---|---|
| `REVISION` | the commit sha |
| `runtime/bin/node`, `runtime/LICENSE`, `runtime/SHA256` | the official Node build named in `deploy/ci/node.env`, checked against the pinned sha256 and nodejs.org's `SHASUMS256.txt` |
| `server/index.mjs` | the app. `--selfcheck` runs offline: it loads every module, renders a PDF, writes an XLSX and computes a schedule. |
| `server/migrate.mjs`, `server/smoke.mjs`, `server/rebuild.mjs` | migrations, journey checks (`--selfcheck` adds the self-check), and the nightly rebuild. `smoke.mjs` sends `x-tenuro-client: smoke` on every GraphQL POST against the idle slot, as the activation script does through nginx. |
| `server/web/index.html` | the SPA's HTML template. The app renders it with a fresh CSP nonce per request; nginx never serves it as a file. |
| `public/` | the SPA build (`assets/`, `static/`), and Storybook at `public/storybook/` |
| `ops/smoke-query.json` | a persisted-query request body the activation script posts to `/graphql` |

## 7. Rate limits and visitor caps

nginx, keyed by the visitor's real IP (Cloudflare's `CF-Connecting-IP`, trusted only from
Cloudflare ranges). `127.0.0.1` and `::1` are never limited.

| Path | Rate, burst | Body limit |
|---|---|---|
| `/api/session` (sign-in, which creates sessions and sandboxes) | 10/min, burst 5 | 4 KB |
| `/api/uploads` | 1/s, burst 3 | 12 MB |
| `/api/vitals` (Web Vitals beacons) | 2/s, burst 10 | 16 KB |
| `/api/csp-report` | 1/s, burst 5 | 16 KB |
| `/graphql`, `/api/*`, pages | 20/s, burst 40 | 2 MB |
| `/assets/`, `/static/`, `/storybook/` | 60/s, burst 100–200 | n/a |

Every response from the proxied paths carries `X-Robots-Tag: noindex, nofollow`, including
nginx's own 413 and 429 responses. On those paths nginx sets the header itself and hides the
app's copy, so it is sent exactly once.

The app enforces global caps from its own configuration, so that a visitor dropping the
sandbox cookie can't grow disk use without bound. The API's test suite hits each cap.

| Cap | Limit |
|---|---|
| New sandboxes per IP | 20 per day |
| New sign-in sessions per IP | 60 per hour |
| Live sessions, all visitors | 2,000 |
| Sandboxes, all visitors | 2,000 |
| Writes per sandbox | 300 |
| Overlay rows, all sandboxes | 200,000 (the sum of per-sandbox write counts) |
| Uploads | 10 MB each, 10 per sandbox, 500 MB in total across all visitors |
| `web_vital` rows | 100,000 |
| `csp_report` rows | 20,000 |
| Sandbox expiry | 24 hours after last activity, plus everything cleared in the nightly rebuild |

**Disk on the shared host.** Tenuro bounds what it can write under `/srv/tenuro` in three ways:
- **Uploads:** `tenuro-activate` refuses an upload over 400 MB, and `tenuro-incoming-sweep` removes anything left in `incoming/` for more than 6 hours.
- **Releases:** 3 are kept, with the Node binary shared between them.
- **Backups:** the 10 newest dumps are kept in `/var/lib/tenuro-backup`.

**Request for Portfolio:** the CI key could still fill `incoming/` within that 6-hour window,
since rrsync can't cap how much it writes. If the host supports it, please put `/srv/tenuro`
under an XFS or ext4 project quota (for example 2 GB), or on its own size-limited filesystem.

## 8. Database

- **Roles.**
  - `tenuro`: owner, connection limit 6. Used for migrations, the rebuild, backups and the restore test.
  - `tenuro_app`: runtime, connection limit 14. Each slot has a pool of 6, plus 2 spare.
  - Both are `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
- **Databases.** `tenuro`, and `tenuro_restore_test`, which is restored into weekly. `PUBLIC` has no rights on either.
- **Row-level security.** It applies to `tenuro_app`. Tables use `ENABLE ROW LEVEL SECURITY` and never `FORCE ROW LEVEL SECURITY`, so the owner's `pg_dump` sees every row. A forced policy would make the owner's dump fail with `row_security = off`.
- **Extensions.** Only `pg_trgm`, a trusted extension, which the owner creates in a migration.
- **Backups.** Dumps use `pg_dump --format=custom --no-owner` and keep privileges, so a restore gives `tenuro_app` its grants back. A dump is accepted only if `pg_restore --list` reads it. The 10 newest are kept in `/var/lib/tenuro-backup` (0700, mode 0600 files).
- **Restore test.**
  - It runs `pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error` into `tenuro_restore_test`.
  - It then calls `ops.verify_integrity()`, which ships with the migrations. That checks table counts against the seed manifest, recomputes the snapshot check sums, and confirms every journal balances.
  - The result is recorded in `ops_check`, and the app's Quality page shows it.
  - A failure is recorded as well, and the unit fails.

### Proving the first backup and restore by hand

Do this after the first deploy, once the migrations have created `ops_check` and `ops.verify_integrity()`:

```bash
sudo systemctl start tenuro-backup.service
journalctl -u tenuro-backup.service -n 3 --no-pager      # "backup ok: tenuro-<stamp>.dump, <bytes> bytes, <n>s"
sudo ls -l /var/lib/tenuro-backup/

sudo systemctl start tenuro-restore-test.service
journalctl -u tenuro-restore-test.service -n 3 --no-pager  # "restore test ok: tenuro-<stamp>.dump in <n>s"
```

Website-7 reports the size and timings to Portfolio. `deploy/test/backup.sh` already runs
the same scripts against a throwaway cluster. It covers: grants surviving in the dump; a failed
integrity check recorded as a failure; rotation; and a live-style restore after which
`tenuro_app` could still read through row-level security.

## 9. Node runtime

Every release carries the official Node `v22.23.4` linux-x64 build in `runtime/`, pinned in
`deploy/ci/node.env` by its tarball sha256. The units run
`/srv/tenuro/slots/%i/runtime/bin/node`, so system Node updates never affect Tenuro, and the
self-check tests the exact binary that runs. An identical binary is hardlinked between frozen
releases, so the 3 kept releases cost about 120 MB, not 360 MB. Releases contain no native
addons, and CI fails if one appears.

## 10. Rollback

- **Bad release caught during activation.** Nothing to do: the script stops before the switch, or rolls the switch back, and exits non-zero. The live slot never changed.
- **Bad release noticed later.** Run the Deploy workflow by hand with `sha` set to a kept release. It skips the build and just activates. From the server, the same as root: `sudo /usr/local/sbin/tenuro-activate <sha>`. `ls -t /srv/tenuro/releases` lists the kept shas.
- **Emergency, with CI unavailable.** `sudo /usr/local/sbin/tenuro-activate <previous sha>`, as above. It still checks the slot before switching.
- **After a reboot.** Nothing to do. Only the live slot is enabled, and the nginx snippet already names it. `tenuro-boot.service` checks both again at boot. It starts the slot in `state/active`, and if power was lost mid-switch or mid-rollback, it re-renders the snippet and reloads nginx after `nginx -t`. The next activation makes the same checks before doing anything else.
- **"ROLLBACK INCOMPLETE" from an activation.** nginx -t or the reload failed while restoring the old snippet, so both slots were left running. Fix whatever makes `sudo nginx -t` fail, then re-run the activation, or `sudo /usr/local/sbin/tenuro-boot`. Either one puts nginx back on the slot in `state/active` first.
- **Database restore.** Restoring takes the app down briefly, and nginx serves the 503 page meanwhile.
  ```bash
  sudo systemctl stop tenuro-reset.timer tenuro@blue.service tenuro@green.service
  sudo -u tenuro-backup bash -c 'set -a; . /srv/tenuro/shared/ops.env; set +a;
    /usr/lib/postgresql/16/bin/pg_restore --clean --if-exists --no-owner --exit-on-error \
      -d tenuro /var/lib/tenuro-backup/tenuro-<stamp>.dump'
  sudo /usr/local/sbin/tenuro-activate "$(basename "$(readlink -f /srv/tenuro/current)")"
  sudo systemctl start tenuro-reset.timer
  ```
- **Remove Tenuro entirely.** Run `sudo systemctl disable --now` on the four timers, `tenuro-boot.service` and both slots. Remove the nginx site link and reload. Then remove the files in section 3, `/srv/tenuro`, the users and groups, the sudoers drop-in, and the two roles and databases.

## 11. Memory

| State | Use |
|---|---|
| Steady: one slot (`--max-old-space-size=144`, `MemoryMax=224M`) and its pool of 6 PostgreSQL backends | about 160–200 MB |
| During a deploy, 2–3 minutes with both slots | about 330–370 MB |
| Nightly jobs, run one at a time | rebuild 192M cap, backup and restore test 96M cap each |

All units have `MemorySwapMax=0`. Steady use is measured in stage 1, and `MemoryMax` is tightened if there's room.

## 12. How these files were tested

Every check below is in the repo, and the `Deploy checks` workflow runs it on each pull
request that touches `deploy/`. On the Ubuntu 24.04 runner, the backup test runs against
PostgreSQL 16.

| What | How | Result |
|---|---|---|
| Activation, retire and boot | `deploy/test/run.sh`: the real scripts against a temp tree. systemctl, systemd-run, nginx, curl, chown and logger are stubbed, and a stub `mv` can play a hostile upload user. flock, rsync, find, chmod, du and sha256sum are real. | 235 checks pass, in four groups (below). |
| Installer's nginx step | `deploy/test/install-nginx.sh` against a stub `nginx -t` | 20 checks pass: a fresh install; a re-run; a good update; a bad update rolled back to the previous file; a bad first install leaving nothing behind; a fault elsewhere reported as such |
| Secret generation | `deploy/test/secrets.sh` with a stub psql that echoes failing statements | 25 checks pass: names-only output; both `SET`s first; modes and groups; distinct passwords; refusal to overwrite; on failure, no password in the output and no files written |
| Shell scripts | shellcheck 0.11 | clean |
| Units | `deploy/test/units.sh`: hardening and filesystem-view rules per unit, `systemd-analyze verify` and `security` (systemd 259), the sweep's own command against a temp folder, and Node run under the app unit's own filesystem and sandbox settings through `systemd-run --user` | 196 checks pass. App unit rated 1.3. Under its settings Node starts, reads its release, writes its state, reaches a TCP service on 127.0.0.1, and reports CPUs, memory and interfaces. It can't read world-readable stand-ins under `/var`, `/etc/nginx` and `/opt`. |
| nginx site | `deploy/test/nginx.sh`: `nginx -t`, then nginx running for real against a stub backend | 34 checks pass (nginx 1.28 locally). Besides `nginx -t`, they cover: 503 page with Retry-After and its CSP; asset pool; robots.txt; port 80 redirect; loopback never limited; a Cloudflare-forwarded visitor limited after the burst; the real IP reaching the app; spoofed `CF-Connecting-IP` ignored; body limits; X-Robots-Tag exactly once on proxied responses and present on nginx's own 413 and 429 |
| Backup and restore | `deploy/test/backup.sh`: the real scripts against a throwaway cluster | 13 checks pass (PostgreSQL 17 locally; 16 in CI) |
| Node runtime | `fetch-node.sh` for real, then the binary under `qemu-x86_64 -cpu qemu64` | checksum verified; runs on the baseline CPU model |
| Workflow | actionlint | clean |

The activation, retire and boot checks fall into four groups:
- **Normal runs:** the happy path; boot handover (enable new, disable old), re-asserted at the start of every run; retire stopping only the inactive slot; keeping 3 releases and pruning; a pinned old release never pruned.
- **Rejected input:** bad shas; `--run` outside its unit; a missing upload; an upload that is itself a symlink; an upload swapped for a symlink during the move, which leaves the decoy's modes untouched; an upload over the size cap; a hardlink refused before `chown`, including one to an outside file, which keeps its mode; a symlink, FIFO or wrongly owned file; loose modes tightened; a node checksum mismatch; a tampered earlier release never linked; a wrong REVISION or missing file.
- **Failures and recovery:**
  - failed health, restart, journeys or migrations, and `nginx -t` failure at the switch;
  - failure through nginx with rollback, where the idle slot is stopped only after the rollback reload;
  - the rollback's own `nginx -t` failing, which keeps both slots running and keeps the backup, then the next run repairs it;
  - a failed reload, and SIGTERM, SIGHUP and SIGINT mid-switch, all rolled back by the trap;
  - reconciling after a killed run and after a killed rollback;
  - a power loss between commit and boot handover;
  - detached mode relaying log and status;
  - the lock held, and a non-root caller refused.
- **Boot:** `tenuro-boot` re-rendering a wrong snippet with `nginx -t` before the reload; leaving a correct one alone, with no reload; a leftover backup forcing a re-render; `nginx -t` failure putting the old snippet back; nginx not yet running; no state at all.

## 13. Notes for the shared nginx

- **`http2` is per socket in nginx 1.18.** `listen 443 ssl http2;` turns HTTP/2 on for the whole `*:443` socket, so it affects every site on it, not only Tenuro. If the other sites already use `http2` on 443, nothing changes. If they don't, say so and I'll drop `http2` from Tenuro's listen lines, since Cloudflare speaks HTTP/2 to visitors either way. On nginx 1.25.1 or later, `http2 on;` is per server and the `listen … http2` form logs a deprecation warning.
- **`ssl_protocols` here doesn't govern the handshake.** In a server block that isn't the default for `*:443`, nginx negotiates TLS with the default server's settings before it knows the host name. `ssl_protocols TLSv1.2 TLSv1.3;` in Tenuro's block documents intent only. The effective protocols come from the default server, or from `http {}`.
