-- Restore the foreign keys, check constraints and unique keys Production lost
-- (AIO-67, AIO-71 to AIO-75), and add a few that the old migrations defined but
-- that never reached Production. Before 2026-10-09 a direct change on
-- Production, not a migration, dropped them along with the access rules and the
-- primary keys. The baseline (20261009000000) is a dump of Production taken
-- after that, so Staging and every Preview, which are built from it, lack them
-- too.
--
-- Where the list comes from: the pre-baseline migrations (removed from the repo
-- in #855; see a18b7cb79^:supabase/migrations) and database/schema.sql, an
-- export of Production's live schema from about June 2026, before the loss.
-- It is not proven complete: a constraint added and lost between the export and
-- 2026-10-09 outside any migration would be in neither. Where the export has a
-- constraint, its definition is used, with three changes David decided:
--   carmen_whatsapp_sessions_ai_conversation_id_fkey  ON DELETE SET NULL: a user
--     can delete a conversation, and Carmen's session only loses the link
--   seo_monthly_updates_updated_by_fkey  ON DELETE SET NULL: every user can be
--     deleted, and their updates stay in the history
--   communication_logs_tenant_id_fkey  ON DELETE CASCADE, like the other tenant
--     keys here: deleting an organization deletes its own records (the export
--     and 20260408041833 had no action, which made delete-tenant fail for a
--     tenant with logs on another tenant's client)
-- One follows the export and not the old migrations:
--   agent_action_log_agent_id_fkey  ON DELETE SET NULL, as 20260529095654
--                                   (20260327_agent_github_tables.sql had none)
-- Eight come only from the export, because Production got them outside any
-- migration: the tenant keys (ON DELETE CASCADE) of automation_executions,
-- integration_health, job_queue, processed_events and tenant_rate_limits, and
-- the unique keys unique_execution, unique_idempotency_key and
-- unique_tenant_resource. check_rate_limit(uuid, text, integer) inserts with
-- ON CONFLICT (tenant_id, resource_type) and fails with 42P10 until
-- unique_tenant_resource exists.
--
-- Restored: 67 foreign keys, 17 check constraints and 10 unique keys. Every
-- one is in the export except the 3 keys of marketing_ab_variants, a table
-- 20260627150000 created after the export. Production has every table and
-- column involved, with the same types. Four parents (agent_evals,
-- agent_knowledge_folders, agent_runs, telegram_bot_state) get their primary
-- key from 20261102113100_missing_primary_keys, which runs before this.
--
-- Recreated: agent_approval_queue_agent_id_fkey, which 20261009000100 re-added
-- with no ON DELETE action, gets the export's ON DELETE SET NULL, so deleting
-- an agent keeps its approval history.
--
-- Added, never on Production (not in the export):
-- - agent_action_log_tenant_id_fkey and agent_approval_queue_tenant_id_fkey
--   (ON DELETE CASCADE), from 20260327_agent_github_tables.sql, which never
--   ran there: Production's tables came from 20260529095654 without them.
-- - 5 indexes on a foreign key column: idx_communication_logs_tenant (from
--   20260407_dmm_crm_adaptation.sql, which never ran there either),
--   idx_carmen_sessions_automation, idx_woo_customers_tenant,
--   idx_woo_products_tenant and idx_woo_sync_log_tenant.
--
-- Data change, the only one: rows whose client no longer exists (Production,
-- read-only, 2026-11-03; Staging has none). Most of those clients were
-- duplicates; past clients are made inactive, not deleted. Each row is first
-- copied, as jsonb, to archive.orphan_rows, a new table in a new schema that is
-- not exposed to the API. Then:
--   communication_logs   116 of 1,124 rows  deleted (client_id is NOT NULL)
--   seo_monthly_updates   55 of 427         deleted (client_id is NOT NULL)
--   ahrefs_reports         3 of 219         client_id cleared, report kept
--   maskyoo_numbers        3 of 71          client_id cleared, number kept
-- after which their 4 client keys validate. A re-run archives and changes
-- nothing. No other foreign key has an orphan, no check fails on any row and no
-- unique key has a duplicate, and Staging breaks none of them. If validation
-- still fails anywhere, the constraint stays NOT VALID and a WARNING names it
-- with its count of rows, so the deploy does not fail; it still checks every
-- new row and changed key. A unique key with duplicates is skipped the same way.
--
-- Deletes: with the keys back, deleting a tenant or an agent again removes or
-- clears these child rows; an agent's action log and approval requests stay,
-- without the agent. Deleting a client removes its communication logs and SEO
-- monthly updates and clears its other rows here, but no marketing pipeline
-- (see marketing_pipelines_client_id_fkey below), so it does not reach the work
-- items, workshop artifacts, assets and video scenes built since. Deleting a
-- conversation or a user clears the session or SEO update that named it.
-- Deleting a tenant also removes its communication logs on another tenant's
-- client (on Production, 472 logs of 2 tenants, 284 of them through a shared
-- agency). A delete that would leave an orphan behind a key with no ON DELETE
-- action is refused: a lead or client with Telegram messages (Production has
-- none).
--
-- Not restored, on purpose:
-- - marketing_pipelines_client_id_fkey (ON DELETE CASCADE in the old schema):
--   a client delete would cascade through its pipelines' work items into the
--   workshop artifacts, assets and video scenes built after the loss. SET NULL
--   fails too: an active pipeline without a client is the tenant's one active
--   "no client" pipeline per track (marketing_pipelines_tenant_general_track_idx,
--   20261026103200). Once a tenant has one in a track, from a workshop project
--   without a client or from an earlier client delete, deleting a client with an
--   active pipeline in that track fails with 23505. Production has 3 tenant and
--   track pairs with 2 or more active client pipelines. Left as Production has
--   it: no key, and deleting a client deletes no pipeline.
-- - carmen_whatsapp_sessions_status_check (active, ended): Carmen now also
--   writes 'expired' (_shared/carmen.ts); 286 of 356 rows fail it.
-- - integration_alerts_log_alert_type_check (3 types): the edge functions
--   write about 15 more (quota_out, campaign_stopped, ...); 58 rows fail it.
-- - marketing_assets_type_check: dropped on Production on purpose for
--   storyboard rows (supabase/ops/apply_marketing_assets_type_staging.sql).
-- - social_pages_platform_check (facebook, instagram): the client connections
--   tab also adds tiktok, linkedin and youtube pages.
-- - communication_logs_updated_by_fkey: only 20260407_dmm_crm_adaptation.sql
--   had it, and the delete-user function would fail on it after removing the
--   user's profile, roles and memberships.
-- - crm_tables_shared_tenants (4 constraints): the table is not on Production.
-- - marketing_pipeline_stages_agent_id_fkey, _pipeline_id_fkey and
--   seo_call_snapshots_tenant_id_client_id_category_period_star_key: Production
--   has them under other names (marketing_pipeline_stages_agent_fk,
--   _pipeline_fk, seo_call_snapshots_unique_period).
-- - unique_tenant_provider, unique_event_key and
--   ai_memory_user_id_tenant_id_category_key_key: a unique index on the same
--   or fewer columns already covers each
--   (integration_health_tenant_provider_unique,
--   processed_events_event_key_unique, ai_memory_uq_user_tenant_cat_key).
-- - processed_webhook_messages_pkey: its unique index on the same columns
--   dedupes it; 20261102113100 left it unkeyed on purpose.
-- - crm_dashboards_type_check and goals_status_check keep the definitions
--   Production changed them to after the export.
-- The other keys to auth.users with no ON DELETE action are left to a separate
-- change.
--
-- Locks: ADD FOREIGN KEY ... NOT VALID takes SHARE ROW EXCLUSIVE on the table
-- and its parent (tenants, clients, auth.users and others), which blocks their
-- writes but not their reads; ADD CHECK ... NOT VALID and ADD UNIQUE take
-- ACCESS EXCLUSIVE on their table; CREATE INDEX takes SHARE; VALIDATE takes
-- SHARE UPDATE EXCLUSIVE, which blocks neither; the archive step's deletes and
-- updates take ROW EXCLUSIVE. Dropping the old agent_approval_queue_agent_id_fkey
-- takes ACCESS EXCLUSIVE on agent_approval_queue and ai_agents, which blocks
-- their reads too, so it runs last. The migration commits as one transaction,
-- so every lock is held until then. The tables are small (the largest,
-- automation_executions, has about 45,000 rows), so that is a second or less.
-- If a long transaction holds a lock on one of them, lock_timeout makes the
-- deploy fail after 5 seconds instead of queueing every query on tenants,
-- clients or ai_agents behind it.
--
-- Nothing is sent. Safe to re-run: a constraint or index that already exists by
-- name is left as it is (a NOT VALID one is validated again;
-- agent_approval_queue_agent_id_fkey is replaced only while it differs), and one
-- whose table or column is missing is skipped with a NOTICE. The closing guard
-- requires every constraint and index here to exist with its expected
-- definition, and allows NOT VALID only for a constraint this run reported as
-- broken.

select set_config('lock_timeout', '5s', true);

-- Where the rows this migration deletes or changes are kept, as they were. The
-- schema is not exposed to the API; anon and authenticated have no access.
create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;
create table if not exists archive.orphan_rows (
  source_table text not null,
  row_id uuid not null,
  row jsonb not null,
  reason text not null,
  archived_at timestamptz not null default now(),
  primary key (source_table, row_id, reason)
);
revoke all on table archive.orphan_rows from public, anon, authenticated;
alter table archive.orphan_rows enable row level security;
comment on table archive.orphan_rows is
  'Rows a migration deleted or changed, as they were before. 20261103100000_restore_lost_constraints: rows whose client was deleted.';

do $$
declare
  v_spec jsonb;
  r record;
  v_rel regclass;
  v_ref regclass;
  v_missing text;
  v_oid oid;
  v_valid boolean;
  v_count bigint;
  v_count_sql text;
  v_skipped text[] := '{}';
  v_duplicated text[] := '{}';
  v_not_valid text[] := '{}';
  v_problems text[] := '{}';
  v_def text;
  v_archived bigint;
  -- Existing keys whose definition this migration replaces when it differs from the one below.
  v_replace text[] := array['agent_approval_queue_agent_id_fkey'];
begin
  -- table, name, kind (u unique, i index, c check, f foreign key), columns it reads,
  -- parent table and columns (f), and its definition as pg_get_constraintdef / pg_get_indexdef prints it.
  select jsonb_agg(to_jsonb(s) order by s.ord) into v_spec
  from (
    select row_number() over () as ord, t.*
    from (values
      -- Unique keys (no duplicates on Production).
      ('agent_supervisors', 'agent_supervisors_supervisor_agent_id_child_agent_id_key', 'u', array['supervisor_agent_id', 'child_agent_id'], null, null, 'UNIQUE (supervisor_agent_id, child_agent_id)'),
      ('agent_tools', 'agent_tools_tenant_id_name_key', 'u', array['tenant_id', 'name'], null, null, 'UNIQUE (tenant_id, name)'),
      ('agent_user_profiles', 'agent_user_profiles_agent_id_contact_phone_key', 'u', array['agent_id', 'contact_phone'], null, null, 'UNIQUE (agent_id, contact_phone)'),
      ('ai_skills', 'ai_skills_user_id_tenant_id_name_key', 'u', array['user_id', 'tenant_id', 'name'], null, null, 'UNIQUE (user_id, tenant_id, name)'),
      ('automation_executions', 'unique_execution', 'u', array['execution_id', 'automation_id'], null, null, 'UNIQUE (execution_id, automation_id)'),
      ('job_queue', 'unique_idempotency_key', 'u', array['tenant_id', 'idempotency_key'], null, null, 'UNIQUE (tenant_id, idempotency_key)'),
      ('marketing_pipelines', 'marketing_pipelines_client_track_unique', 'u', array['client_id', 'track'], null, null, 'UNIQUE (client_id, track)'),
      ('maskyoo_manual_overrides', 'maskyoo_manual_overrides_tenant_id_maskyoo_last9_period_day_key', 'u', array['tenant_id', 'maskyoo_last9', 'period_days'], null, null, 'UNIQUE (tenant_id, maskyoo_last9, period_days)'),
      ('maskyoo_numbers', 'maskyoo_numbers_tenant_id_phone_last9_key', 'u', array['tenant_id', 'phone_last9'], null, null, 'UNIQUE (tenant_id, phone_last9)'),
      ('tenant_rate_limits', 'unique_tenant_resource', 'u', array['tenant_id', 'resource_type'], null, null, 'UNIQUE (tenant_id, resource_type)'),
      -- Indexes on a foreign key column (additions: the old migrations had them, Production never did).
      ('carmen_whatsapp_sessions', 'idx_carmen_sessions_automation', 'i', array['automation_id'], null, null, 'CREATE INDEX idx_carmen_sessions_automation ON public.carmen_whatsapp_sessions USING btree (automation_id)'),
      ('communication_logs', 'idx_communication_logs_tenant', 'i', array['tenant_id', 'created_at'], null, null, 'CREATE INDEX idx_communication_logs_tenant ON public.communication_logs USING btree (tenant_id, created_at DESC)'),
      ('woocommerce_customers', 'idx_woo_customers_tenant', 'i', array['tenant_id'], null, null, 'CREATE INDEX idx_woo_customers_tenant ON public.woocommerce_customers USING btree (tenant_id)'),
      ('woocommerce_products', 'idx_woo_products_tenant', 'i', array['tenant_id'], null, null, 'CREATE INDEX idx_woo_products_tenant ON public.woocommerce_products USING btree (tenant_id)'),
      ('woocommerce_sync_log', 'idx_woo_sync_log_tenant', 'i', array['tenant_id'], null, null, 'CREATE INDEX idx_woo_sync_log_tenant ON public.woocommerce_sync_log USING btree (tenant_id)'),
      -- Check constraints.
      ('agent_runs', 'agent_runs_status_check', 'c', array['status'], null, null, 'CHECK ((status = ANY (ARRAY[''running''::text, ''waiting_approval''::text, ''completed''::text, ''failed''::text, ''cancelled''::text])))'),
      ('campaign_schedules', 'campaign_schedules_action_check', 'c', array['action'], null, null, 'CHECK ((action = ANY (ARRAY[''pause''::text, ''resume''::text])))'),
      ('campaign_schedules', 'campaign_schedules_entity_type_check', 'c', array['entity_type'], null, null, 'CHECK ((entity_type = ANY (ARRAY[''fb_campaign''::text, ''fb_adset''::text, ''fb_ad''::text, ''google_campaign''::text, ''google_adgroup''::text, ''google_ad''::text])))'),
      ('campaign_schedules', 'campaign_schedules_when_chk', 'c', array['cron_expression', 'run_at'], null, null, 'CHECK (((cron_expression IS NOT NULL) OR (run_at IS NOT NULL)))'),
      ('goals', 'goals_owner_type_check', 'c', array['owner_type'], null, null, 'CHECK ((owner_type = ANY (ARRAY[''agent''::text, ''campaigner''::text])))'),
      ('marketing_runs', 'marketing_runs_status_check', 'c', array['status'], null, null, 'CHECK ((status = ANY (ARRAY[''queued''::text, ''running''::text, ''awaiting_approval''::text, ''completed''::text, ''failed''::text, ''cancelled''::text])))'),
      ('marketing_stage_templates', 'marketing_stage_templates_default_approval_mode_check', 'c', array['default_approval_mode'], null, null, 'CHECK ((default_approval_mode = ANY (ARRAY[''manual''::text, ''auto''::text, ''hybrid''::text])))'),
      ('marketing_stage_templates', 'marketing_stage_templates_track_check', 'c', array['track'], null, null, 'CHECK ((track = ANY (ARRAY[''campaigns''::text, ''seo_geo''::text, ''social_organic''::text])))'),
      ('marketing_triggers', 'marketing_triggers_schedule_preset_check', 'c', array['schedule_preset'], null, null, 'CHECK ((schedule_preset = ANY (ARRAY[''daily''::text, ''weekly''::text, ''monthly''::text, ''hourly''::text])))'),
      ('marketing_triggers', 'marketing_triggers_trigger_type_check', 'c', array['trigger_type'], null, null, 'CHECK ((trigger_type = ANY (ARRAY[''schedule''::text, ''event''::text, ''manual''::text])))'),
      ('maskyoo_numbers', 'maskyoo_numbers_category_check', 'c', array['category'], null, null, 'CHECK ((category = ANY (ARRAY[''organic''::text, ''paid''::text, ''general''::text])))'),
      ('seo_call_snapshots', 'seo_call_snapshots_category_check', 'c', array['category'], null, null, 'CHECK ((category = ANY (ARRAY[''organic''::text, ''paid''::text])))'),
      ('social_publications', 'social_publications_post_type_check', 'c', array['post_type'], null, null, 'CHECK ((post_type = ANY (ARRAY[''post''::text, ''photo''::text, ''video''::text, ''reel''::text, ''story''::text, ''link''::text])))'),
      ('social_publications', 'social_publications_status_check', 'c', array['status'], null, null, 'CHECK ((status = ANY (ARRAY[''pending''::text, ''processing''::text, ''published''::text, ''failed''::text])))'),
      ('tasks', 'priority_value_range', 'c', array['priority'], null, null, 'CHECK (((priority >= 1) AND (priority <= 10)))'),
      ('telegram_messages', 'telegram_messages_direction_check', 'c', array['direction'], null, null, 'CHECK ((direction = ANY (ARRAY[''inbound''::text, ''outbound''::text])))'),
      ('whatsapp_sessions', 'whatsapp_sessions_status_check', 'c', array['status'], null, null, 'CHECK ((status = ANY (ARRAY[''active''::text, ''ended''::text])))'),
      -- Foreign keys.
      ('agent_action_log', 'agent_action_log_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL'),
      ('agent_action_log', 'agent_action_log_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('agent_approval_queue', 'agent_approval_queue_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('agent_eval_runs', 'agent_eval_runs_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE'),
      ('agent_eval_runs', 'agent_eval_runs_eval_id_fkey', 'f', array['eval_id'], 'public.agent_evals', array['id'], 'FOREIGN KEY (eval_id) REFERENCES public.agent_evals(id) ON DELETE CASCADE'),
      ('agent_evals', 'agent_evals_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE'),
      ('agent_goals', 'agent_goals_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE'),
      ('agent_knowledge_folders', 'agent_knowledge_folders_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE'),
      ('agent_knowledge_folders', 'agent_knowledge_folders_parent_folder_id_fkey', 'f', array['parent_folder_id'], 'public.agent_knowledge_folders', array['id'], 'FOREIGN KEY (parent_folder_id) REFERENCES public.agent_knowledge_folders(id) ON DELETE CASCADE'),
      ('agent_knowledge_items', 'agent_knowledge_items_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE'),
      ('agent_knowledge_items', 'agent_knowledge_items_folder_id_fkey', 'f', array['folder_id'], 'public.agent_knowledge_folders', array['id'], 'FOREIGN KEY (folder_id) REFERENCES public.agent_knowledge_folders(id) ON DELETE SET NULL'),
      ('agent_mcp_connections', 'agent_mcp_connections_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE'),
      ('agent_memory', 'agent_memory_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE'),
      ('agent_runs', 'agent_runs_delegated_to_agent_id_fkey', 'f', array['delegated_to_agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (delegated_to_agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL'),
      ('agent_runs', 'agent_runs_parent_run_id_fkey', 'f', array['parent_run_id'], 'public.agent_runs', array['id'], 'FOREIGN KEY (parent_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL'),
      ('agent_runs', 'agent_runs_replay_of_run_id_fkey', 'f', array['replay_of_run_id'], 'public.agent_runs', array['id'], 'FOREIGN KEY (replay_of_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL'),
      ('agent_tasks', 'agent_tasks_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('agent_user_profiles', 'agent_user_profiles_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE'),
      ('ahrefs_reports', 'ahrefs_reports_agency_id_fkey', 'f', array['agency_id'], 'public.agencies', array['id'], 'FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL'),
      ('ahrefs_reports', 'ahrefs_reports_client_id_fkey', 'f', array['client_id'], 'public.clients', array['id'], 'FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL'),
      ('ahrefs_reports', 'ahrefs_reports_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('ai_skills', 'ai_skills_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('automation_executions', 'automation_executions_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('automation_shared_tenants', 'automation_shared_tenants_automation_id_fkey', 'f', array['automation_id'], 'public.automations', array['id'], 'FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE'),
      ('automation_shared_tenants', 'automation_shared_tenants_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('carmen_whatsapp_sessions', 'carmen_whatsapp_sessions_ai_conversation_id_fkey', 'f', array['ai_conversation_id'], 'public.ai_conversations', array['id'], 'FOREIGN KEY (ai_conversation_id) REFERENCES public.ai_conversations(id) ON DELETE SET NULL'),
      ('carmen_whatsapp_sessions', 'carmen_whatsapp_sessions_automation_id_fkey', 'f', array['automation_id'], 'public.automations', array['id'], 'FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE SET NULL'),
      ('communication_logs', 'communication_logs_client_id_fkey', 'f', array['client_id'], 'public.clients', array['id'], 'FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE'),
      ('communication_logs', 'communication_logs_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('goals', 'goals_parent_goal_id_fkey', 'f', array['parent_goal_id'], 'public.goals', array['id'], 'FOREIGN KEY (parent_goal_id) REFERENCES public.goals(id) ON DELETE SET NULL'),
      ('goals', 'goals_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('heartbeat_logs', 'heartbeat_logs_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL'),
      ('heartbeat_logs', 'heartbeat_logs_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('integration_health', 'integration_health_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('invoice_uploads', 'invoice_uploads_agency_id_fkey', 'f', array['agency_id'], 'public.agencies', array['id'], 'FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL'),
      ('invoice_uploads', 'invoice_uploads_client_id_fkey', 'f', array['client_id'], 'public.clients', array['id'], 'FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL'),
      ('invoice_uploads', 'invoice_uploads_finance_id_fkey', 'f', array['finance_id'], 'public.finance', array['id'], 'FOREIGN KEY (finance_id) REFERENCES public.finance(id) ON DELETE SET NULL'),
      ('invoice_uploads', 'invoice_uploads_supplier_id_fkey', 'f', array['supplier_id'], 'public.suppliers', array['id'], 'FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL'),
      ('invoice_uploads', 'invoice_uploads_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('job_queue', 'job_queue_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('marketing_ab_variants', 'marketing_ab_variants_stage_id_fkey', 'f', array['stage_id'], 'public.marketing_pipeline_stages', array['id'], 'FOREIGN KEY (stage_id) REFERENCES public.marketing_pipeline_stages(id) ON DELETE SET NULL'),
      ('marketing_ab_variants', 'marketing_ab_variants_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('marketing_ab_variants', 'marketing_ab_variants_work_item_id_fkey', 'f', array['work_item_id'], 'public.marketing_work_items', array['id'], 'FOREIGN KEY (work_item_id) REFERENCES public.marketing_work_items(id) ON DELETE CASCADE'),
      ('marketing_item_transitions', 'marketing_item_transitions_item_id_fkey', 'f', array['item_id'], 'public.marketing_work_items', array['id'], 'FOREIGN KEY (item_id) REFERENCES public.marketing_work_items(id) ON DELETE CASCADE'),
      ('marketing_pipeline_stages', 'marketing_pipeline_stages_parent_stage_id_fkey', 'f', array['parent_stage_id'], 'public.marketing_pipeline_stages', array['id'], 'FOREIGN KEY (parent_stage_id) REFERENCES public.marketing_pipeline_stages(id) ON DELETE SET NULL'),
      ('marketing_work_items', 'marketing_work_items_pipeline_id_fkey', 'f', array['pipeline_id'], 'public.marketing_pipelines', array['id'], 'FOREIGN KEY (pipeline_id) REFERENCES public.marketing_pipelines(id) ON DELETE CASCADE'),
      ('maskyoo_numbers', 'maskyoo_numbers_client_id_fkey', 'f', array['client_id'], 'public.clients', array['id'], 'FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL'),
      ('processed_events', 'processed_events_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('seo_monthly_updates', 'seo_monthly_updates_client_id_fkey', 'f', array['client_id'], 'public.clients', array['id'], 'FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE'),
      ('seo_monthly_updates', 'seo_monthly_updates_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('social_media_wordpress_sites', 'social_media_wordpress_sites_agency_id_fkey', 'f', array['agency_id'], 'public.agencies', array['id'], 'FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL'),
      ('social_media_wordpress_sites', 'social_media_wordpress_sites_client_id_fkey', 'f', array['client_id'], 'public.clients', array['id'], 'FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL'),
      ('social_publications', 'social_publications_page_id_fkey', 'f', array['page_id'], 'public.social_pages', array['id'], 'FOREIGN KEY (page_id) REFERENCES public.social_pages(id) ON DELETE SET NULL'),
      ('telegram_bot_state', 'telegram_bot_state_shared_from_state_id_fkey', 'f', array['shared_from_state_id'], 'public.telegram_bot_state', array['id'], 'FOREIGN KEY (shared_from_state_id) REFERENCES public.telegram_bot_state(id) ON DELETE CASCADE'),
      ('telegram_bot_state', 'telegram_bot_state_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      -- No ON DELETE action, as before the loss: Production has no Telegram message (0 rows), so none would block a delete.
      ('telegram_messages', 'telegram_messages_client_id_fkey', 'f', array['client_id'], 'public.clients', array['id'], 'FOREIGN KEY (client_id) REFERENCES public.clients(id)'),
      ('telegram_messages', 'telegram_messages_lead_id_fkey', 'f', array['lead_id'], 'public.leads', array['id'], 'FOREIGN KEY (lead_id) REFERENCES public.leads(id)'),
      ('telegram_messages', 'telegram_messages_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('tenant_heartbeat_settings', 'tenant_heartbeat_settings_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('tenant_rate_limits', 'tenant_rate_limits_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('woocommerce_customers', 'woocommerce_customers_site_id_fkey', 'f', array['site_id'], 'public.social_media_wordpress_sites', array['id'], 'FOREIGN KEY (site_id) REFERENCES public.social_media_wordpress_sites(id) ON DELETE CASCADE'),
      ('woocommerce_customers', 'woocommerce_customers_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('woocommerce_orders', 'woocommerce_orders_site_id_fkey', 'f', array['site_id'], 'public.social_media_wordpress_sites', array['id'], 'FOREIGN KEY (site_id) REFERENCES public.social_media_wordpress_sites(id) ON DELETE CASCADE'),
      ('woocommerce_orders', 'woocommerce_orders_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('woocommerce_products', 'woocommerce_products_site_id_fkey', 'f', array['site_id'], 'public.social_media_wordpress_sites', array['id'], 'FOREIGN KEY (site_id) REFERENCES public.social_media_wordpress_sites(id) ON DELETE CASCADE'),
      ('woocommerce_products', 'woocommerce_products_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('woocommerce_sync_log', 'woocommerce_sync_log_site_id_fkey', 'f', array['site_id'], 'public.social_media_wordpress_sites', array['id'], 'FOREIGN KEY (site_id) REFERENCES public.social_media_wordpress_sites(id) ON DELETE CASCADE'),
      ('woocommerce_sync_log', 'woocommerce_sync_log_tenant_id_fkey', 'f', array['tenant_id'], 'public.tenants', array['id'], 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      -- Foreign keys to auth.users near the end: their lock on auth.users is held for a short time.
      ('seo_monthly_updates', 'seo_monthly_updates_updated_by_fkey', 'f', array['updated_by'], 'auth.users', array['id'], 'FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      -- Replaced last (see v_replace): dropping the old key locks ai_agents against reads until commit.
      ('agent_approval_queue', 'agent_approval_queue_agent_id_fkey', 'f', array['agent_id'], 'public.ai_agents', array['id'], 'FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL')
    ) as t (table_name, constraint_name, kind, columns, ref_table, ref_columns, definition)
  ) as s;

  -- The only data change: rows whose client no longer exists. Each is copied to
  -- archive.orphan_rows, then deleted where client_id cannot be null, or its client_id
  -- cleared where it can. One statement per table, so exactly the archived rows change.
  -- A re-run finds none.
  for r in
    select * from (values
      ('communication_logs', 'delete'),
      ('seo_monthly_updates', 'delete'),
      ('ahrefs_reports', 'clear'),
      ('maskyoo_numbers', 'clear')
    ) as o (table_name, action)
  loop
    v_rel := to_regclass(format('public.%I', r.table_name));
    if v_rel is null or not exists (
      select 1 from pg_attribute as a
      where a.attrelid = v_rel and a.attname = 'client_id' and a.attnum > 0 and not a.attisdropped
    ) then
      continue;
    end if;
    if r.action = 'delete' then
      execute format(
        $sql$
        with orphan as (
          delete from %1$s as t
          where t.client_id is not null
            and not exists (select 1 from public.clients as c where c.id = t.client_id)
          returning t.*
        ), archived as (
          insert into archive.orphan_rows (source_table, row_id, row, reason)
          select %2$L, o.id, to_jsonb(o), %3$L from orphan as o
          on conflict do nothing
          returning 1
        )
        select (select count(*) from orphan), (select count(*) from archived)
        $sql$,
        v_rel, r.table_name, 'client_id pointed at a deleted client; row deleted by 20261103100000'
      ) into v_count, v_archived;
    else
      execute format(
        $sql$
        with orphan as (
          select t.id, to_jsonb(t) as row
          from %1$s as t
          where t.client_id is not null
            and not exists (select 1 from public.clients as c where c.id = t.client_id)
          for update of t
        ), archived as (
          insert into archive.orphan_rows (source_table, row_id, row, reason)
          select %2$L, o.id, o.row, %3$L from orphan as o
          on conflict do nothing
          returning 1
        ), cleared as (
          update %1$s as t set client_id = null
          from orphan as o
          where t.id = o.id
          returning 1
        )
        select (select count(*) from cleared), (select count(*) from archived)
        $sql$,
        v_rel, r.table_name, 'client_id pointed at a deleted client; client_id cleared by 20261103100000'
      ) into v_count, v_archived;
    end if;
    if v_count > 0 then
      raise notice 'restore lost constraints: % rows of public.% archived (%) and %',
        v_count, r.table_name, v_archived, case r.action when 'delete' then 'deleted' else 'cleared' end;
    end if;
  end loop;

  for r in
    select x.*
    from jsonb_to_recordset(v_spec) as x (
      ord int, table_name text, constraint_name text, kind text, columns text[],
      ref_table text, ref_columns text[], definition text
    )
    order by x.ord
  loop
    -- Skip a constraint whose table, column, parent or parent column is missing.
    v_rel := to_regclass(format('public.%I', r.table_name));
    v_ref := case when r.kind = 'f' then to_regclass(r.ref_table) end;
    v_missing := null;
    if v_rel is null then
      v_missing := format('table public.%s', r.table_name);
    else
      select string_agg(c, ', ') into v_missing
      from unnest(r.columns) as c
      where not exists (
        select 1 from pg_attribute as a
        where a.attrelid = v_rel and a.attname = c and a.attnum > 0 and not a.attisdropped
      );
      if v_missing is not null then
        v_missing := format('column %s of public.%s', v_missing, r.table_name);
      elsif r.kind = 'f' and v_ref is null then
        v_missing := format('table %s', r.ref_table);
      elsif r.kind = 'f' then
        select string_agg(c, ', ') into v_missing
        from unnest(r.ref_columns) as c
        where not exists (
          select 1 from pg_attribute as a
          where a.attrelid = v_ref and a.attname = c and a.attnum > 0 and not a.attisdropped
        );
        if v_missing is not null then
          v_missing := format('column %s of %s', v_missing, r.ref_table);
        end if;
      end if;
    end if;
    if v_missing is not null then
      raise notice 'restore lost constraints: % skipped, % does not exist', r.constraint_name, v_missing;
      v_skipped := v_skipped || r.constraint_name;
      continue;
    end if;

    if r.kind = 'i' then
      if to_regclass(format('public.%I', r.constraint_name)) is not null then
        raise notice 'restore lost constraints: index % already exists', r.constraint_name;
      else
        execute r.definition;
      end if;
      continue;
    end if;

    select c.oid, c.convalidated into v_oid, v_valid
    from pg_constraint as c
    where c.conrelid = v_rel and c.conname = r.constraint_name;

    if v_oid is not null and r.constraint_name = any (v_replace) then
      v_def := regexp_replace(replace(pg_get_constraintdef(v_oid), 'REFERENCES public.', 'REFERENCES '), ' NOT VALID$', '');
      if v_def <> replace(r.definition, 'REFERENCES public.', 'REFERENCES ') then
        execute format('alter table %s drop constraint %I', v_rel, r.constraint_name);
        raise notice 'restore lost constraints: % replaced, it was %', r.constraint_name, v_def;
        v_oid := null;
      end if;
    end if;

    if r.kind = 'u' then
      if v_oid is not null then
        raise notice 'restore lost constraints: % already exists', r.constraint_name;
        continue;
      end if;
      execute format(
        'select count(*) from (select 1 from %s where %s group by %s having count(*) > 1) as d',
        v_rel,
        (select string_agg(format('%I is not null', c), ' and ') from unnest(r.columns) as c),
        (select string_agg(format('%I', c), ', ') from unnest(r.columns) as c)
      ) into v_count;
      if v_count > 0 then
        raise warning 'restore lost constraints: % skipped, % duplicate groups in public.%',
          r.constraint_name, v_count, r.table_name;
        v_duplicated := v_duplicated || r.constraint_name;
        continue;
      end if;
      execute format('alter table %s add constraint %I %s', v_rel, r.constraint_name, r.definition);
      continue;
    end if;

    -- Check or foreign key: add it NOT VALID, then validate it on its own.
    if v_oid is null then
      if r.kind = 'f' and not exists (
        select 1 from pg_index as x
        where x.indrelid = v_ref and x.indisunique and x.indpred is null and x.indexprs is null
          and x.indnkeyatts = cardinality(r.ref_columns)
          and (
            select array_agg(a.attname::text order by a.attname)
            from pg_attribute as a
            where a.attrelid = v_ref and a.attnum = any (x.indkey::int2[])
          ) = (select array_agg(c order by c) from unnest(r.ref_columns) as c)
      ) then
        raise exception 'restore lost constraints: % needs a primary or unique key on %(%); apply 20261102113100_missing_primary_keys first',
          r.constraint_name, r.ref_table, array_to_string(r.ref_columns, ', ');
      end if;
      execute format('alter table %s add constraint %I %s not valid', v_rel, r.constraint_name, r.definition);
    elsif v_valid then
      raise notice 'restore lost constraints: % already exists', r.constraint_name;
      continue;
    end if;

    begin
      execute format('alter table %s validate constraint %I', v_rel, r.constraint_name);
    exception when foreign_key_violation or check_violation then
      if r.kind = 'f' then
        v_count_sql := format(
          'select count(*) from %s as c where %s and not exists (select 1 from %s as p where %s)',
          v_rel,
          (select string_agg(format('c.%I is not null', c), ' and ') from unnest(r.columns) as c),
          v_ref,
          (select string_agg(format('p.%I = c.%I', u.rc, u.c), ' and ')
           from unnest(r.ref_columns, r.columns) as u (rc, c))
        );
      else
        v_count_sql := format('select count(*) from %s where not coalesce(%s, true)', v_rel, substr(r.definition, 7));
      end if;
      execute v_count_sql into v_count;
      raise warning 'restore lost constraints: % stays NOT VALID, % rows of public.% break it',
        r.constraint_name, v_count, r.table_name;
      v_not_valid := v_not_valid || r.constraint_name;
    end;
  end loop;

  -- Guard: every constraint and index above exists with its expected definition, and only a
  -- constraint this run reported as broken is NOT VALID.
  for r in
    select x.*
    from jsonb_to_recordset(v_spec) as x (
      ord int, table_name text, constraint_name text, kind text, columns text[],
      ref_table text, ref_columns text[], definition text
    )
    where not (x.constraint_name = any (v_skipped) or x.constraint_name = any (v_duplicated))
    order by x.ord
  loop
    v_rel := to_regclass(format('public.%I', r.table_name));
    if r.kind = 'i' then
      select pg_get_indexdef(x.indexrelid) into v_def
      from pg_index as x
      where x.indexrelid = to_regclass(format('public.%I', r.constraint_name)) and x.indrelid = v_rel;
      if v_def is distinct from r.definition then
        v_problems := v_problems || format('index %s is %s', r.constraint_name, coalesce(v_def, 'missing'));
      end if;
      continue;
    end if;
    v_oid := null;
    select c.oid, c.convalidated, replace(pg_get_constraintdef(c.oid), 'REFERENCES public.', 'REFERENCES ')
    into v_oid, v_valid, v_def
    from pg_constraint as c
    where c.conrelid = v_rel and c.conname = r.constraint_name and c.contype = r.kind;
    if v_oid is null then
      v_problems := v_problems || format('%s is missing', r.constraint_name);
    elsif regexp_replace(v_def, ' NOT VALID$', '') <> replace(r.definition, 'REFERENCES public.', 'REFERENCES ') then
      v_problems := v_problems || format('%s is %s', r.constraint_name, v_def);
    elsif not v_valid and not r.constraint_name = any (v_not_valid) then
      v_problems := v_problems || format('%s is NOT VALID but was not reported as broken', r.constraint_name);
    end if;
  end loop;

  if cardinality(v_problems) > 0 then
    raise exception 'restore lost constraints guard: %', array_to_string(v_problems, '; ');
  end if;
end;
$$;
