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
-- Data change, the only one: the rows whose client no longer existed on
-- Production (read-only, 2026-11-03), pinned by id in the archive step below;
-- Staging has none, so the ids match nothing there. Most of those clients were
-- duplicates; past clients are made inactive, not deleted. Each row whose client
-- still does not exist is first copied, as jsonb, to archive.orphan_rows, a new
-- table in a new schema that is not exposed to the API. Then:
--   communication_logs   116 of 1,124 rows  deleted (client_id is NOT NULL)
--   seo_monthly_updates   55 of 427         deleted (client_id is NOT NULL)
--   ahrefs_reports         3 of 219         client_id cleared, report kept
--   maskyoo_numbers        3 of 71          client_id cleared, number kept
-- after which their 4 client keys validate. The clears fire
-- maskyoo_numbers_updated_at, which sets updated_at; the deletes fire no trigger
-- and no table references these rows. The run stops if the rows archived and the
-- rows changed differ, and a re-run archives and changes nothing. A row that
-- loses its client after 2026-11-03 is not touched: its key stays NOT VALID with
-- the WARNING below, and a follow-up migration, after review, handles it.
--
-- No other foreign key has an orphan, no check fails on any row and no unique
-- key has a duplicate, and Staging breaks none of them. If validation still
-- fails anywhere, the constraint stays NOT VALID and a WARNING names it with its
-- count of rows, so the deploy does not fail; it still checks every new row and
-- changed key. A unique key with duplicates is skipped the same way.
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
  'Rows a migration deleted or changed, as they were before. 20261103110000_restore_lost_constraints: rows whose client was deleted.';

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

  -- The only data change: the rows that pointed at a deleted client on Production
  -- (read-only, 2026-11-03), pinned by id. Each one whose client still does not exist is
  -- copied to archive.orphan_rows, then deleted where client_id cannot be null, or its
  -- client_id cleared where it can. One statement per table, so exactly the archived rows
  -- change, and the run stops if the two counts differ. Other orphans are left alone: their
  -- key stays NOT VALID with a WARNING below. A re-run finds none of these rows.
  for r in
    select * from (values
      ('communication_logs', 'delete', array[
        '00f78116-91ef-4555-9f72-4f7dd0a88491', '02bf8bf8-7483-41ba-8831-8b4f31b63109', '0406a542-8cda-4a90-81b1-d5dd48c2ec3f',
        '04bc1bd6-83f2-42ea-9b86-65dfb112c72d', '0a5e6add-ed4b-432b-b96c-2e40ec264d0c', '0d54cb48-3f9a-4d3f-b6be-45ad049b6faa',
        '0e8f2fb3-1eed-49fe-9738-1ce9e6a23c0c', '0fafd291-6216-4667-8fec-3dc0c3940d0b', '10c18dd1-11dd-4184-9dcc-a15980e1f48e',
        '11b0c9a0-cabf-4357-9697-5163fe0a930b', '1774026b-ebf7-4719-a3d0-cff12bd679ec', '1843cddb-cd01-4ce2-a552-6fb2abc9391f',
        '187f7ca8-ad10-45a4-86bb-ee169778e2ac', '19068cf9-2c40-4c00-aebc-fe76a869acb6', '1ca1b5fb-d01d-4e1b-9b68-d50d526e28ad',
        '1fa15187-a94a-4e18-b66b-be69baa46237', '2048b89d-c59b-4a82-9e5c-f70b270c9390', '20e09dde-e690-451b-bac2-08eeb2ec68fc',
        '21ca9324-06f3-4513-be61-0cf642c26c34', '26231938-589b-4fb1-bf38-01d223736963', '293a891f-c080-4598-aa14-ce8b0b20a9a1',
        '2e6ae4c3-ac20-4035-98e4-55b0aaf76e3c', '2f0be620-8511-4587-95ad-4981d725d7a0', '3237520b-05b9-4ab7-a8e7-bf4f8f5b8e4b',
        '35b0029f-808f-422f-9fc2-9df2962ed45d', '37d36ecc-2b74-4c33-81e4-a8ddbb033ba9', '38247faf-8ea1-48bf-b11f-08b84a7d5543',
        '41f0a55a-e445-42e7-9dd8-282f74ce1873', '48180169-cbc1-47d4-bc84-7d6a56f3dfc7', '4b3a3895-e92c-43be-ab76-7e4957dbea1e',
        '4e27df42-3992-4c61-9abc-51759aca9af2', '4ed3b84e-60a1-48f7-94fd-af23c28addc9', '4effecf0-2ab8-4c50-8a69-6b877e621e12',
        '505620a8-77c2-42c7-b67f-9aecb1547410', '521f2d6d-6903-4346-aa9b-06cded513f2f', '5500839d-37a2-40a9-8093-0efb6e956526',
        '5518bd3a-aba4-4d78-80ce-36a35ca724bd', '55a022b4-4771-4073-85d3-cf956803fe22', '592e8bdc-b0b4-4502-a232-8bbc5702501c',
        '593be90a-6aa7-4345-ae70-2ade43611174', '5aecf6af-756e-405e-8634-4796cc90a7d5', '5b2fbe8d-f93f-4281-948d-8213c8185a21',
        '5b46bc94-9408-452c-9eec-5e2225c1b924', '5c6b3dd4-d1de-42f5-ab8e-6e49cc69e59d', '5d2fc273-8471-4210-9cbe-2e8585e6ec50',
        '5e11b1a2-29ae-4392-9ccb-0f388a1b7e69', '5e91c551-51c4-4f58-9ac5-d597c3bd08c4', '5f80d648-c73f-44dc-9372-e17054a504ed',
        '603a2bbd-6bcf-48bc-9cae-0872fd21eb44', '6141ee1f-8049-4e0c-8067-39491616c67a', '61bffff7-cb58-4e63-adfe-06e217dfa6cf',
        '650e05e3-5029-4417-bfbb-63590ce1103b', '66f5745a-55a3-465d-8df3-a79479226104', '67b20001-0522-485d-9186-ab5634180415',
        '6d37044c-ab7b-4e04-95d0-4a9e9c1513c9', '7493d65e-3d1c-44ba-b930-0c37d42d5de8', '74afde9c-382b-4201-b09a-35516e176aa9',
        '758d5d9c-1686-4f0a-8427-ba947f15b3b8', '7aa3de47-236f-4102-868e-c526dbbbc618', '7ac89c28-36bd-4f0f-bd22-45994b275a4b',
        '88181610-3ceb-43ee-926f-001dcd31ae1b', '88790c34-9022-45d5-91c6-aaf3242d2331', '8aa00e42-37c2-4a61-a2ea-66c258a62a85',
        '8cbc8b11-ad11-4cee-8348-9931d5a81f59', '8d0afd04-6ce1-4126-8066-7e2cbce1a7f5', '900e2da7-53b5-4878-b967-5b66869a99c9',
        '9406d8ae-d19a-4fc4-9e28-ef27781751dc', '9950e944-5ba1-4691-b07b-f7237ae9ce89', 'a492f265-2bb1-487b-93ce-f851d3d14da4',
        'a858bc08-40fd-4347-bf7b-abf3cefd16b3', 'a8fd942b-ef69-40f5-a763-75efdc5f5b2f', 'aa2fc400-a629-4e30-95cf-bf934f1810fd',
        'ada9802a-e597-4541-8db5-5f4f3f8191e8', 'b0fd5470-9541-4d34-ab6c-88802174c9fe', 'b345bd09-d348-4191-8735-368cea48a9f5',
        'b6807e79-da0a-4277-af6c-5104a46faab5', 'b6dac23e-7572-4e9b-9836-4893d52a19dd', 'b8ca2ea4-ee83-4325-88b8-84c4e6495b79',
        'bcea03f4-00dd-49ab-aa2d-409aa72e42cb', 'bda97755-cc37-422f-befb-3a7169e6bdbf', 'c00c8dc4-2ffe-49a9-b196-43ee2ee8218d',
        'c38413e3-bc87-41ba-b4ae-a8c023076861', 'c9f8117d-d328-44e3-a327-fa6f20d3c4a7', 'cbbc1903-e31b-4389-a3bf-78787cd10667',
        'cc5be348-98ec-43a1-a677-204c132e4b31', 'ccdcf052-d379-4ca3-985d-e1226fbd512c', 'cf1266a3-e575-44ea-ab59-2e5bb30ea656',
        'd66875ce-f25e-484a-83b6-3bc9f8399826', 'd7769e3a-bf97-4d7d-977b-7ddc91bd5877', 'd7cfe056-deda-43f5-a445-000dbeccc931',
        'd863c725-cf05-478f-95ad-684add7344ad', 'd8b82c42-f164-48ce-ba8f-a5c5665e192b', 'dcf14b4e-a5c5-44cd-9378-638fe081f59b',
        'de1e5f7e-b3b1-4dab-b51f-5d6ebb948f00', 'de2c4218-c5e8-4707-8c58-0e7ee2dd3539', 'df244385-a1c5-470d-8de9-dbdecc715147',
        'e115817c-0db8-4af4-99ac-713cc258a33f', 'e16f1e90-9395-4ccd-a202-9432a573bc56', 'e1f75ca4-7c81-4171-9d64-6bbeef6ff929',
        'e2c083b7-8be7-42f1-87c3-06794738c002', 'e689d63b-3339-4398-aabd-efb292f28e67', 'e6e9e166-e22d-4c19-8c08-5338c9e960d8',
        'eb4eedd0-2f80-41e9-9a03-307febeee303', 'ee1f665b-a14f-48ea-bd51-a5142b97f9f8', 'ef697f91-09ed-4331-8abb-a63cf4aa9a00',
        'f1aac024-fab5-4de9-8726-d06a4a24121b', 'f1ae11db-46fd-4717-87ed-b16f968915cf', 'f40079c3-9e75-4c72-810c-8df86a6bdfd2',
        'f46e9363-aac6-4d29-83a3-ab8c5dc71fb1', 'f5adbd2b-cea7-4dd6-9a92-d5e44c5f7041', 'f966e7e9-28db-40d3-8a57-0c1e7b90ad72',
        'fa524a64-6f51-49d0-9f32-cfe7202e8fbd', 'fa5655de-70c6-4906-8cbc-6c18667f49f2', 'fc47885c-9399-4dbf-908e-bdd724e3ade7',
        'fe702a61-9e60-46ab-a46d-2f4c6c0a2431', 'ffb19945-3a5e-4aef-ab4a-8daeb5f72be6'
      ]::uuid[]),
      ('seo_monthly_updates', 'delete', array[
        '02c0a6e6-51b6-4c77-8c06-e78b716f9430', '0a0ef6fd-a1de-4dca-89ad-fa9100eab98b', '17500b5b-b07b-40b2-a4c4-6bf27b898ce6',
        '1955c11e-54fa-403a-ba4e-654dc260f90d', '1a36a705-80c9-469d-87ad-38fd73b3fd89', '1c7fef9b-b78c-4776-bbf8-ebb1021563a8',
        '27adfa82-0fc1-46b4-9c7b-2aa380b2f5dc', '3268c157-0496-4f6a-9dd3-eda9d3762d5a', '33ef5d22-d3de-420c-9375-8b5653f35f45',
        '357083c8-aa6f-4c1d-a122-a2e210cc6f0e', '36fe0add-fa1b-48aa-889e-d5b0b41cca53', '43961947-85e5-4702-a8da-ae3cf00c0953',
        '466bbab5-00b2-4fe6-90e1-4eba0d0664a7', '512423df-502b-453b-82be-485d8e4b9b4e', '53b83137-4f86-4566-97db-9ebd2ada3127',
        '56d4e0cd-112d-4e70-b1c5-49e71e4018fd', '5891cfe5-ed8c-4a15-a66b-07f662fb2e3d', '59af0f21-4ef4-45d9-9be1-e27658fcfa01',
        '5ce9b7f4-7417-4052-9207-03966ab00056', '60ff88e5-fd4b-4093-be9a-dc2d0408bc65', '6f172588-2fcc-4652-bb23-06cac25d70ce',
        '75f6056e-211a-418f-8a17-4a477b196a8d', '7efe1997-815c-4d3d-bdc9-8f85ca60ad9d', '803eb1c4-78da-440a-befb-fb89012d65e6',
        '82cf11cf-6f10-4c45-86ac-b9f95d724bfb', '8b255710-12e6-4b1c-99fb-5c20dbc9e2c1', '9575a96d-ede4-4f34-a35a-6a539a5c4d16',
        '982870cc-a2c0-4a9e-aaf5-aca0b692a221', '9b3931ef-643c-4dda-acbb-edad22a1ff34', 'a3be82a9-521c-4a5d-b886-3922aa8103b7',
        'a6539e80-9538-44b0-82d4-791bc36edae5', 'acac0aa9-6bfc-478e-9be4-9cabaf4603ac', 'b0f0bc1d-09fc-4faa-b214-52d4a4d548a2',
        'b321497e-6cfd-476c-a194-48a91bcf8f42', 'b50d8861-ff4f-4aa9-b08a-56f2cf8708bc', 'b52c8841-2de8-4821-ae13-f318d9977baa',
        'b8d06a13-956d-40ff-8ee6-af9877b9df92', 'bccc41c9-791c-4104-a019-b5973522a365', 'bcffd3f8-b063-45b5-aabc-57699df1f716',
        'c1b41860-4078-43bb-b5ed-3b8274ea4f02', 'c1f5cada-b53f-402f-9f33-22451a82e72a', 'c54bf798-41bb-4076-a71e-8a311cb8377d',
        'cbb406e4-783f-482b-bd90-1e32c1bf2216', 'd68d8a58-2c72-4828-932e-91d86699a256', 'd995cfb5-6de1-4565-a9bf-7453d83f40d6',
        'dfc73869-931a-4a7f-bbfb-77bba3b86a95', 'e515b552-e0c3-4380-805c-42dfc0019535', 'e6feb6f0-53ef-42e9-93f2-9010d8d2e5c0',
        'e7664509-ffda-4699-86c4-98307bd8ec2f', 'ec031477-a688-4a6c-a6ae-51a29bc18b43', 'eebc9a1b-6716-4383-8307-3daeb33f17e8',
        'fc6e27f3-a20d-4d06-9e85-5e9f9258d718', 'fce28559-dcdc-467b-ad99-ffd11a8ec468', 'fe5c8add-5d07-4751-9f99-c7c7a9773e92',
        'ff8c3050-2fda-47b0-8aad-b52b412dde4e'
      ]::uuid[]),
      ('ahrefs_reports', 'clear', array[
        '1314fbfd-9a9c-47e7-bedf-36ef156e6475', 'f4015e28-132a-4fe9-8d98-03bbff2c9b43', 'f9954b77-ab5e-4232-9e2d-324acbb2aa02'
      ]::uuid[]),
      ('maskyoo_numbers', 'clear', array[
        '1d51b94d-aa3b-4705-a74d-4e5d5e23969b', '229eb67c-856d-4e50-9b1f-eaf06f814698', '27afbb31-0dcb-44d5-b528-a3d13d45366f'
      ]::uuid[])
    ) as o (table_name, action, ids)
  loop
    v_rel := to_regclass(format('public.%I', r.table_name));
    if v_rel is null or not exists (
      select 1 from pg_attribute as a
      where a.attrelid = v_rel and a.attname = 'client_id' and a.attnum > 0 and not a.attisdropped
    ) then
      raise notice 'restore lost constraints: archive step for public.% skipped, no client_id column', r.table_name;
      continue;
    end if;
    if r.action = 'delete' then
      execute format(
        $sql$
        with orphan as (
          delete from %1$s as t
          where t.id = any ($1)
            and t.client_id is not null
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
        v_rel, r.table_name, 'client_id pointed at a deleted client; row deleted by 20261103110000'
      ) into v_count, v_archived using r.ids;
    else
      execute format(
        $sql$
        with orphan as (
          select t.id, to_jsonb(t) as row
          from %1$s as t
          where t.id = any ($1)
            and t.client_id is not null
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
        v_rel, r.table_name, 'client_id pointed at a deleted client; client_id cleared by 20261103110000'
      ) into v_count, v_archived using r.ids;
    end if;
    if v_archived <> v_count then
      raise exception 'restore lost constraints: % rows of public.% %, but % archived',
        v_count, r.table_name, case r.action when 'delete' then 'deleted' else 'cleared' end, v_archived;
    end if;
    if v_count > 0 then
      raise notice 'restore lost constraints: % rows of public.% archived and %',
        v_count, r.table_name, case r.action when 'delete' then 'deleted' else 'cleared' end;
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
