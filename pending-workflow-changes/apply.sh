#!/usr/bin/env bash
# Applies the staged CI workflow patch, removes this folder, and commits.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git apply pending-workflow-changes/ci-frontend.patch
git rm -rq pending-workflow-changes
git commit -qam "ci: run all tests via vitest and deno test"
echo "Committed. Review with 'git show --stat', then 'git push'."
