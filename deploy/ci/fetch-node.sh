#!/bin/bash
# Downloads the pinned official Node build, checks it against both the pinned sha256 and
# nodejs.org's SHASUMS256.txt, and writes <out>/bin/node, <out>/LICENSE and <out>/SHA256.
# Only the binary is kept: the tarball's npm/npx/corepack symlinks would be rejected on the server.
#   deploy/ci/fetch-node.sh <out dir>
set -euo pipefail

out=${1:?usage: fetch-node.sh <out dir>}
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/ci/node.env
. "$here/node.env"
name=node-v$NODE_VERSION-linux-x64
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

curl -fsSL --proto '=https' --tlsv1.2 -o "$work/$name.tar.xz" "https://nodejs.org/dist/v$NODE_VERSION/$name.tar.xz"
curl -fsSL --proto '=https' --tlsv1.2 -o "$work/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"

published=$(grep -E "  $name\.tar\.xz$" "$work/SHASUMS256.txt" | cut -d' ' -f1)
actual=$(sha256sum "$work/$name.tar.xz" | cut -d' ' -f1)
[[ $published == "$NODE_TARBALL_SHA256" ]] || { echo "SHASUMS256.txt disagrees with the pinned sha256" >&2; exit 1; }
[[ $actual == "$NODE_TARBALL_SHA256" ]] || { echo "downloaded tarball does not match the pinned sha256" >&2; exit 1; }

tar -xJf "$work/$name.tar.xz" -C "$work" "$name/bin/node" "$name/LICENSE"
mkdir -p "$out/bin"
install -m 0755 "$work/$name/bin/node" "$out/bin/node"
install -m 0644 "$work/$name/LICENSE" "$out/LICENSE"
sha256sum "$out/bin/node" | cut -d' ' -f1 >"$out/SHA256"
echo "node v$NODE_VERSION: bin/node sha256 $(cat "$out/SHA256")"
