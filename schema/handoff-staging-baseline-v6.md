# Handoff: prod/staging Supabase baseline (session 6, 2026-10-15)

Repo: `/Users/chiptus/repos/david-castel/aios`. Branch: `rebuild-supabase-migrations`. HEAD is `84ffd3b06`, **not pushed**.

This file replaces v3, v4 and v5. The old `/private/tmp` scratch was wiped. On 2026-10-15 I restored these files from session transcripts into **`schema/tools/`** by replaying every Write, Edit and shell edit:

- the generators: `gen_catchup.py`, `gen_reconcile.py`, `split.py`, `dumpdb.sh`, `test_recon.sh`
- the decision log: `catchup-list.md`, which now has the v6 decision appended
- the old handoffs: v3 and v5

All the scripts pass a syntax check. What I haven't checked is whether `gen_reconcile.py` reproduces the committed reconcile, because its inputs are lost: `objs_cmp.json`, `objs_as.json`, `objs_cu.json` and `acl_diff.json`. To get them back:

- Rebuild the `objs_*` files with `dumpdb.sh` and `split.py` from the `aios-target-check` databases. For an updated reconcile, use a fresh Staging dump instead.
- `acl_diff.json` came from an ad-hoc query; find that query in session `61912196` (`~/.claude/projects/-Users-chiptus-repos-david-castel-aios/61912196-*.jsonl`).

The scripts take their data directory as `argv[1]`. Use a scratch directory and keep the data out of `schema/tools/`. Everything lives in `schema/`, which is untracked; never commit it.

## Status right now: blocked at the schema check

The user ran `schema/staging-baseline-wizard.sh` in **copy** mode against a duplicate of Staging. Logs are in `schema/wizard-logs/20261015-112346/`.

- Stage 2 is done: the copy's 4 cron jobs were unscheduled (`cron-before.txt`).
- Stage 3 stopped. `schema.diff` has 969 changed lines: Staging gained objects after the Oct 14 snapshot `schema/staging-schema.sql`.

**Cause:** three feature-branch migrations ran on Staging through their Previews. None of them is on `develop` or on this branch:

| Version        | File                            | Branch                                                                       |
| -------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| 20261014070000 | `video_studio_foundation.sql`   | origin/claude/funny-ptolemy-ajfwxn, origin/claude/blissful-heisenberg-boyd8l |
| 20261014120000 | `agent_tasks_cron_schedule.sql` | origin/cursor/carmen-group-verification-e470 (commit 071fe46b4)              |
| 20261014190000 | `video_studio_production.sql`   | same as the first row                                                        |

What they add on Staging:

- `marketing_video_scenes` and the `marketing_video_scene_status` enum.
- About 12 video functions (`produce_video`, `queue_video_*`, `claim_video_run`...).
- Changes to `marketing_runs` and `marketing_assets` (`scene_id`, indexes).
- `agent_tasks.engine_model` and `agent_tasks.timezone`, `agent_tasks_cron_due_idx`, and `tenant_heartbeat_settings.max_concurrent_tasks`.
- **`agent_tasks.next_run` is now used** ("UI-set, dispatcher-advanced"). The reconcile **drops** it as unused, so that drop must go.

## Decision (user, 2026-10-15): remove these changes from Staging and let the PRs re-apply them

Staging should match `develop` exactly. Each feature PR re-runs its own migration once it is rebased onto the baseline and merged. I checked all three files: they are idempotent (`IF NOT EXISTS`, `create or replace`, `on conflict do nothing`, `duplicate_object` handlers), so a re-run rebuilds everything.

Work for next session (not started):

1. **Edit the reconcile by hand**, since the generators are gone. Add to `supabase/reconcile/20261009_staging_reconcile.sql`:
   - Drop the video studio objects:
     - The table `marketing_video_scenes`, its rows, and its policies, triggers and realtime publication entry.
     - The enum `marketing_video_scene_status`.
     - The video functions: `advance_video_production`, `attach_video_scene_asset`, `claim_video_run`, `marketing_video_scenes_guard`, `migrate_storyboard_to_video_scenes`, `produce_video`, `queue_video_clips`, `queue_video_clips_superseded_5arg`, `queue_video_render`, `queue_video_sound`, `save_video_storyboard`, `set_video_production`.
     - The new `marketing_runs` columns (`kind`, `scene_id`, `provider`, `provider_job_id`, `credits`, `attempts`), `marketing_runs_kind_check`, and the `marketing_runs_*` and `marketing_assets_scene_idx` indexes.
     - The `creative_video_*` storage policies, and the `creative-video` bucket only if it is empty.
     - Take the exact list from `schema/wizard-logs/20261015-112346/schema.diff` and the migration files (`git show badf5d1ce:...foundation.sql`, `git show 4a9f346ff:...production.sql`).
   - From `20261014120000_agent_tasks_cron_schedule.sql`: drop `agent_tasks.timezone`, `agent_tasks.engine_model` and `agent_tasks_cron_due_idx`. **Leave `agent_tasks.next_run` alone**: remove the reconcile's existing `DROP COLUMN next_run`. The migration's re-run no-ops it with `ADD COLUMN IF NOT EXISTS` and resets its comment.
   - Check that the `carmen-media` bucket insert in the foundation migration doesn't clash with the catch-up's (it uses `on conflict do nothing`).
2. **History repair:** revert all three versions. Wizard stage 5 already does this, since they have no local file on this branch.
3. **Wizard stage 3:** refresh `schema/staging-schema.sql` from Staging, or teach stage 3 to accept exactly these known objects, so the rehearsal can go on past the check.
4. **Branch owners:** tell them not to push to `origin/claude/funny-ptolemy-ajfwxn`, `origin/claude/blissful-heisenberg-boyd8l` or `origin/cursor/carmen-group-verification-e470` until they've rebased onto the baseline. Each Preview deploy pushes migrations to Staging.
5. **Rehearse again:** make a fresh duplicate and run the wizard in copy mode. The dry run should list only `20261013120000`. During the run, record how many `marketing_video_scenes` rows are dropped; that data is Staging-only and can't be recovered.
6. **Prod:** these migrations never ran there, so nothing changes.

## The wizard (`schema/staging-baseline-wizard.sh`, untracked)

Don't Run it, tell the user to run it: `bash schema/staging-baseline-wizard.sh`. Choose `copy` first, then `staging`. It has 9 stages:

1. Connect. It refuses the prod ref `zvoijyneresvkadpprel`, and any database without `environment_sync.safety`. It needs the session pooler on port 5432.
2. Cron jobs: on the copy it requires unscheduling all of them, because they call Staging's functions and can send real messages. On Staging it leaves them alone.
3. Schema drift check: the migration versions plus `supabase db dump` diffed against the snapshot.
4. Run the reconcile: one transaction, with `statement_timeout = 0`.
5. Old versions: remote versions minus local files, about 778 expected.
6. `migration repair --status reverted`.
7. Mark `20261009000000` and `20261009000100` applied.
8. `db push --dry-run`: expect only `20261013120000`.
9. Smoke check.

It uses `--db-url` everywhere, never `--linked`. The local CLI is **linked to Prod** (`supabase/.temp/project-ref`).

Refs: Staging is `mzjsuvatrzhciojmbbbm`, Prod is `zvoijyneresvkadpprel`.

## Committed in 84ffd3b06 (from v5)

- `supabase/migrations/20261009000100_catchup_shipped_schema.sql` adds to the prod baseline:
  - 11 tables, columns, functions and enum values, the unique constraints and FKs, and `marketing_work_items_pkey`.
  - The Oct 6 lead fix, plus the fixed lead INSERT policy. Prod checked `ur.tenant_id = ur.tenant_id`, a cross-tenant hole.
  - Realtime for `agent_tasks`.
  - Private buckets `invoices`, `command-center-files` and `carmen-media` with their policies.
  - Left out: RLS for the 61 policy-less tables (AIO-67..75), the follow-up WhatsApp trigger, and all crons.
- `supabase/reconcile/20261009_staging_reconcile.sql` runs once by hand, Staging only, as a single transaction. It aborts without `environment_sync.safety`. Intended residual drift: `lead_status` keeps `negotiation`, and the order of `automation_action` values differs.
- Baseline fixes: Supabase's default grants are revoked before the GRANT section, so `anon` can no longer execute functions like `kick_internal_function`. The duplicate `storage.buckets` insert is removed.
- The baseline has **no cron jobs**: `pg_dump` doesn't export `cron.job` rows. Existing jobs on Staging and Prod are untouched.

Verification container: `aios-target-check` still exists. It holds the `target`, `stagingcopy` and `fresh` databases, all from the Oct 14 snapshot. Remove it with `docker rm -f aios-target-check` when done.

## Decisions

- **Crons:** a separate ticket and PR, [AIO-83](https://linear.app/aios-co/issue/AIO-83), after this PR merges. It is Vault-based with no hardcoded refs, the repo owns the definitions, and the send jobs are created disabled. It is not part of the reconcile.
- **RLS for the 61 tables:** handled per table in AIO-67..75.
- **Q2 (cron ownership):** David said the repo may own the crons, and that the "אוטומציות מערכת" screen is for viewing jobs and editing them by hand. Those edits may be reset on deploy.
- **Prod data prechecks:** all clean on both prod and Staging.
- **Prod plan:** don't run the reconcile there, since it is Staging-only. Instead, revert the old history, mark only `20261009000000` applied, then `db push` the catch-up `20261009000100`. All of it needs David's `מאשר לפרודקשן`.

## Awaiting David (Q3), not yet given

1. Enabling `client-report-delivery`.
2. Enabling `client-follow-up-worker` and the trigger `trg_notify_client_follow_up_worker`.
3. The DST fix for the weekly pulse ([AIO-81](https://linear.app/aios-co/issue/AIO-81)), needed before **2026-10-25**.

Approval covers new sends only. Never replay or backfill old sends.

## Working rules

- Read-only against both remote projects; the user runs the remote steps. Staging first; Prod needs `מאשר לפרודקשן`.
- Commit, push and merge only when asked. PRs target `develop`.
- Don't commit `schema/`. Don't add files to `supabase/ops/`.
- Replies: 3 short sentences or fewer, one step at a time.
