#!/usr/bin/env bash
# Run inside a clone of davidcastelnuovo/aios with a clean working tree and
# push access that includes the `workflow` scope (your normal git credentials).
# Recreates the four rebased PR branches from the patches and force-pushes them.
set -euo pipefail

HOLD=claude/sweet-cerf-m23x82
BASE_SHA=4903f5a27a09a9851b94748c615d1385d175eaab   # develop the patches were made against
BRANCHES=(
  fix/aio-106-webhook-payload-schema
  fix/aio-94-runtime-contracts
  fix/aio-99-agent-profile-types
  fix/aio-106-manus-webhook-types
)

[ -z "$(git status --porcelain)" ] || { echo "Working tree not clean" >&2; exit 1; }
git fetch origin develop "$HOLD" "${BRANCHES[@]}"
start=$(git rev-parse --abbrev-ref HEAD)

for b in "${BRANCHES[@]}"; do
  echo "== $b"
  old=$(git rev-parse "origin/$b")
  git checkout -q -B "$b" "$BASE_SHA"
  git show "origin/$HOLD:rebased-patches/${b//\//_}.patch" | git am --quiet
  # Lease pinned to the remote tip we just fetched, so nothing newer is overwritten.
  git push --force-with-lease="$b:$old" origin "$b"
done

git checkout -q "$start"
echo "Done. Pushed: ${BRANCHES[*]}"
