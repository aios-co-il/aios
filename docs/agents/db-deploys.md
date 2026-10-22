# Database and edge-function deploys (Supabase Branching)

Migrations in `supabase/migrations/**` are applied by the Supabase GitHub integration (project `zvoijyneresvkadpprel`, "Automatic branching" + "Supabase changes only", "Deploy to production" on, with `main` as the production branch).

- **PR that changes `supabase/`:** gets its own isolated preview branch and a `Supabase Preview` check. No label and no lock; PRs deploy in parallel. Branches are secretless, so set a dev-scoped secret only when testing an integration (`supabase/DEV_SECRETS.md`).
- **PR that does not change `supabase/`:** gets no branch; its Vercel Preview uses the persistent `develop` branch.
- **Edge functions deploy to a branch only if declared** as `[functions.<name>]` in `supabase/config.toml`. A new function without an entry is silently not deployed.
- **Merge to `develop`:** the persistent `develop` branch applies migrations and deploys declared functions.
- **Push to `main`:** the Supabase GitHub integration applies migrations and deploys declared functions to Production. Only functions declared as `[functions.<name>]` in `supabase/config.toml` deploy, so declare every new function there.
- **Types:** regenerate `src/integrations/supabase/types.ts` with `scripts/gen-types.sh`; `_check_types.yml` is no longer wired to a PR gate.

### GitHub config

| Kind                                  | Name                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| Environment variable                  | `SUPABASE_PROJECT_REF` (`staging` environment, used by the mirror and type check) |
| Repo variable                         | `PROD_PROJECT_REF`                                                                |
| Environment secret                    | `DB_PASSWORD` (per environment)                                                   |
| Repo secret                           | `BASE_ACCESS_TOKEN`                                                               |
| Branch protection (`develop`, `main`) | PR required; 1 approving review; merge restricted to authorised humans            |
| Required checks                       | `Supabase Preview` replaces the removed `Staging deploy result`                   |
