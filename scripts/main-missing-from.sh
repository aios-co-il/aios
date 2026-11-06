#!/usr/bin/env bash
# Usage: main-missing-from.sh <ref>
# Lists `origin/main` commits with no patch-equivalent in <ref> (`git cherry` marks them "+").
# Exit 1 if any are missing. History is linear and SHAs differ after rebase-merges, so
# ancestry is the wrong test between main and develop.
# A hotfix of several commits reaches develop through the squash merge queue as one commit,
# so a run of consecutive main commits also counts as present when its combined patch
# equals a commit in <ref> (AIO-412: #1141 on main, #1142 squashed on develop).
set -euo pipefail
ref=${1:?usage: main-missing-from.sh <ref>}
git fetch --no-tags origin main
missing=$(git cherry "$ref" origin/main | awk '$1 == "+" { print $2 }')
[ -z "$missing" ] && exit 0

# A port can sit before the merge base once a release merge brings it into main too, so
# compare against every commit in <ref> since the oldest missing main commit was written.
oldest=$(echo "$missing" | tail -n1)
since=$(git log -1 --format=%cI "$oldest")
ref_ids=$(git log --no-merges --since="$since" --format=%H "$ref" | while read -r c; do
  git show "$c" | git patch-id --stable
done | awk '{ print $1 }')

still=""
run=""
# Checks the current run of consecutive missing commits as one patch.
check_run() {
  [ -z "$run" ] && return 0
  local first last id
  first=$(sed -n '/./{p;q;}' <<<"$run")
  last=$(sed '/^$/d' <<<"$run" | sed -n '$p')
  id=$(git diff "$first^" "$last" | git patch-id --stable | awk '{ print $1 }')
  if [ -z "$id" ] || ! grep -qxF "$id" <<<"$ref_ids"; then
    still="${still}${run}"$'\n'
  fi
}

prev=""
for sha in $missing; do
  if [ -n "$prev" ] && [ "$(git rev-parse "$sha^")" = "$prev" ]; then
    run="${run}${sha}"$'\n'
  else
    check_run
    run="${sha}"$'\n'
  fi
  prev=$sha
done
check_run

still=$(echo "$still" | sed '/^$/d')
[ -z "$still" ] && exit 0
echo "main has commits with no equivalent in ${ref}:"
echo "$still" | while read -r sha; do git log -1 --format='  %h %s' "$sha"; done
exit 1
