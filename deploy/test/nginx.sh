#!/bin/bash
# shellcheck disable=SC2016,SC2034  # t() evals its condition later, so the quotes and "unused" variables are deliberate
# Runs the real nginx site file on high loopback ports against a tiny backend and checks its
# behaviour. Only machine paths (certificate, logs, snippet, /srv/tenuro) are redirected into a
# temp prefix, and IPv6 listens are dropped for runners without IPv6.
#   deploy/test/nginx.sh
set -uo pipefail
command -v nginx >/dev/null || { echo "nginx not installed" >&2; exit 1; }
src=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../server" && pwd)
P=$(mktemp -d)
BPID=''
cleanup() {
  [[ -n $BPID ]] && kill "$BPID" 2>/dev/null
  [[ -f $P/nginx.pid ]] && nginx -p "$P" -c "$P/conf/nginx.conf" -e "$P/logs/error.log" -s stop 2>/dev/null
  sleep 0.3; rm -rf -- "$P"
}
trap cleanup EXIT

mkdir -p "$P"/{logs,conf,ssl,tenuro,srv/fallback,srv/assets,srv/slots/rel/public/static}
openssl req -x509 -newkey rsa:2048 -nodes -subj /CN=tenuro.test -days 1 \
  -keyout "$P/ssl/k.key" -out "$P/ssl/c.pem" 2>/dev/null
cp "$src/srv/tenuro/fallback/unavailable.html" "$P/srv/fallback/"
echo 'console.log("pool")' >"$P/srv/assets/app-abc.js"
echo 'User-agent: *' >"$P/srv/slots/rel/public/static/robots.txt"
ln -s rel "$P/srv/slots/blue"
# shellcheck disable=SC2016  # nginx variables are literal text
printf 'set $tenuro_slot blue;\nset $tenuro_port 19000;\n' >"$P/tenuro/active-slot.conf"

python3 - "$src/etc/nginx/sites-available/tenuro.jeffgicharu.com" "$P" <<'PY'
import sys
site, p = sys.argv[1], sys.argv[2]
s = open(site).read()
for a, b in [("/etc/ssl/cloudflare/jeffgicharu.com.pem", f"{p}/ssl/c.pem"),
             ("/etc/ssl/cloudflare/jeffgicharu.com.key", f"{p}/ssl/k.key"),
             ("/etc/nginx/tenuro/active-slot.conf", f"{p}/tenuro/active-slot.conf"),
             ("/var/log/nginx/", f"{p}/logs/"),
             ("/srv/tenuro/fallback", f"{p}/srv/fallback"),
             ("/srv/tenuro/slots/", f"{p}/srv/slots/"),
             ("root /srv/tenuro;", f"root {p}/srv;")]:
    assert a in s, a
    s = s.replace(a, b)
s = "\n".join(l for l in s.split("\n") if "listen [::]" not in l)
# Test only: a second loopback address stands in for Cloudflare.
s = s.replace("real_ip_header CF-Connecting-IP;", "real_ip_header CF-Connecting-IP;\n    set_real_ip_from 127.0.0.2;")
s = s.replace("listen 80;", "listen 127.0.0.1:18080;").replace("listen 443 ssl", "listen 127.0.0.1:18443 ssl")
open(f"{p}/conf/site.conf", "w").write(s)
open(f"{p}/conf/nginx.conf", "w").write(f"""pid {p}/nginx.pid;
error_log {p}/logs/error.log;
events {{}}
http {{
  access_log {p}/logs/access.log;
  client_body_temp_path {p}/tmp_body; proxy_temp_path {p}/tmp_proxy;
  fastcgi_temp_path {p}/tmp_fcgi; uwsgi_temp_path {p}/tmp_uwsgi; scgi_temp_path {p}/tmp_scgi;
  include {p}/conf/site.conf;
}}
""")
PY

pass=0 fail=0
t() { if eval "$2"; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1"; fi; }

nginx -t -q -p "$P" -c "$P/conf/nginx.conf" -e "$P/logs/error.log"; rc=$?
t "nginx -t passes" '[ $rc = 0 ]'
nginx -p "$P" -c "$P/conf/nginx.conf" -e "$P/logs/error.log" 2>/dev/null || { echo "nginx failed to start" >&2; exit 1; }

H=(-sk --resolve tenuro.jeffgicharu.com:18443:127.0.0.1)
CF=(-sk --interface 127.0.0.2 --resolve tenuro.jeffgicharu.com:18443:127.0.0.1)
U=https://tenuro.jeffgicharu.com:18443

echo "-- app down"
code=$(curl "${H[@]}" -o "$P/body" -D "$P/hdr" -w '%{http_code}' "$U/leases")
t "app down gives 503" '[ "$code" = 503 ]'
t "Retry-After present" 'grep -qi "^retry-after: 120" "$P/hdr"'
t "fallback page served" 'grep -q "Tenuro is briefly unavailable" "$P/body"'
t "fallback noindex header" 'grep -qi "^x-robots-tag: noindex" "$P/hdr"'
t "fallback CSP pins its stylesheet" 'grep -qi "^content-security-policy: default-src .none.; style-src .sha256-" "$P/hdr"'
code=$(curl "${H[@]}" -o /dev/null -w '%{http_code}' "$U/unavailable.html")
t "fallback is internal only" '[ "$code" != 200 ]'

echo "-- static"
code=$(curl "${H[@]}" -o "$P/body" -D "$P/hdr" -w '%{http_code}' "$U/assets/app-abc.js")
t "pooled asset served" '[ "$code" = 200 ] && grep -q pool "$P/body"'
t "immutable caching" 'grep -qi "cache-control: public, max-age=31536000, immutable" "$P/hdr"'
code=$(curl "${H[@]}" -o /dev/null -w '%{http_code}' "$U/assets/missing.js")
t "missing asset is a 404, not the app" '[ "$code" = 404 ]'
code=$(curl "${H[@]}" -o "$P/body" -w '%{http_code}' "$U/robots.txt")
t "robots.txt comes from the active slot" '[ "$code" = 200 ] && grep -q "User-agent" "$P/body"'
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: tenuro.jeffgicharu.com' http://127.0.0.1:18080/x)
t "port 80 redirects" '[ "$code" = 301 ]'

echo "-- app up"
python3 - <<'PY' &
import http.server, json
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self):
        n = int(self.headers.get("content-length") or 0)
        if n: self.rfile.read(n)
        body = json.dumps({"path": self.path, "xff": self.headers.get("x-forwarded-for")}).encode()
        self.send_response(200); self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body)
    do_GET = do_POST = _send
http.server.ThreadingHTTPServer(("127.0.0.1", 19000), H).serve_forever()
PY
BPID=$!
sleep 0.7
code=$(curl "${H[@]}" -o "$P/body" -w '%{http_code}' "$U/graphql" -d '{}' -H 'content-type: application/json')
t "graphql reaches the slot's port" '[ "$code" = 200 ] && grep -q "\"/graphql\"" "$P/body"'
codes=$(for _ in $(seq 30); do curl "${H[@]}" -o /dev/null -w '%{http_code}\n' -X POST "$U/api/session" -d x; done | sort | uniq -c | tr '\n' ' ')
t "loopback is never rate limited ($codes)" '! grep -q 429 <<<"$codes"'
codes=$(for _ in $(seq 12); do curl "${CF[@]}" -o /dev/null -w '%{http_code}\n' -X POST -H 'CF-Connecting-IP: 203.0.113.9' "$U/api/session" -d x; done | sort | uniq -c | tr '\n' ' ')
t "a visitor via Cloudflare is limited after the burst ($codes)" 'grep -q 429 <<<"$codes"'
out=$(curl "${CF[@]}" -H 'CF-Connecting-IP: 198.51.100.7' "$U/graphql" -d '{}')
t "the app sees the visitor's address" 'grep -q "198.51.100.7" <<<"$out"'
out=$(curl "${H[@]}" -H 'CF-Connecting-IP: 198.51.100.7' "$U/graphql" -d '{}')
t "CF-Connecting-IP from outside Cloudflare is ignored" '! grep -q "198.51.100.7" <<<"$out"'
head -c 20000 /dev/zero >"$P/big"
code=$(curl "${H[@]}" -o /dev/null -w '%{http_code}' -X POST --data-binary @"$P/big" "$U/api/vitals")
t "vitals body over 16 KB refused" '[ "$code" = 413 ]'
code=$(curl "${H[@]}" -o /dev/null -w '%{http_code}' -X POST --data-binary @"$P/big" "$U/api/csp-report")
t "csp-report body over 16 KB refused" '[ "$code" = 413 ]'
head -c 3000000 /dev/zero >"$P/big"
code=$(curl "${H[@]}" -o /dev/null -w '%{http_code}' -X POST --data-binary @"$P/big" "$U/graphql")
t "graphql body over 2 MB refused" '[ "$code" = 413 ]'
code=$(curl "${H[@]}" -o /dev/null -w '%{http_code}' -X POST --data-binary @"$P/big" "$U/api/uploads")
t "a 3 MB upload is accepted on /api/uploads" '[ "$code" = 200 ]'

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" = 0 ]
