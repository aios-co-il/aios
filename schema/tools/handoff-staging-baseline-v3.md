# Handoff: the Supabase baseline (status for the main dev)

Repo: `/Users/chiptus/repos/david-castel/aios`. Branch: `rebuild-supabase-migrations`.
This replaces `/private/tmp/claude-501/handoff-staging-baseline-v2.md` and `handoff-catchup-diff.md`. The same content as a page: https://claude.ai/artifact/SEHPCSp9Jjr7YzQ8tABDaQ (private; share it from the page).

## Urgent: before 2026-10-25
- Prod's `campaign-pulse-sunday-0730` cron runs at `30 4 * * 0` UTC. Prod's `claim_campaign_pulse_delivery` accepts only Sunday 07:20–07:40 `Asia/Jerusalem`.
- When DST ends on 2026-10-25, 04:30 UTC becomes 06:30 local, so the claim returns false and the weekly pulse stops being delivered without any error.
- Fix: schedule both 04:30 and 05:30 UTC (the claim accepts only one of them), or widen the claim. It needs a migration and David's approval for prod.

## Decisions
- **Prod is the baseline for both environments:** `supabase/migrations/20261009000000_production_baseline.sql`. The scratch tables were removed from the file; that change is **not committed**.
- **A catch-up migration** adds what shipped code on `origin/main` uses but prod lacks. Definitions come from `schema/staging-schema.sql`.
- **Prod gets** the history repair (metadata) and the catch-up. Nothing on prod is deleted.
- **Staging is reconciled in place** to baseline plus catch-up. The reconcile drops stale policies, old trigger functions and extra indexes, and converts column types. No Staging-only table loses rows.
- **Reconcile keep list:** `environment_sync.*` and `agent_collaboration_*`.
- **`agent_collaboration_*` is not in the catch-up and gets no ops script.** `collaboration-mcp` is Staging-only by design: PR #598 (commit `0b755c32a`), `scripts/staging-only-functions.json`, `supabase/config.toml:450`. It isn't deployed on prod. PR #511 owns the tables' migration.
- **No new files in `supabase/ops/`.** The user considers it a junkyard. `AGENTS.md` requires every DB change to be a migration (PR #773).

## Results
- **Catch-up list:** `/private/tmp/claude-501/-Users-chiptus-repos-david-castel-aios/b08b214e-8f7a-4e72-bd8f-bee195fe61a0/scratchpad/catchup-list.md`. It is up to date, with open questions at the bottom.
- **PR-only list:** `.../scratchpad/pr_only.tsv`. Only PR #511 (collaboration tables). One orphan FK with no source anywhere: `user_active_tenant_user_id_fkey`. Prod's `has_role` matches unmerged PR #408, so it was applied by hand.
- **Cron snapshots:** `schema/cron-prod.sql` (17 jobs) and `schema/cron-staging.sql` (4 jobs), with secrets redacted.
  - ⚠ `schema/cron-prod.csv` and `schema/cron-staging.csv` contain live keys, including prod's service-role JWT. `schema/` isn't gitignored, so don't commit them; delete them or add them to `.gitignore`.
  - The six `schema/*` dumps are staged (`git add`) but not committed.
- **Earlier analysis scripts and data:** `/private/tmp/claude-501/-Users-chiptus-repos-david-castel-aios/e82e6b2f-064e-4367-8fa9-00b375a0ce1a/scratchpad/diff/` (`objs.json`, `catchup.tsv`). This session's code-usage pass is in `.../b08b214e-.../scratchpad/use.json` and `onconflict.json`.

## Cron findings
- No job posts to another environment's URL.
- Main's migration `20261004120000_morning_report_sync_resume.sql` (Vault-based and idempotent; the pattern to follow) was **never applied to prod**. Prod still runs the old `sync-google-ads/analytics-twice-daily` and `sync-facebook-insights` jobs after the 04:00 pulse refresh.
- The repo defines four jobs that exist on neither environment: `client-report-delivery`, `client-follow-up-worker-every-minute`, `cron-sync-gsc-keywords-daily` and `lead-alert-failure-watch-15m`. The first two start client report and WhatsApp sends, so create them disabled until David approves.
- 8 prod jobs have no source in git.
- 3 prod jobs hardcode the service-role JWT: the pulse job and the two `*-operational-check-2h` jobs.
- Super admins can change a job's schedule and active flag, and run it now, from `SystemCronJobsPanel` (`update_system_cron_job`, `run_system_cron_job_now`). Turning a job off keeps its row.
- `src/lib/cronJobsCatalog.ts` holds display labels only, and some job names in it are stale.
- Open PRs that touch crons: #479 (new `cron-sync-facebook-leads`), #834, #651 (stale pulse cadence), #820 (panel UI only).

## Open questions (the user and David)
1. Policies for the 61 prod tables with RLS on, zero policies, and frontend queries: take Staging's all at once, or per AIO-67..75?
2. Should the repo or the admin panel own cron schedules and on/off state? A cron migration overwrites edits made in the panel.
3. Approval for the report and follow-up sends, and for the DST fix on prod.
4. Read-only duplicate and orphan checks on prod data before adding the 11 unique constraints and 7 FKs. Prod reads are blocked by the auto-mode classifier; the user runs queries in the SQL Editor and drops CSVs into `schema/`.

## Follow-up tickets
- AIO-79: 7 prod edge functions with no source on main.
- AIO-80: what can be dropped from prod (scratch tables, stale crons, catalog entries).
- AIO-66: prod triggers posting to an unknown project (out of scope).
- AIO-67..75: RLS policies.

## Next steps
Developer:
1. Fix the DST bug (migration) and get it to Staging, then to prod with David's approval, before 2026-10-25.
2. Write the catch-up migration from `catchup-list.md`.
3. Write the Staging reconcile SQL: baseline plus catch-up, with the keep list above. Stage it next to the migrations, not in `supabase/ops/`.
4. Write a cron migration modelled on `20261004120000`, using Vault and no hardcoded refs or keys, once question 2 is answered.

User (remote writes):
1. Run the reconcile on Staging, verify `environment_sync`, repair Staging's migration history, then dry-run `supabase db push`.
2. Prod: repair the history and apply only the catch-up, after David's `מאשר לפרודקשן`. Don't replay old WhatsApp or report sends.

## Constraints
- Read-only against both remote projects unless the user runs the query themselves. Staging first; prod needs David's approval. Merge only when asked.
- Keep replies to the user to 3 short sentences or fewer.

## Suggested skills
- `grilling`: go through the open questions with the user before writing the catch-up and the reconcile.
- `code-review`: review the catch-up migration and the reconcile SQL.
- `wizard`: script the Staging reconcile and the history-repair steps the user runs by hand.
- `create-pr`: open the PR against `develop` once the migrations are written.
