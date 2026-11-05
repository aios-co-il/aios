-- Primary keys for the public tables that have none. The Production baseline
-- (20261009000000_production_baseline.sql) came without them: Production has
-- 61 public tables without a primary key and Staging 53 (read-only counts,
-- 2026-11-01). The gap already broke Carmen's reminders: agent_tasks is in the
-- supabase_realtime publication, and without a key it has no replica identity,
-- so every UPDATE of it failed. agent_tasks is left to #1009
-- (20261101102500), which adds its key together with switching off the
-- reminders missed meanwhile; keying it here alone could fire them.
--
-- tenant_heartbeat_settings has no id; it is keyed on tenant_id, which the
-- Heartbeat settings panel's upsert needs to find the tenant's row. The other
-- 50 tables are keyed on id: every id column is NOT NULL, none has a unique
-- index on (id) alone to reuse, and on Production every id is unique.
-- Not keyed here: processed_webhook_messages (no id; its unique index already
-- dedupes it) and the Production-only leftovers _d_*, _pol_log and _sqlbuf.
--
-- ALTER TABLE ... ADD PRIMARY KEY builds a unique index under an ACCESS
-- EXCLUSIVE lock that is held until this migration commits: a few seconds on
-- carmen_memory_outbox (596,640 rows on Production), less on campaign_alerts
-- (113,292) and automation_executions (43,857), and the rest are small. The
-- three big tables go first, so the small ones stay locked only briefly.
-- Nothing is sent and no row changes.
--
-- A key is added only when its table and column exist and the table has no
-- primary key yet, so this is safe on Staging, Previews and Production and on
-- a re-run. Duplicate or null values stop the migration, naming the table.

do $$
declare
  k record;
  v_rel regclass;
  v_duplicates bigint;
  v_nulls bigint;
begin
  for k in
    select * from (values
      ('carmen_memory_outbox', 'id'),
      ('campaign_alerts', 'id'),
      ('automation_executions', 'id'),
      ('agent_action_log', 'id'),
      ('agent_approval_queue', 'id'),
      ('agent_eval_runs', 'id'),
      ('agent_evals', 'id'),
      ('agent_goals', 'id'),
      ('agent_knowledge_folders', 'id'),
      ('agent_knowledge_items', 'id'),
      ('agent_mcp_connections', 'id'),
      ('agent_memory', 'id'),
      ('agent_runs', 'id'),
      ('agent_supervisors', 'id'),
      ('agent_tools', 'id'),
      ('agent_user_profiles', 'id'),
      ('ahrefs_reports', 'id'),
      ('ai_skills', 'id'),
      ('campaign_schedules', 'id'),
      ('carmen_memory_episodes', 'id'),
      ('carmen_memory_pointers', 'id'),
      ('carmen_whatsapp_sessions', 'id'),
      ('communication_logs', 'id'),
      ('heartbeat_logs', 'id'),
      ('integration_alerts_log', 'id'),
      ('integration_health', 'id'),
      ('invoice_uploads', 'id'),
      ('job_queue', 'id'),
      ('marketing_item_transitions', 'id'),
      ('marketing_media_library', 'id'),
      ('marketing_runs', 'id'),
      ('marketing_stage_templates', 'id'),
      ('marketing_triggers', 'id'),
      ('maskyoo_manual_overrides', 'id'),
      ('maskyoo_numbers', 'id'),
      ('maskyoo_settings', 'id'),
      ('processed_events', 'id'),
      ('seo_call_snapshots', 'id'),
      ('seo_monthly_updates', 'id'),
      ('social_comments', 'id'),
      ('social_publications', 'id'),
      ('telegram_bot_state', 'id'),
      ('telegram_messages', 'id'),
      ('tenant_heartbeat_settings', 'tenant_id'),
      ('tenant_rate_limits', 'id'),
      ('user_workspace_layout', 'id'),
      ('whatsapp_sessions', 'id'),
      ('woocommerce_customers', 'id'),
      ('woocommerce_orders', 'id'),
      ('woocommerce_products', 'id'),
      ('woocommerce_sync_log', 'id')
    ) as t (table_name, column_name)
  loop
    v_rel := to_regclass(format('public.%I', k.table_name));
    if v_rel is null then
      raise notice 'missing primary keys: public.% does not exist, skipped', k.table_name;
      continue;
    end if;
    if exists (select 1 from pg_constraint where conrelid = v_rel and contype = 'p') then
      raise notice 'missing primary keys: public.% already has a primary key, skipped', k.table_name;
      continue;
    end if;
    if not exists (
      select 1 from pg_attribute
      where attrelid = v_rel and attname = k.column_name and attnum > 0 and not attisdropped
    ) then
      raise notice 'missing primary keys: public.% has no column %, skipped', k.table_name, k.column_name;
      continue;
    end if;

    execute format(
      'select count(%1$I) - count(distinct %1$I), count(*) - count(%1$I) from %2$s',
      k.column_name, v_rel
    ) into v_duplicates, v_nulls;
    if v_duplicates > 0 or v_nulls > 0 then
      raise exception 'missing primary keys: public.%.% has % duplicate and % null values',
        k.table_name, k.column_name, v_duplicates, v_nulls;
    end if;

    execute format('alter table %s add primary key (%I)', v_rel, k.column_name);
  end loop;
end;
$$;
