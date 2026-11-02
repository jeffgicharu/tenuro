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
| `/usr/bin/rrsync` | present (rsync 3.2.7, supports `-wo`) |
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
3. **Folders** under `/srv/tenuro`, plus `/etc/nginx/tenuro` and `/usr/local/lib/tenuro`.
4. **Scripts, units, slot env files and the fallback page.** Each file is replaced only if its content, mode or owner differs.
5. **sudoers.** The drop-in is checked with `visudo -cf` before it's installed, and the whole sudoers config is checked again afterwards.
6. **Deploy keys.** `authorized_keys` is written only when both keys are given. Each key must be a single, valid, distinct ed25519 line.
7. **PostgreSQL roles and databases.** Each is created only if missing. Connection limits and the `NOSUPERUSER … NOBYPASSRLS` attributes are re-applied every run.
8. **Secrets.** `gen-secrets` runs only when neither env file exists. It never overwrites, and it prints variable names only.
9. **nginx.** It installs the site, installs the initial slot snippet only if none exists, links the site, and runs `nginx -t`. If the test fails, the link is removed and the script stops. Only after a pass does it run `systemctl reload nginx`; `--no-reload` skips the reload.
10. **systemd.** `daemon-reload`, `systemd-analyze verify`, then it enables the three timers. The app slots are never enabled; only `tenuro-activate` starts them.

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
| `/usr/local/sbin/tenuro-activate` | root 0755 | The zero-downtime activation (section 6). Runs only as root via sudo. |
| `/usr/local/sbin/tenuro-activate-ssh` | root 0755 | Forced command for the CI activation key. It accepts a single 40-character sha and nothing else. |
| `/usr/local/sbin/tenuro-retire` | root 0755 | Stops the old slot two minutes after a switch, holding the activation lock. |
| `/etc/sudoers.d/tenuro-ci` | root 0440 | `tenuro-ci` may run `/usr/local/sbin/tenuro-activate` as root, and nothing else. |
| `/var/lib/tenuro-ci/.ssh/authorized_keys` | root 0644 (dir root 0755, home tenuro-ci 0755) | Two `restrict,command=…` keys. Root-owned, so `tenuro-ci` can't edit it; this works with `StrictModes yes`. |
| `/usr/local/lib/tenuro/backup.sh`, `restore-test.sh` | root 0755 | Call `/usr/lib/postgresql/16/bin/*` by full path. |
| `/usr/local/lib/tenuro/gen-secrets` | root 0700 | Creates the env files once (section 5). |
| `/srv/tenuro/shared/slot-{blue,green}.env` | root 0644 | `PORT` and `SLOT`. Not secret. |
| `/srv/tenuro/fallback/unavailable.html` | root 0644 | The page nginx serves for 502/503/504, as a 503 with `Retry-After: 120`. It's self-contained, works in light and dark mode, and is marked noindex. Its stylesheet is pinned by a CSP hash in the site file, so edit both together. |

Folders:

| Path | Owner, mode | Purpose |
|---|---|---|
| `/srv/tenuro/incoming` | tenuro-ci 0750 | The only place CI can write (`rrsync -wo`). |
| `/srv/tenuro/releases/<sha>` | root:tenuro, files 0640, dirs 0750; `public/` world-readable | Frozen releases. 3 are kept, plus any a slot still points at. |
| `/srv/tenuro/slots/{blue,green}` | root symlinks | Each points at the release its slot runs. |
| `/srv/tenuro/current` | root symlink | The live release. The nightly rebuild runs from it. |
| `/srv/tenuro/assets` | root 0755 | Hashed JS, CSS and fonts from kept releases, so tabs left open survive a deploy. |
| `/srv/tenuro/state` | root 0700 | `active`, which names the live slot. |
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
- the kernel, clock and namespace protections, and `SystemCallFilter=@system-service ~@privileged`;
- `MemoryMax` and `MemorySwapMax=0`.

Only the units that run Node set `MemoryDenyWriteExecute=no`. The backup and restore units, which run only bash, keep it on. Each unit's only writable path is its own `StateDirectory`. Uploads are stored in PostgreSQL, so the two slots share no folder. `systemd-analyze security` rates the app unit 1.2 ("OK").

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

## 6. Releases and activation

Each release is a folder named by its full commit sha.

1. CI builds it, with a pinned Node runtime inside (section 9).
2. CI runs the self-check under `qemu-x86_64 -cpu qemu64` (no SSE4, no AVX).
3. CI uploads it with `rsync` to `incoming/<sha>/`, over a key limited to `rrsync -wo /srv/tenuro/incoming`. The host key is pinned (`StrictHostKeyChecking=yes`).
4. CI calls the second key with the sha. Its forced command checks the sha and runs `sudo -n tenuro-activate <sha>`.

`tenuro-activate` holds a lock (`flock -n`) and then does the following.

1. **Freeze**, in this order:
   1. `mv` the upload out of `incoming/`;
   2. `chown -hR root:tenuro`;
   3. `chmod -R u=rwX,g=rX,o=`;
   4. then `find`, which rejects symlinks, special files and hardlinked files (`-type f -links +1`).

   It then checks the required files, `REVISION == sha`, and `runtime/bin/node` against `runtime/SHA256`. Only after that does it hardlink `runtime/bin/node` from an earlier frozen, root-owned release, and only if that file's sha256 matches too. It never links into `incoming/`.
2. **Start the idle slot.** It adds the hashed assets to the pool, points the idle slot at the release, runs `tenuro-migrate@<idle>` and restarts `tenuro@<idle>`.
3. **Check the idle slot directly:**
   - `/api/health` reports the sha and `db: ok`;
   - `/` carries the `X-Robots-Tag: noindex` header, a robots meta noindex and a CSP header;
   - `tenuro-smoke@<idle>` passes the main journeys and the CPU self-check.
4. **Switch.** It writes the new snippet to a temporary file and renames it into place. If `nginx -t` fails, it puts the old snippet back and stops; otherwise it runs one `systemctl reload nginx`.
5. **Check again through nginx,** using `curl --resolve tenuro.jeffgicharu.com:443:127.0.0.1`: health and sha, noindex and CSP, a hashed asset, and a persisted GraphQL query. On failure it restores the old snippet, reloads, stops the idle slot and exits non-zero, which is an **automatic rollback**.
6. **Commit.** It records the active slot and repoints `current`. Two minutes later `tenuro-retire` stops the old slot. It then keeps 3 releases, plus any a slot points at, prunes the asset pool to match, and clears uploads more than 2 days old.

The script's paths are fixed. Its test mode needs both an explicit variable and a non-root
caller, so it can't apply under sudo (EUID 0, and `env_reset` drops the variable). The forced
command passes no environment in any case.

**Build contract**, implemented by `deploy/ci/build-release.sh`:

| Release path | Comes from |
|---|---|
| `REVISION` | the commit sha |
| `runtime/bin/node`, `runtime/LICENSE`, `runtime/SHA256` | the official Node build named in `deploy/ci/node.env`, checked against the pinned sha256 and nodejs.org's `SHASUMS256.txt` |
| `server/index.mjs` | the app. `--selfcheck` runs offline: it loads every module, renders a PDF, writes an XLSX and computes a schedule. |
| `server/migrate.mjs`, `server/smoke.mjs`, `server/rebuild.mjs` | migrations, journey checks (`--selfcheck` adds the self-check), and the nightly rebuild |
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

The app enforces global caps, so that a visitor dropping the sandbox cookie can't grow disk use
without bound. The API's test suite hits each cap.

| Cap | Limit |
|---|---|
| New sandboxes per IP | 20 per day |
| Sign-in sessions | 20 new sessions per IP per day; 2,000 live sessions in total, oldest idle evicted first |
| Writes per sandbox | 300 overlay rows, 10 uploads of up to 10 MB |
| Stored upload bytes, all visitors | 500 MB in total. Past that, uploads are refused with a clear message. |
| Overlay rows, all sandboxes | 200,000. The oldest idle sandboxes are cleared first. |
| `web_vital` rows | 100,000, trimmed hourly to the most recent |
| CSP report rows | 20,000, deduplicated by directive and URL, trimmed hourly |
| Sandbox expiry | 24 hours after last activity, plus everything cleared in the nightly rebuild |

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
- **Database restore.** Restoring takes the app down briefly, and nginx serves the 503 page meanwhile.
  ```bash
  sudo systemctl stop tenuro-reset.timer tenuro@blue.service tenuro@green.service
  sudo -u tenuro-backup bash -c 'set -a; . /srv/tenuro/shared/ops.env; set +a;
    /usr/lib/postgresql/16/bin/pg_restore --clean --if-exists --no-owner --exit-on-error \
      -d tenuro /var/lib/tenuro-backup/tenuro-<stamp>.dump'
  sudo /usr/local/sbin/tenuro-activate "$(basename "$(readlink -f /srv/tenuro/current)")"
  sudo systemctl start tenuro-reset.timer
  ```
- **Remove Tenuro entirely.** Run `sudo systemctl disable --now` on the three timers and both slots. Remove the nginx site link and reload. Then remove the files in section 3, `/srv/tenuro`, the users and groups, the sudoers drop-in, and the two roles and databases.

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
| Activation script | `deploy/test/run.sh`: the real script against a temp tree, with stubbed systemctl, nginx, curl, chown, logger and systemd-run, and real flock, rsync, find and sha256sum | 104 checks pass. They cover: the happy path; bad shas; a missing upload; a symlink, hardlink or FIFO in the upload; a node checksum mismatch; a tampered earlier release never linked; a wrong REVISION or missing file; failed idle health, journeys or migrations; `nginx -t` failure; failure through nginx with rollback; keeping 3 and pruning; a pinned old release never pruned; the lock held; test mode needing its flag. |
| Shell scripts | shellcheck 0.11 | clean |
| Units | `systemd-analyze verify` (systemd 259) and `systemd-analyze security` | no errors (only "command not found", since `/srv/tenuro` doesn't exist on the test machine); app unit rated 1.2 |
| nginx site | `deploy/test/nginx.sh`: `nginx -t`, then nginx running for real against a stub backend | 21 checks pass (nginx 1.28 locally). Besides `nginx -t`, they cover: 503 page with Retry-After and its CSP; asset pool; robots.txt; port 80 redirect; loopback never limited; a Cloudflare-forwarded visitor limited after the burst; the real IP reaching the app; spoofed `CF-Connecting-IP` ignored; body limits on vitals, CSP reports, GraphQL and uploads |
| Backup and restore | `deploy/test/backup.sh`: the real scripts against a throwaway cluster | 13 checks pass (PostgreSQL 17 locally; 16 in CI) |
| Node runtime | `fetch-node.sh` for real, then the binary under `qemu-x86_64 -cpu qemu64` | checksum verified; runs on the baseline CPU model |
| Workflow | actionlint | clean |

**nginx version note.** The site uses `listen 443 ssl http2;`, which Ubuntu 22.04's nginx
1.18 needs. If the server runs nginx 1.25.1 or later, that form still works but logs a
deprecation warning, and `http2 on;` is the newer spelling.
