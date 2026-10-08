# Handoff: prod/staging Supabase baseline (session 5)

Repo: `/Users/chiptus/repos/david-castel/aios`. Branch: `rebuild-supabase-migrations`.

**Read first:** `/private/tmp/claude-501/handoff-staging-baseline-v3.md` holds the background: decisions, cron findings, tickets. This file supersedes v4 and records everything since then. The running decision log is at the bottom of `catchup-list.md`, at `/private/tmp/claude-501/-Users-chiptus-repos-david-castel-aios/b08b214e-8f7a-4e72-bd8f-bee195fe61a0/scratchpad/catchup-list.md`.

## Focus of the next session
1. Help the user run the Staging reconcile and history repair (steps below), then read the dry-run output.
2. Write the cron migration, modelled on `20261004120000_morning_report_sync_resume.sql`: Vault-based, idempotent, no hardcoded refs or keys. The repo owns cron state (see Q2), so it may overwrite schedule and active flag. Until David approves, create the send jobs **disabled**.
3. Open the PR to `develop` (`create-pr`) when the user asks.

## Committed this session
`84ffd3b06` on `rebuild-supabase-migrations` (on top of `69ab525f5`), **not pushed**:
- `supabase/migrations/20261009000100_catchup_shipped_schema.sql`: the catch-up. It adds 11 tables, the columns, functions and enum values, the unique constraints and FKs, `marketing_work_items_pkey`, the Oct 6 lead fix (policies plus `lead_sales_people` backfill), the fixed lead INSERT policy (prod checked `ur.tenant_id = ur.tenant_id`, a cross-tenant hole), realtime for `agent_tasks`, and 3 private buckets (`invoices`, `command-center-files`, `carmen-media`) with their policies. The `command-center-files` policies were written fresh, limited to the user's own folder.
  - Left out: RLS for the 61 policy-less tables (AIO-67..75), the follow-up WhatsApp trigger and its function, and all crons.
  - Dropped from the list because prod already covers them or doesn't need them: the `seo_call_snapshots` unique constraint, the `marketing_pipeline_stages.agent_id` FK, and the `social-media` bucket policies.
- `supabase/reconcile/20261009_staging_reconcile.sql`: runs once by hand on Staging, as a single transaction. It aborts unless `environment_sync.safety` exists, keeps every row and the keep list, drops `agent_tasks.next_run` (unused), and converts column types. Deliberate residual drift: `lead_status` keeps the value `negotiation`, and the order of `automation_action` values differs.
- Baseline fixes:
  - Supabase's default grants are revoked before the GRANT section, so fresh DBs match prod's grants. Before this fix, `anon` could execute functions like `kick_internal_function`.
  - The duplicate `storage.buckets` insert is removed.
  - The catch-up resets grants on its new objects the same way.

## Verification done
- The catch-up applies cleanly on local Supabase (`supabase_db_zvoijyneresvkadpprel`, which is at the baseline) inside a rolled-back transaction.
- The throwaway container `aios-target-check` holds three databases:
  - `target`: baseline plus catch-up.
  - `stagingcopy`: built from `schema/staging-*.sql`.
  - `fresh`: the fixed baseline applied from scratch.
- The reconciled Staging copy equals `target`, except the two enums. The remaining grant differences are artifacts of the dumps.
- Generators and helpers are in `/private/tmp/claude-501/-Users-chiptus-repos-david-castel-aios/61912196-0187-41df-a682-c66c93ef94b0/scratchpad/`: `gen_catchup.py`, `gen_reconcile.py`, `test_recon.sh`, `dumpdb.sh`, `split.py`, `objs_*.json`, `acl_diff.json`.
  - Don't regenerate `acl_diff.json` from the new catch-up: its added REVOKE lines would leak into the reconcile.
  - Remove the container with `docker rm -f aios-target-check` when it's no longer needed.

## Prechecks (all returned 0, on prod and Staging)
- Duplicate groups for the unique constraints. The one hit on `manually_read_contacts` was the group of rows with `client_id` NULL, which is a false positive.
- Orphan rows for the FKs; duplicate or null `marketing_work_items.id`.
- On Staging only: null `leads.company_name`, non-array `social_media_posts.media_urls`, and non-null `agent_tasks.next_run`.

## Steps the user runs (Staging only)
```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/reconcile/20261009_staging_reconcile.sql
npx supabase link --project-ref "$SUPABASE_STAGING_PROJECT_ID"
npx supabase migration list --linked | awk -F'|' '$1 ~ /^ *(` `)? *$/ && $2 ~ /[0-9]{14}/ {gsub(/[ `]/,"",$2); print $2}' > /tmp/staging-old-versions.txt
wc -l /tmp/staging-old-versions.txt   # expect about 778
npx supabase migration repair --linked --status reverted $(cat /tmp/staging-old-versions.txt)
npx supabase migration repair --linked --status applied 20261009000000 20261009000100
npx supabase db push --linked --dry-run   # should list only 20261013120000 (Carmen persona)
```
Then verify `environment_sync` on Staging. Prod comes later: history repair plus the catch-up, only after David's `מאשר לפרודקשן`.

## Open questions, answered
- **Q1 (RLS for the 61 tables):** left out of the catch-up and fixed per table through AIO-67..75.
- **Q2 (cron ownership):** David (the PO) answered: "אין בעיה שהאוטומציות יחזרו להיות ברירת מחדל. רציתי שתהיה לי האפשרות לראות איזה אוטומציות קיימות ולערוך אותן ידנית לא דרך הקוד". The repo owns cron definitions, and the "אוטומציות מערכת" screen is for viewing jobs and editing them by hand; those edits may be reset on deploy.
- **Q4 (prod data checks):** done, all clean.

## Awaiting David's decision (Q3): not yet given
David must approve each of these on prod:
1. Enabling `client-report-delivery`, which sends clients scheduled reports by WhatsApp or email.
2. Enabling `client-follow-up-worker` and the `clients` trigger `trg_notify_client_follow_up_worker`, which send WhatsApp follow-up reminders to managers and campaigners.
3. The DST fix for the weekly pulse ([AIO-81](https://linear.app/aios-co/issue/AIO-81)), needed before 2026-10-25. The user had set it aside.

Approval covers new sends only. Never replay or backfill old sends without David's explicit approval. Record his answer here and in `catchup-list.md` when it arrives.

## Working rules
- Read-only against both remote projects; the user runs remote queries. Staging first; prod needs David's `מאשר לפרודקשן`.
- Commit and push only when asked; merge only when asked. PRs target `develop`.
- Don't commit `schema/`. Don't add files to `supabase/ops/`.
- Replies: 3 short sentences or fewer, one step at a time.

## Suggested skills
- `wizard`: the Staging reconcile and history repair.
- `code-review`: the cron migration.
- `create-pr`: when the branch is ready.
