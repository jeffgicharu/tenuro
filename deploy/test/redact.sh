#!/bin/bash
# Checks the redaction applied to journal lines before tenuro-activate prints them into the
# (public) CI log: secrets are hidden, stack traces and ordinary messages are kept.
#   deploy/test/redact.sh
set -uo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
script=$here/../server/usr/local/sbin/tenuro-activate
eval "$(awk '/^redact\(\) \{/,/^\}/' "$script")"

pass=0 fail=0
check() {
  local name=$1 input=$2 want=$3 got
  got=$(printf '%s\n' "$input" | redact)
  if [[ $got == "$want" ]]; then pass=$((pass + 1)); else fail=$((fail + 1)); printf 'FAIL %s\n  got:  %s\n  want: %s\n' "$name" "$got" "$want"; fi
}

check "connection string" 'connect ECONNREFUSED postgresql://tenuro_app:hunter2@127.0.0.1:5432/tenuro' 'connect ECONNREFUSED [redacted url]'
check "uppercase scheme" 'POSTGRES://u:p@h/db' '[redacted url]'
check "secret-named variables" 'PGPASSWORD=abc SESSION_SECRET=xyz PORT=9000' 'PGPASSWORD=[redacted] SESSION_SECRET=[redacted] PORT=9000'
check "api keys" 'upload_key=AAAA api_token=zz' 'upload_key=[redacted] api_token=[redacted]'
check "long hex" 'token 0123456789abcdef0123456789abcdef99 end' 'token [redacted hex] end'
check "short hex is kept" 'pid 1a2b3c' 'pid 1a2b3c'
check "stack traces are kept" '    at main (file:///srv/tenuro/slots/blue/server/smoke.mjs:18212:5)' '    at main (file:///srv/tenuro/slots/blue/server/smoke.mjs:18212:5)'
check "plain messages are kept" 'Error: SESSION_SECRET is not set' 'Error: SESSION_SECRET is not set'

printf '\n%d passed, %d failed\n' "$pass" "$fail"
((fail == 0))
