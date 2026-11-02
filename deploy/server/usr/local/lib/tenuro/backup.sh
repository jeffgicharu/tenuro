#!/bin/bash
# Nightly dump of the tenuro database. Runs as tenuro-backup; PG* variables come from ops.env.
set -euo pipefail
umask 077

readonly PGBIN=/usr/lib/postgresql/16/bin
readonly DIR=/var/lib/tenuro-backup
readonly KEEP=10

stamp=$(date -u +%Y%m%dT%H%M%SZ)
tmp="$DIR/.tenuro-$stamp.partial"
trap 'rm -f -- "$tmp"' EXIT

start=$(date +%s)
# Privileges are kept so a restore into the live database gives tenuro_app its grants back.
"$PGBIN/pg_dump" --format=custom --compress=6 --no-owner --file="$tmp"
# The archive must at least list cleanly before it replaces anything.
"$PGBIN/pg_restore" --list "$tmp" >/dev/null
mv -f -- "$tmp" "$DIR/tenuro-$stamp.dump"
trap - EXIT

find "$DIR" -maxdepth 1 -name 'tenuro-*.dump' -printf '%T@ %p\n' \
  | sort -rn | tail -n +$((KEEP + 1)) | cut -d' ' -f2- \
  | while IFS= read -r old; do rm -f -- "$old"; done

size=$(stat -c %s "$DIR/tenuro-$stamp.dump")
echo "backup ok: tenuro-$stamp.dump, ${size} bytes, $(( $(date +%s) - start ))s"
