# Database and edge-function deploys (label-gated)

Migrations in `supabase/migrations/**` are applied with `supabase db push`; the legacy `supabase/ops/*.sql` workflows (`apply-sql-migration*.yml`) remain only until the migration history is reconciled.

- **PR into `develop` (or a hotfix into `main`) that changes `supabase/migrations/**`, `supabase/functions/**`, `supabase/config.toml`, `scripts/*edge*` or `scripts/staging-only-functions.json`:** must hold the `staging` label (`Deploy Staging` → `Require staging label` fails otherwise). Only one open PR can hold the label (`staging-lock.yml`). The label deploys the PR's migrations and edge functions to Staging and checks `src/integrations/supabase/types.ts` against the staging schema (check-only — regenerate with `scripts/gen-types.sh` and commit).
- **`develop` → `main` release PRs** are exempt: Staging already runs `develop`.
- **Push to `develop`:** `deploy-staging-develop.yml` re-applies migrations (idempotent) and redeploys functions. It deploys even while a labelled PR holds Staging and may overwrite that PR's functions; push to the PR (or re-run `Deploy Staging`) to redeploy it.
- **Push to `main`:** `deploy-prod.yml` pushes migrations to Production, then deploys functions.
- **Drift recovery:** comment `/db-fix` or `/db-force-push` on a labelled PR. Dry-run migration history first with Actions → **Supabase migration dry run**.

### GitHub config

| Kind                                  | Name                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Variable                              | `PROD_PROJECT_REF`, `STAGING_PROJECT_REF`                                       |
| Secret                                | `BASE_ACCESS_TOKEN` (existing), `PROD_DB_PASSWORD`, `STAGING_DB_PASSWORD`       |
| Environments                          | `staging`, `production` (no required reviewer)                                  |
| Branch protection (`develop`, `main`) | PR required; 1 approving review; merge restricted to authorised humans, no bots |
| Label                                 | `staging`                                                                       |
| Required checks (`develop`, `main`)   | `Staging deploy result` (aggregate: fails on any failed/cancelled deploy job)   |
