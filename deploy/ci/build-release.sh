#!/bin/bash
# Assembles the release folder the server expects, from the outputs of `pnpm build`.
#   deploy/ci/build-release.sh <40-character sha> <out dir>
#
# Build contract (paths relative to the repo root):
#   apps/api/dist/index.mjs       the server; `index.mjs --selfcheck` must run offline and exit 0
#   apps/api/dist/migrate.mjs     expand-only migrations, run as the owner role
#   apps/api/dist/smoke.mjs       journey checks against $PORT; `--selfcheck` also runs the offline self-check
#   apps/api/dist/rebuild.mjs     the nightly data rebuild
#   apps/api/dist/ops/smoke-query.json   a persisted-query request body the activation script posts to /graphql
#   apps/web/dist/                the SPA build; index.html becomes the server's template (it is never served as a file)
#   packages/ui/storybook-static/ optional; published at /storybook/
#
# Release layout:
#   REVISION  runtime/{bin/node,LICENSE,SHA256}  server/  server/web/index.html  public/  ops/
set -euo pipefail

sha=${1:?usage: build-release.sh <sha> <out dir>}
out=${2:?usage: build-release.sh <sha> <out dir>}
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo "not a 40-character sha: $sha" >&2; exit 1; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"

need() { [[ -e $1 ]] || { echo "build output missing: $1" >&2; exit 1; }; }
for f in apps/api/dist/index.mjs apps/api/dist/migrate.mjs apps/api/dist/smoke.mjs \
         apps/api/dist/rebuild.mjs apps/api/dist/ops/smoke-query.json apps/web/dist/index.html; do
  need "$f"
done

rm -rf -- "$out"
mkdir -p "$out"/{server/web,public,ops}
printf '%s\n' "$sha" >"$out/REVISION"

cp -R apps/api/dist/. "$out/server/"
rm -rf -- "$out/server/ops"
cp apps/api/dist/ops/smoke-query.json "$out/ops/smoke-query.json"

cp -R apps/web/dist/. "$out/public/"
mv "$out/public/index.html" "$out/server/web/index.html"
if [[ -d packages/ui/storybook-static ]]; then
  cp -R packages/ui/storybook-static "$out/public/storybook"
fi

"$root/deploy/ci/fetch-node.sh" "$out/runtime"

# The server rejects these at activation; fail here first with a clearer message.
if find "$out" -type l | grep -q .; then
  echo "release contains symlinks:" >&2; find "$out" -type l >&2; exit 1
fi
if find "$out" -type f -links +1 | grep -q .; then
  echo "release contains hardlinked files" >&2; exit 1
fi
if find "$out" \( -name '*.node' -o -name 'binding.gyp' \) | grep -q .; then
  echo "release contains native addons; the server CPU can't be trusted to run them" >&2
  find "$out" \( -name '*.node' -o -name 'binding.gyp' \) >&2
  exit 1
fi

du -sh "$out" | cut -f1 | xargs printf 'release %s assembled: %s\n' "$sha"
