#!/usr/bin/env bash
# Reports whether PR $1 is open and the only open PR holding the `staging` label.
# If $2 is set, the PR head must also still equal that SHA.
# Needs GH_TOKEN and REPO. Always exits 0 on a definite answer; the caller decides
# whether a non-holder is fatal. Prints key=value lines for $GITHUB_OUTPUT:
# is_holder, reason (empty when holder), state, holders, head_sha, head_ref.
set -euo pipefail

PR="${1:?pr number required}"
EXPECTED_SHA="${2:-}"

read -r STATE HEAD_SHA HEAD_REF < <(gh pr view "$PR" --repo "$REPO" \
  --json state,headRefOid,headRefName --jq '[.state, .headRefOid, .headRefName] | @tsv')
HOLDERS=$(gh pr list --repo "$REPO" --label staging --state open --json number \
  --jq '[.[].number | tostring] | join(",")')

REASON=""
if [[ "$STATE" != "OPEN" || "$HOLDERS" != "$PR" ]]; then
  REASON="PR #$PR is not the single open PR holding the staging label (state: $STATE, holders: ${HOLDERS:-none})"
elif [[ -n "$EXPECTED_SHA" && "$HEAD_SHA" != "$EXPECTED_SHA" ]]; then
  REASON="PR #$PR head moved from $EXPECTED_SHA to $HEAD_SHA"
fi

echo "is_holder=$([[ -z "$REASON" ]] && echo true || echo false)"
echo "reason=$REASON"
echo "state=$STATE"
echo "holders=$HOLDERS"
echo "head_sha=$HEAD_SHA"
echo "head_ref=$HEAD_REF"
