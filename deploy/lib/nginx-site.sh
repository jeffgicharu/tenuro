#!/bin/bash
# Sourced by deploy/install.sh (and deploy/test/install-nginx.sh).
#
# install_nginx_site <source file> <sites-available dir> <sites-enabled dir> <name>
#   Installs the site file and enables it, then runs nginx -t. If the test fails, it puts
#   back exactly what was there before (the previous file, or no file and no link) and runs
#   nginx -t again, so a bad update never stays in place for the next reload of the shared
#   nginx. Returns 0 on success, 1 if the new site failed (previous state restored), and 2
#   if nginx -t still fails after restoring, which means something else is broken.
install_nginx_site() {
  local src=$1 avail=$2 enabled=$3 name=$4
  local dst=$avail/$name link=$enabled/$name backup='' existed=0 linked=0
  if [[ -e $dst ]]; then
    existed=1
    if ! cmp -s -- "$src" "$dst"; then
      backup=$(mktemp)
      cp -p -- "$dst" "$backup"
    fi
  fi
  if ((!existed)) || [[ -n $backup ]]; then
    install -m 0644 -- "$src" "$dst.new"
    mv -f -- "$dst.new" "$dst"
  fi
  if [[ ! -L $link ]]; then
    ln -s -- "$dst" "$link"
    linked=1
  fi

  if nginx -t -q 2>/dev/null; then
    [[ -n $backup ]] && rm -f -- "$backup"
    return 0
  fi

  echo "nginx -t failed with the new $name; restoring the previous state" >&2
  nginx -t 2>&1 | while IFS= read -r l; do printf '   nginx: %s\n' "$l" >&2; done
  if [[ -n $backup ]]; then
    mv -f -- "$backup" "$dst"
  elif ((!existed)); then
    rm -f -- "$dst"
  fi
  ((linked)) && rm -f -- "$link"
  if nginx -t -q 2>/dev/null; then
    return 1
  fi
  echo "nginx -t still fails after restoring; the problem is outside $name" >&2
  return 2
}
