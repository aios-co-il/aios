# Catch-up list (origin/main b39435e34 vs prod baseline)

Test: code on origin/main (src/, supabase/functions/) uses it and prod lacks it. Definitions come from `schema/staging-schema.sql` unless marked FRESH.
Excluded: environment_sync.*, agent_collaboration_* (PR #511), scratch tables, and anything in pr_only.tsv.

## A. New tables (with their columns, constraints, indexes, policies, triggers from Staging)
- report_schedules, report_deliveries (scheduled-report-worker) + trg_set_report_schedule_next_run / set_report_schedule_next_run()
  + clients trigger deactivate_reports_for_inactive_client / fn  ⚠ report sends: the cron that drives the worker needs David's approval (create disabled)
- seo_geo_programs, seo_geo_keywords, seo_geo_calendar_entries (marketing-seo-*)
- seo_share_response_cache (+ updated_at trigger), gsc_keyword_snapshots (+ updated_at trigger) (gscKeywords, cron-sync-gsc-keywords)
- grok_dispatches, grok_sticky_agents (grok-mcp); carmen_mcp_dispatches (carmen-mcp)
- agent_credentials (github-agent)
Totals: 11 tables, 128 used columns, 48 constraints, 14 indexes, 12 policies, 3 triggers.

## B. Columns on existing prod tables
- clients.follow_up_date, follow_up_manager_notified_at, follow_up_campaigner_notified_at (client-follow-up-worker)
  + idx_clients_follow_up_date + trigger trg_notify_client_follow_up_worker / notify_client_follow_up_worker()  ⚠ sends WhatsApp reminders → David's approval before enabling on prod
- ai_agents.active_modes, active_skills
- social_media_wordpress_sites.woo_consumer_key, woo_consumer_secret
- woocommerce_sync_log.sync_type, created_at
- (not used by code, skip) agent_tasks.next_run

## C. Functions
- graphify_overview, graphify_search, graphify_group_subgraph, graphify_node_group, graphify_is_admin (helper) (useGraphify)
- Oct 6 lead fix (commit 3259a8735, shipped on main; Staging has it, prod doesn't), taken as one unit:
  get_leads_by_stages, user_can_annotate_lead, leads_sync_sales_person_link() + trigger on leads,
  policies leads "Sales people view assigned leads", "Users can update leads in their tenants", lead_updates create/view
- Enum values used by src/components/automations: automation_action += send_telegram;
  automation_trigger += telegram_message_received, account_stopped_spending, ad_account_billing_issue, ad_account_blocked, integration_disconnected

## D. Unique constraints that code's upsert(onConflict) needs (prod lacks → upsert errors)
- automation_shared_tenants(automation_id, tenant_id)
- carmen_memory_pointers(tenant_id, path, entity_type, entity_id, subcategory)
- marketing_stage_templates(tenant_id, track, stage_type)
- social_comments(platform, external_comment_id)
- social_pages(tenant_id, platform, page_id)
- telegram_messages(tenant_id, update_id)
- user_workspace_layout(user_id, tenant_id, module_id)
- maskyoo_settings(tenant_id), seo_call_snapshots(tenant_id, client_id, category, period_start, period_end), seo_monthly_updates(client_id, month)
- FRESH (neither env has it): manually_read_contacts(user_id, client_id)
⚠ Each needs a duplicate check on prod data first, or the ADD CONSTRAINT fails.

## E. Foreign keys that code's PostgREST embeds need
- agent_approval_queue.agent_id → ai_agents; agent_supervisors.child_agent_id / supervisor_agent_id → ai_agents;
  agent_tasks.agent_id → ai_agents; marketing_pipeline_stages.agent_id → ai_agents;
  marketing_work_items.current_stage_id → marketing_pipeline_stages; social_comments.page_id → social_pages
⚠ Orphan-row check on prod first. The other 68 Staging-only FKs, 51 PKs, 20 CHECKs: not needed by code → separate hardening (51 no-PK tables).

## F. Storage
- Buckets missing on prod: invoices, command-center-files, carmen-media, with their Staging policies
- social-media bucket exists on prod with zero policies; Staging has 5 (code uploads to it)
- Note: the baseline inserts storage.buckets twice (lines ~24938 and ~25011); harmless (ON CONFLICT) but worth de-duplicating

## G. RLS policies (decision needed, overlaps AIO-67..75)
- 61 prod tables with RLS on, zero policies, queried from src/: Staging has 176 policies for them (+32 on 12 edge-fn-only tables).
  Rule says take Staging's; but these are security-relevant and the tickets may want a review first.
- 41 prod tables that already have policies: Staging has 119 extra + 34 different. Several Staging-only ones are broader
  (e.g. agencies "authenticated users can delete agencies", clients "authenticated users can insert clients").
  Recommendation: keep prod's except the Oct 6 lead policies (C) and the marketing_* / maskyoo_* / woocommerce read policies, which need checking per table.

## Keep prod (no catch-up; reconcile converts Staging)
- Function bodies where prod is newer: get_chat_contacts, search_contacts_for_chat (tenant checks), get_user_tenant_id, has_role,
  handle_new_user (orphan merge), notify_task_notification_worker + its trigger (Sept 22 fix), trigger_integration_disconnected,
  get_user_client_ids / user_can_access_client (jsonb services; Staging's needs client_is_seo_tagged), claim_campaign_pulse_delivery (Sunday 07:30 cadence, migration 20260929)
- Column types: clients.services jsonb, clients.tier text, communication_logs enums→text, agent_tasks.task_skills jsonb, social_media_posts.media_urls,
  woocommerce numeric/bigint, NOT NULL tightening. Code handles either (arrays in JS); Staging needs data conversion in the reconcile.
- Staging leftovers not to add: notify_task_assigned + trg_notify_task_assigned (removed by the Sept 22 fix; would double-send),
  merge_client_records (one-off), client_is_seo_tagged, user_can_view_client/task (only used by Staging-only policies), lead_status += negotiation (unused)
- initialize_tenant_menu_items: Staging adds signatures/ai-detection/agents menu rows; no matching routes found on main → keep prod (check with user)

## PR-only (see pr_only.tsv, 56 rows)
- PR #511 (open, collaboration hub): agent_collaboration_agents/messages/tasks, 38 columns, 10 constraints, 4 indexes, no policies/triggers.
  ⚠ Conflict: origin/main already ships supabase/functions/collaboration-mcp/index.ts (commit 0b755c32a) querying these tables, with no migration on main.
- Orphan (no source anywhere): user_active_tenant.user_active_tenant_user_id_fkey → auth.users ON DELETE CASCADE.
- No differing object comes from an unmerged PR. Side finding: prod's has_role matches unmerged PR #408 (applied by hand).

## Open questions for the user
0. agent_collaboration_*: catch-up (main code uses it) or leave to PR #511 (collaboration-mcp stays broken on prod)?
1. Policies on the 61 zero-policy tables: take Staging's wholesale now, or per AIO-67..75 ticket?
2. Report and follow-up crons/triggers: create disabled on prod until David approves?
3. Run the duplicate/orphan checks on prod data for D and E? (read-only, but needs prod read access)

## Decisions (session 5)
- Q1: RLS policies for the 61 tables are LEFT OUT of the catch-up; fixed per table via AIO-67..75.
- Q2 (cron ownership) and Q3 (send approvals): parked, waiting on the PO/David.
- Q4: prod and staging prechecks are clean (manually_read_contacts "1" was the NULL client_id group, a false positive). No data cleanup needed before section D/E constraints.
- Catch-up written: supabase/migrations/20261009000100_catchup_shipped_schema.sql (generator: session 61912196 scratchpad gen_catchup.py). Applies cleanly on local baseline (rolled back).
- Corrections to this list: seo_call_snapshots unique already on prod (as seo_call_snapshots_unique_period); marketing_pipeline_stages.agent_id FK already on prod (as _agent_fk); social-media bucket needs no policies (only service-role edge fn uses it); added marketing_work_items_pkey (seo_geo FKs need it); added realtime publication for agent_tasks; command-center-files policies written fresh (own folder only).
- Left out: follow-up WhatsApp trigger/function, all crons.
- Security finding: prod's "Users can create leads in their tenants" checks ur.tenant_id = ur.tenant_id (always true, cross-tenant insert); Staging fixed it. Added to the catch-up (user approved).
- Reconcile: supabase/reconcile/20261009_staging_reconcile.sql (generator gen_reconcile.py in session 61912196 scratchpad; verified on a Staging-schema copy in docker container aios-target-check: result equals target except enum lead_status/automation_action).
- Baseline fixed: default-privilege grants are revoked before the GRANT section (fresh DBs now match prod grants); duplicate bucket insert removed. Catch-up also resets grants on its new objects. Both verified on a fresh DB.
- Q2 answered by the PO (2026-10-14): resetting automations to defaults on deploy is fine; the panel ("אוטומציות מערכת") is for seeing which exist and editing by hand. → Repo owns cron definitions; a cron migration may overwrite schedule and active flag.
- 2026-10-15: /tmp scratch was wiped; these tools were restored from session transcripts into schema/tools/. Decision: remove the Oct 14 feature-branch migrations (video studio x2, agent_tasks_cron_schedule) from Staging in the reconcile, keep agent_tasks.next_run; see schema/handoff-staging-baseline-v6.md.
