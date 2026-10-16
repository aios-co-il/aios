#!/usr/bin/env bash
# Usage: main-missing-from.sh <ref>
# Lists `origin/main` commits with no patch-equivalent in <ref> (`git cherry` marks them "+").
# Exit 1 if any are missing. History is linear and SHAs differ after rebase-merges, so
# ancestry is the wrong test between main and develop.
set -euo pipefail
ref=${1:?usage: main-missing-from.sh <ref>}
git fetch --no-tags origin main
missing=$(git cherry "$ref" origin/main | grep '^+' || true)
[ -z "$missing" ] && exit 0
echo "main has commits with no equivalent in ${ref}:"
echo "$missing" | while read -r _ sha; do git log -1 --format='  %h %s' "$sha"; done
exit 1
