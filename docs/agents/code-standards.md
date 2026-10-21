# Code standards

Reviewers hold every PR to these rules. `pnpm check:pr-standards` (also a CI job) enforces the ones marked **gate**, on lines and files the PR adds only, so legacy code never blocks a PR. Run it before pushing and fix every finding.

## Types

- **gate:** Types come from the schema. Use the generated types (`Tables`, `TablesInsert` from `@/integrations/supabase/types`; `_shared/database.types.ts` in edge functions), and parse `Json` columns with a small typed parser. The gate rejects `as any` and `as unknown as` on added lines, because a cast hides schema drift that the typecheck would otherwise catch.
- Edge functions create Supabase clients through `_shared/supabase-clients.ts`: `serviceClient()` for trusted server work, and `userClient(authHeader)` when RLS must scope the work to the caller. Both are typed as `DbClient`.

## File size

- **gate:** A new source file under `src/` or `supabase/functions/` stays at **180 lines or fewer** (250 for tests). When you add a feature to an existing large file, put the new parts in their own components or modules and keep the old file as composition.
- When a split changes an import path, keep the old path as a barrel that re-exports the same API.

## Migrations

- Each feature ships **one migration**. While a feature's migration exists only on Staging, fold follow-up columns into it instead of adding `…_add_x.sql` files. Deleting the follow-ups leaves Staging drift, which a maintainer clears with `/db-fix` (see `docs/agents/db-deploys.md`).
- Write each policy as its own block: a blank line between blocks, and a one-line comment above each drop/create pair saying what the policy checks.
- Trigger functions check `TG_OP` explicitly for every operation they handle.
- A non-obvious SQL function opens with a header comment: what it does, and who calls it.
- **gate:** `supabase/ops/` is being retired. A database change every environment needs goes in an idempotent migration: create only if missing, read secrets from Vault at run time, and skip with a `NOTICE` when a prerequisite is absent. A one-time manual step goes in the PR description for a developer to run.

## Clarity

- Explain each workaround where it lives: a one-line comment for a small one, a Linear ticket (linked from the code) for one that needs a review of its own.
- Remove temporary markers (preview triggers, debug lines, "revert before merge") before you request review.
