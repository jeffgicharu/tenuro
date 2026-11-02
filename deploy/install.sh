#!/bin/bash
# Installs or updates Tenuro's server files. Safe to run again: it creates only what is
# missing, never overwrites env files or the live nginx slot snippet, and never prints secrets.
#
#   sudo deploy/install.sh [--upload-key FILE --activate-key FILE] [--no-reload]
#
# --upload-key / --activate-key  public keys (one ed25519 line each) for tenuro-ci
# --no-reload                    install and test the nginx site but don't reload nginx
set -euo pipefail
umask 022
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

SRC=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/server" && pwd)
readonly SRC
# shellcheck source=deploy/lib/nginx-site.sh
. "$SRC/../lib/nginx-site.sh"
readonly PGBIN=/usr/lib/postgresql/16/bin
readonly SITE=tenuro.jeffgicharu.com
UPLOAD_KEY='' ACTIVATE_KEY='' RELOAD=1

while (($#)); do
  case $1 in
    --upload-key) UPLOAD_KEY=${2:?}; shift 2 ;;
    --activate-key) ACTIVATE_KEY=${2:?}; shift 2 ;;
    --no-reload) RELOAD=0; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

step() { printf '\n== %s\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
indent() { local l; while IFS= read -r l; do [[ -n $l ]] && printf '   %s%s\n' "${1:-}" "$l"; done; return 0; }

# Installs $SRC/<path> to /<path> with a mode and owner, reporting only real changes.
put() { # $1 mode, $2 owner:group, $3 path relative to /
  local mode=$1 og=$2 rel=$3 dst=/$3
  if [[ -f $dst ]] && cmp -s -- "$SRC/$rel" "$dst" \
     && [[ $(stat -c '%a %U:%G' -- "$dst") == "${mode#0} $og" ]]; then
    return 0
  fi
  install -D -m "$mode" -o "${og%%:*}" -g "${og##*:}" -- "$SRC/$rel" "$dst"
  note "installed $dst ($mode $og)"
}

# ---------------------------------------------------------------------------------------
step "Checking prerequisites"
[[ $EUID -eq 0 ]] || die "run with sudo"
[[ -x /usr/bin/rrsync ]] || die "/usr/bin/rrsync not found"
# rrsync -munge needs rsync 3.2.4 or later.
rsync_version=$(rsync --version | awk 'NR == 1 { print $3 }')
[[ $(printf '%s\n3.2.4\n' "$rsync_version" | sort -V | head -n1) == 3.2.4 ]] || die "rsync $rsync_version is too old for rrsync -munge (needs 3.2.4+)"
grep -q -- 'munge' /usr/bin/rrsync || die "/usr/bin/rrsync has no -munge option"
[[ -x $PGBIN/pg_dump && -x $PGBIN/pg_restore && -x $PGBIN/psql ]] || die "PostgreSQL 16 client tools not found in $PGBIN"
command -v nginx >/dev/null || die "nginx not found"
command -v visudo >/dev/null || die "visudo not found"
[[ -r /etc/ssl/cloudflare/jeffgicharu.com.pem && -r /etc/ssl/cloudflare/jeffgicharu.com.key ]] || die "origin certificate not found"
[[ $(sysctl -n fs.protected_hardlinks) == 1 ]] || die "fs.protected_hardlinks must be 1 (the release freeze relies on it)"
for port in 9000 9001; do
  if ss -Hltn "sport = :$port" | grep -q . && ! systemctl is-active --quiet "tenuro@$([[ $port == 9000 ]] && echo blue || echo green)"; then
    die "port $port is in use by something other than Tenuro"
  fi
done
if [[ -n $UPLOAD_KEY || -n $ACTIVATE_KEY ]]; then
  [[ -n $UPLOAD_KEY && -n $ACTIVATE_KEY ]] || die "give both --upload-key and --activate-key"
  for k in "$UPLOAD_KEY" "$ACTIVATE_KEY"; do
    [[ $(grep -c . "$k") == 1 ]] || die "$k must hold exactly one key line"
    grep -Eq '^ssh-ed25519 [A-Za-z0-9+/=]+( [^"]*)?$' "$k" || die "$k is not a plain ed25519 public key"
    ssh-keygen -l -f "$k" >/dev/null || die "$k is not a valid public key"
  done
  [[ $(cut -d' ' -f2 "$UPLOAD_KEY") != "$(cut -d' ' -f2 "$ACTIVATE_KEY")" ]] || die "the two keys must differ"
fi
note "ok"

# ---------------------------------------------------------------------------------------
step "Groups and users"
for g in tenuro tenuro-ops; do
  getent group "$g" >/dev/null || { groupadd --system "$g"; note "created group $g"; }
done
mkuser() { # $1 user, $2 supplementary groups
  if ! id "$1" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /nonexistent --no-create-home \
      --shell /usr/sbin/nologin ${2:+--groups "$2"} "$1"
    note "created user $1"
  elif [[ -n $2 ]]; then
    usermod -a -G "$2" "$1"
  fi
}
mkuser tenuro-blue tenuro
mkuser tenuro-green tenuro
mkuser tenuro-jobs tenuro,tenuro-ops
mkuser tenuro-backup tenuro-ops
if ! id tenuro-ci >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /var/lib/tenuro-ci --no-create-home --shell /bin/sh tenuro-ci
  note "created user tenuro-ci"
fi
# No password, but not "locked": sshd refuses key logins for locked accounts when UsePAM is off.
usermod -p '*' tenuro-ci

# ---------------------------------------------------------------------------------------
step "Folders"
install -d -m 755 -o root -g root /srv/tenuro /srv/tenuro/releases /srv/tenuro/slots \
  /srv/tenuro/assets /srv/tenuro/fallback /etc/nginx/tenuro /usr/local/lib/tenuro
install -d -m 711 -o root -g root /srv/tenuro/shared
install -d -m 700 -o root -g root /srv/tenuro/state /srv/tenuro/staging
install -d -m 750 -o tenuro-ci -g tenuro-ci /srv/tenuro/incoming
[[ $(stat -c %d /srv/tenuro/incoming) == "$(stat -c %d /srv/tenuro/staging)" &&
   $(stat -c %d /srv/tenuro/staging) == "$(stat -c %d /srv/tenuro/releases)" ]] ||
  die "incoming/, staging/ and releases/ must be on one filesystem (activation renames between them)"
install -d -m 755 -o tenuro-ci -g tenuro-ci /var/lib/tenuro-ci
install -d -m 755 -o root -g root /var/lib/tenuro-ci/.ssh
note "ok"

# ---------------------------------------------------------------------------------------
step "Scripts, units and static files"
put 0755 root:root usr/local/sbin/tenuro-activate
put 0755 root:root usr/local/sbin/tenuro-activate-ssh
put 0755 root:root usr/local/sbin/tenuro-retire
put 0755 root:root usr/local/sbin/tenuro-boot
put 0755 root:root usr/local/lib/tenuro/backup.sh
put 0755 root:root usr/local/lib/tenuro/restore-test.sh
put 0700 root:root usr/local/lib/tenuro/gen-secrets
put 0644 root:root srv/tenuro/shared/slot-blue.env
put 0644 root:root srv/tenuro/shared/slot-green.env
put 0644 root:root srv/tenuro/fallback/unavailable.html
for u in tenuro@.service tenuro-migrate@.service tenuro-smoke@.service \
         tenuro-reset.service tenuro-reset.timer tenuro-backup.service tenuro-backup.timer \
         tenuro-restore-test.service tenuro-restore-test.timer tenuro-boot.service \
         tenuro-incoming-sweep.service tenuro-incoming-sweep.timer; do
  put 0644 root:root "etc/systemd/system/$u"
done

# ---------------------------------------------------------------------------------------
step "sudoers (checked with visudo before install)"
tmp=$(mktemp)
trap 'rm -f -- "$tmp"' EXIT
cp -- "$SRC/etc/sudoers.d/tenuro-ci" "$tmp"
visudo -cqf "$tmp" || die "sudoers file failed visudo -c"
if ! cmp -s -- "$tmp" /etc/sudoers.d/tenuro-ci; then
  install -m 0440 -o root -g root -- "$tmp" /etc/sudoers.d/tenuro-ci
  note "installed /etc/sudoers.d/tenuro-ci"
fi
visudo -cq || die "sudoers as a whole failed visudo -c"

# ---------------------------------------------------------------------------------------
step "Deploy keys"
if [[ -n $UPLOAD_KEY ]]; then
  {
    grep '^#' "$SRC/var/lib/tenuro-ci/.ssh/authorized_keys.template"
    printf 'restrict,command="/usr/bin/rrsync -wo -munge /srv/tenuro/incoming" %s\n' "$(cat -- "$UPLOAD_KEY")"
    printf 'restrict,command="/usr/local/sbin/tenuro-activate-ssh" %s\n' "$(cat -- "$ACTIVATE_KEY")"
  } >"$tmp"
  install -m 0644 -o root -g root -- "$tmp" /var/lib/tenuro-ci/.ssh/authorized_keys
  note "installed /var/lib/tenuro-ci/.ssh/authorized_keys (2 forced-command keys)"
elif [[ -f /var/lib/tenuro-ci/.ssh/authorized_keys ]]; then
  note "kept existing authorized_keys"
else
  note "no keys given yet; re-run with --upload-key and --activate-key"
fi

# ---------------------------------------------------------------------------------------
step "PostgreSQL roles and databases"
runuser -u postgres -- "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -d postgres <<'SQL'
SELECT format('CREATE ROLE %I LOGIN CONNECTION LIMIT %s', r, l)
  FROM (VALUES ('tenuro', 6), ('tenuro_app', 14)) AS v(r, l)
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec
ALTER ROLE tenuro     NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 6;
ALTER ROLE tenuro_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 14;
SELECT format('CREATE DATABASE %I OWNER tenuro', d)
  FROM (VALUES ('tenuro'), ('tenuro_restore_test')) AS v(d)
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = d) \gexec
REVOKE ALL ON DATABASE tenuro, tenuro_restore_test FROM PUBLIC;
GRANT CONNECT ON DATABASE tenuro TO tenuro_app;
SQL
note "roles tenuro (limit 6) and tenuro_app (limit 14); databases tenuro and tenuro_restore_test"

# ---------------------------------------------------------------------------------------
step "Secrets"
if [[ -e /srv/tenuro/shared/app.env && -e /srv/tenuro/shared/ops.env ]]; then
  note "env files already exist; left untouched"
elif [[ -e /srv/tenuro/shared/app.env || -e /srv/tenuro/shared/ops.env ]]; then
  die "only one of app.env / ops.env exists; fix by hand before continuing"
else
  /usr/local/lib/tenuro/gen-secrets | indent
fi

# ---------------------------------------------------------------------------------------
step "nginx (tested with nginx -t before reload)"
if [[ ! -e /etc/nginx/tenuro/active-slot.conf ]]; then
  install -m 0644 -o root -g root -- "$SRC/etc/nginx/tenuro/active-slot.conf" /etc/nginx/tenuro/active-slot.conf
  note "installed initial /etc/nginx/tenuro/active-slot.conf (blue)"
fi
# On failure this puts back the previous site file (or removes a new one) and re-tests, so a
# bad file never stays in place for the shared nginx's next reload.
rc=0
install_nginx_site "$SRC/etc/nginx/sites-available/$SITE" /etc/nginx/sites-available \
  /etc/nginx/sites-enabled "$SITE" || rc=$?
case $rc in
  0) note "site installed and enabled; nginx -t passed" ;;
  1) die "nginx -t failed with the new site file; the previous state was restored and nginx was not reloaded" ;;
  *) die "nginx -t fails even after restoring the previous state; nginx was not reloaded" ;;
esac
if ((RELOAD)); then
  systemctl reload nginx
  note "nginx reloaded"
else
  note "nginx -t passed; reload skipped (--no-reload)"
fi

# ---------------------------------------------------------------------------------------
step "systemd"
systemctl daemon-reload
systemd-analyze verify tenuro-backup.service tenuro-restore-test.service tenuro-reset.service \
  tenuro@blue.service tenuro@green.service tenuro-migrate@blue.service tenuro-smoke@blue.service \
  tenuro-boot.service tenuro-incoming-sweep.service 2>&1 | indent "verify: " || true
systemctl enable --now tenuro-backup.timer tenuro-restore-test.timer tenuro-reset.timer tenuro-incoming-sweep.timer
systemctl enable --quiet tenuro-boot.service
note "timers enabled; tenuro-boot enabled for boot (it does nothing until the first activation)"
note "tenuro@blue and tenuro@green are enabled and started only by tenuro-activate and tenuro-boot"

step "Done"
note "Next: add DNS, then the first CI deploy activates release <sha> on the blue slot."
