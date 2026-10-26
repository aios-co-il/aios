# Pending workflow changes

The agent token cannot push `.github/workflows/*` (no `workflow` scope). Apply locally, then delete this folder:

    git apply pending-workflow-changes/ci-frontend.patch
    git rm -r pending-workflow-changes
    git commit -am "ci: run all tests via vitest and deno test" && git push

The patch removes every remaining `node --test` step from `ci-frontend.yml` (all suites now run via `pnpm test:components`, which is `vitest run`) and adds a `deno test -A --no-check supabase/functions` step.
