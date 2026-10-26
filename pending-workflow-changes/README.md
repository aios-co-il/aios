# Pending workflow changes

The agent token cannot push `.github/workflows/*` (no `workflow` scope). Apply locally, then delete this folder:

    git apply pending-workflow-changes/ci-frontend.patch
    git rm -r pending-workflow-changes
    git commit -am "ci(functions): run edge function tests with deno test" && git push

The patch removes the migrated `supabase/functions/*` paths from the `node --test` steps in `ci-frontend.yml`, drops the empty pulse step, and adds a `deno test -A --no-check supabase/functions` step.
