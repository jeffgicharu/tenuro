#!/bin/bash
# Exercises install_nginx_site from deploy/lib/nginx-site.sh with a stub nginx whose -t fails
# whenever an enabled site contains the word BROKEN.
#   deploy/test/install-nginx.sh
set -uo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/lib/nginx-site.sh
. "$HERE/../lib/nginx-site.sh"

T=$(mktemp -d)
trap 'rm -rf -- "$T"' EXIT
mkdir -p "$T/bin"
cat >"$T/bin/nginx" <<'EOF'
#!/bin/bash
[[ $1 == -t ]] || exit 0
for f in "$STUB_ENABLED"/*; do [[ -e $f ]] && grep -q BROKEN "$f" && exit 1; done
exit 0
EOF
chmod +x "$T/bin/nginx"
export PATH="$T/bin:$PATH"

pass=0 fail=0
ok() { local d=$1; shift; if "$@"; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL $d"; fi; }
fresh() {
  rm -rf -- "$T/avail" "$T/enabled"; mkdir -p "$T/avail" "$T/enabled"
  export STUB_ENABLED=$T/enabled
}
printf 'server { good v1 }\n' >"$T/good1"
printf 'server { good v2 }\n' >"$T/good2"
printf 'server { BROKEN }\n' >"$T/bad"
SITE=tenuro.jeffgicharu.com

echo "fresh install of a good site"
fresh
install_nginx_site "$T/good1" "$T/avail" "$T/enabled" "$SITE" 2>/dev/null; rc=$?
ok "returns 0" test "$rc" -eq 0
ok "file installed" cmp -s "$T/good1" "$T/avail/$SITE"
ok "file is 0644" test "$(stat -c %a "$T/avail/$SITE")" = 644
ok "site enabled" test -L "$T/enabled/$SITE"

echo "re-run with the same file"
install_nginx_site "$T/good1" "$T/avail" "$T/enabled" "$SITE" 2>/dev/null; rc=$?
ok "returns 0" test "$rc" -eq 0
ok "still the same file" cmp -s "$T/good1" "$T/avail/$SITE"

echo "a good update"
install_nginx_site "$T/good2" "$T/avail" "$T/enabled" "$SITE" 2>/dev/null; rc=$?
ok "returns 0" test "$rc" -eq 0
ok "updated" cmp -s "$T/good2" "$T/avail/$SITE"

echo "an update that fails nginx -t is rolled back"
install_nginx_site "$T/bad" "$T/avail" "$T/enabled" "$SITE" 2>/dev/null; rc=$?
ok "returns 1" test "$rc" -eq 1
ok "previous file restored" cmp -s "$T/good2" "$T/avail/$SITE"
ok "still enabled" test -L "$T/enabled/$SITE"
ok "nginx -t passes again" nginx -t
ok "no stray .new file" test ! -e "$T/avail/$SITE.new"

echo "a fresh install that fails nginx -t leaves nothing behind"
fresh
install_nginx_site "$T/bad" "$T/avail" "$T/enabled" "$SITE" 2>/dev/null; rc=$?
ok "returns 1" test "$rc" -eq 1
ok "no site file" test ! -e "$T/avail/$SITE"
ok "no link" test ! -L "$T/enabled/$SITE"
ok "nginx -t passes again" nginx -t

echo "something else already broken: reported as such, our previous state kept"
fresh
install_nginx_site "$T/good1" "$T/avail" "$T/enabled" "$SITE" 2>/dev/null
printf 'server { BROKEN other site }\n' >"$T/enabled/other.example"
install_nginx_site "$T/good2" "$T/avail" "$T/enabled" "$SITE" 2>/dev/null; rc=$?
ok "returns 2" test "$rc" -eq 2
ok "our previous file kept" cmp -s "$T/good1" "$T/avail/$SITE"
ok "our existing link kept" test -L "$T/enabled/$SITE"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
((fail == 0))
