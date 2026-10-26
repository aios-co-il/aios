# Pending workflow changes

The agent token cannot push `.github/workflows/*` (no `workflow` scope). Apply locally, then delete this folder:

    git apply pending-workflow-changes/ci-frontend.patch
    git rm -r pending-workflow-changes
    git commit -am "ci(frontend): run src tests via Vitest only" && git push

The patch removes the migrated `src/*` test paths from the two `node --test` steps in `ci-frontend.yml`.
