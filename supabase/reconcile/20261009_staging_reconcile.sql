-- Staging reconcile: bring Staging's schema to the production baseline plus the catch-up
-- (20261009000000_production_baseline.sql + 20261009000100_catchup_shipped_schema.sql).
-- Run ONCE, by hand, on Staging only. Then repair Staging's migration history so both files
-- count as applied.
--
-- Keeps every row. Staging-only tables stay: environment_sync.* and agent_collaboration_*.
-- Drops Staging-only policies, triggers, functions, constraints and indexes. Converts column
-- types to prod's. Also undoes ten feature-branch migrations that ran on Staging through
-- Previews (video studio x8, agent_tasks cron schedule, agent_tasks concurrency cap); the
-- video scenes table is dropped with its rows. agent_tasks.next_run stays.
--
-- Known residual drift, left on purpose:
-- - lead_status keeps Staging's extra value 'negotiation' (Postgres cannot drop an enum value
--   without rebuilding the type; no code uses it).
-- - automation_action lists its values in a different order (sorting only).
-- - Cron jobs are untouched; they get their own migration.

BEGIN;

-- Refuse to run anywhere but Staging: only Staging has the environment_sync schema.
DO $$
BEGIN
  IF to_regclass('environment_sync.safety') IS NULL THEN
    RAISE EXCEPTION 'This is not Staging (environment_sync.safety is missing). Aborting.';
  END IF;
END $$;

SET LOCAL check_function_bodies = false;

-- 0. Undo feature-branch migrations that ran on Staging through Previews but are not on develop.
-- Each feature PR re-runs its own (idempotent) migration after it is rebased onto the baseline:
--   video studio: 20261014070000, 090000, 110000, 130000, 160000, 170000, 180000, 190000
--   (180000 inserted an ai_skills row, video_director; it is left in place, its re-run no-ops)
--   agent_tasks: 20261014120000_cron_schedule, 20261014130000_max_concurrency
-- Runs first: later steps rebuild marketing_assets_pkey, which the scenes foreign keys depend on.
-- agent_tasks.next_run stays: the cron-schedule migration uses it and re-running it is a no-op there.

-- 0a. Video studio: functions (the table's trigger function goes after the table)
DROP FUNCTION IF EXISTS "public"."advance_video_production"(uuid);
DROP FUNCTION IF EXISTS "public"."attach_video_scene_asset"(uuid, text, text, jsonb, uuid);
DROP FUNCTION IF EXISTS "public"."claim_video_run"(text[], text);
DROP FUNCTION IF EXISTS "public"."migrate_storyboard_to_video_scenes"(uuid);
DROP FUNCTION IF EXISTS "public"."produce_video"(uuid, text, text, jsonb, uuid, boolean, boolean, text, text, boolean);
DROP FUNCTION IF EXISTS "public"."queue_video_clips"(uuid, uuid[], text, jsonb, uuid, text, boolean);
DROP FUNCTION IF EXISTS "public"."queue_video_clips"(uuid, uuid[], text, jsonb, uuid);
DROP FUNCTION IF EXISTS "public"."queue_video_clips_superseded_5arg"(uuid, uuid[], text, jsonb, uuid);
DROP FUNCTION IF EXISTS "public"."queue_video_render"(uuid, text, uuid);
DROP FUNCTION IF EXISTS "public"."queue_video_sound"(uuid, text, uuid[], text, jsonb, uuid, text, text);
DROP FUNCTION IF EXISTS "public"."save_video_storyboard"(uuid, jsonb);
DROP FUNCTION IF EXISTS "public"."set_video_production"(uuid, jsonb);

-- 0b. Video studio: run-tracking columns, indexes and constraints on marketing_runs / marketing_assets
DROP INDEX IF EXISTS "public"."marketing_runs_one_active_item_job";
DROP INDEX IF EXISTS "public"."marketing_runs_one_active_scene_job";
DROP INDEX IF EXISTS "public"."marketing_runs_provider_job_idx";
DROP INDEX IF EXISTS "public"."marketing_runs_queued_kind_idx";
DROP INDEX IF EXISTS "public"."marketing_runs_scene_idx";
DROP INDEX IF EXISTS "public"."marketing_runs_scene_kind_idx";
DROP INDEX IF EXISTS "public"."marketing_assets_scene_idx";
ALTER TABLE "public"."marketing_runs" DROP CONSTRAINT IF EXISTS "marketing_runs_kind_check";
ALTER TABLE "public"."marketing_runs" DROP CONSTRAINT IF EXISTS "marketing_runs_scene_id_fkey";
ALTER TABLE "public"."marketing_runs"
  DROP COLUMN IF EXISTS "kind",
  DROP COLUMN IF EXISTS "scene_id",
  DROP COLUMN IF EXISTS "provider",
  DROP COLUMN IF EXISTS "provider_job_id",
  DROP COLUMN IF EXISTS "credits",
  DROP COLUMN IF EXISTS "attempts";

-- 0c. Video studio: scenes table (its rows, policies, triggers and realtime entry go with it),
-- then its trigger function and the enum
DROP TABLE IF EXISTS "public"."marketing_video_scenes";
DROP FUNCTION IF EXISTS "public"."marketing_video_scenes_guard"();
DROP TYPE IF EXISTS "public"."marketing_video_scene_status";

-- 0d. Video studio: storage policies, and the creative-video bucket only when it holds no objects
DROP POLICY IF EXISTS "creative_video_select" ON "storage"."objects";
DROP POLICY IF EXISTS "creative_video_insert" ON "storage"."objects";
DROP POLICY IF EXISTS "creative_video_update" ON "storage"."objects";
DROP POLICY IF EXISTS "creative_video_remove" ON "storage"."objects";
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'creative-video') THEN
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.buckets WHERE id = 'creative-video';
  ELSE
    RAISE NOTICE 'creative-video bucket still holds objects; left in place';
  END IF;
END $$;

-- 0e. Carmen tasks panel: cron schedule and per-task engine (next_run stays)
DROP INDEX IF EXISTS "public"."agent_tasks_cron_due_idx";
ALTER TABLE "public"."agent_tasks"
  DROP COLUMN IF EXISTS "timezone",
  DROP COLUMN IF EXISTS "engine_model";

-- 0f. Carmen task concurrency cap
ALTER TABLE "public"."tenant_heartbeat_settings"
  DROP CONSTRAINT IF EXISTS "tenant_heartbeat_settings_max_concurrent_tasks_check";
ALTER TABLE "public"."tenant_heartbeat_settings" DROP COLUMN IF EXISTS "max_concurrent_tasks";

-- 1. Drop Staging-only and changed policies
DROP POLICY IF EXISTS "Admins can remove members" ON "public"."team_channel_members";
DROP POLICY IF EXISTS "Admins or creators can add members" ON "public"."team_channel_members";
DROP POLICY IF EXISTS "All authenticated can read global skills" ON "public"."ai_skills";
DROP POLICY IF EXISTS "Allow insert for all" ON "public"."error_logs";
DROP POLICY IF EXISTS "Anyone can view public presets" ON "public"."terminology_presets";
DROP POLICY IF EXISTS "Authenticated users can create channels" ON "public"."team_channels";
DROP POLICY IF EXISTS "Authenticated users can delete agencies" ON "public"."agencies";
DROP POLICY IF EXISTS "Authenticated users can insert agencies" ON "public"."agencies";
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON "public"."clients";
DROP POLICY IF EXISTS "Authenticated users can update agencies" ON "public"."agencies";
DROP POLICY IF EXISTS "Channel admins can add members" ON "public"."team_channel_members";
DROP POLICY IF EXISTS "Channel admins can create invites" ON "public"."team_channel_invites";
DROP POLICY IF EXISTS "Channel admins can delete" ON "public"."team_channels";
DROP POLICY IF EXISTS "Channel admins can update" ON "public"."team_channels";
DROP POLICY IF EXISTS "Channel admins can update invites" ON "public"."team_channel_invites";
DROP POLICY IF EXISTS "Channel members can view invites" ON "public"."team_channel_invites";
DROP POLICY IF EXISTS "Cross-tenant agency members can view integrations" ON "public"."tenant_integrations";
DROP POLICY IF EXISTS "Delete maskyoo overrides" ON "public"."maskyoo_manual_overrides";
DROP POLICY IF EXISTS "Insert maskyoo overrides" ON "public"."maskyoo_manual_overrides";
DROP POLICY IF EXISTS "Members can add attachments" ON "public"."team_message_attachments";
DROP POLICY IF EXISTS "Members can add reactions" ON "public"."team_message_reactions";
DROP POLICY IF EXISTS "Members can send messages" ON "public"."team_messages";
DROP POLICY IF EXISTS "Members can view attachments" ON "public"."team_message_attachments";
DROP POLICY IF EXISTS "Members can view channel members" ON "public"."team_channel_members";
DROP POLICY IF EXISTS "Members can view messages" ON "public"."team_messages";
DROP POLICY IF EXISTS "Members can view reactions" ON "public"."team_message_reactions";
DROP POLICY IF EXISTS "Members can view their channels" ON "public"."team_channels";
DROP POLICY IF EXISTS "No direct read" ON "public"."error_logs";
DROP POLICY IF EXISTS "Owners can create templates from their tenant" ON "public"."tenant_templates";
DROP POLICY IF EXISTS "Owners can delete lead_sales_people" ON "public"."lead_sales_people";
DROP POLICY IF EXISTS "Owners can delete their templates" ON "public"."tenant_templates";
DROP POLICY IF EXISTS "Owners can insert lead_sales_people" ON "public"."lead_sales_people";
DROP POLICY IF EXISTS "Owners can manage telegram bot state" ON "public"."telegram_bot_state";
DROP POLICY IF EXISTS "Owners can update lead_sales_people" ON "public"."lead_sales_people";
DROP POLICY IF EXISTS "Owners can update their templates" ON "public"."tenant_templates";
DROP POLICY IF EXISTS "Owners manage own presets" ON "public"."terminology_presets";
DROP POLICY IF EXISTS "Restrict campaigner ahrefs reports to assigned clients" ON "public"."ahrefs_reports";
DROP POLICY IF EXISTS "Restrict campaigner record reads to assigned clients" ON "public"."crm_records";
DROP POLICY IF EXISTS "Senders can delete messages" ON "public"."team_messages";
DROP POLICY IF EXISTS "Senders can edit messages" ON "public"."team_messages";
DROP POLICY IF EXISTS "Service can insert heartbeat logs" ON "public"."heartbeat_logs";
DROP POLICY IF EXISTS "Service can manage flow processed leads" ON "public"."flow_processed_leads";
DROP POLICY IF EXISTS "Service role can insert automation logs" ON "public"."automation_logs";
DROP POLICY IF EXISTS "Service role can insert competitor results" ON "public"."ai_detection_competitor_results";
DROP POLICY IF EXISTS "Service role can insert events" ON "public"."site_events";
DROP POLICY IF EXISTS "Service role can insert pageviews" ON "public"."site_pageviews";
DROP POLICY IF EXISTS "Service role can insert results" ON "public"."ai_detection_results";
DROP POLICY IF EXISTS "Service role can insert scores" ON "public"."ai_detection_scores";
DROP POLICY IF EXISTS "Service role can insert sessions" ON "public"."site_sessions";
DROP POLICY IF EXISTS "Service role can insert visitors" ON "public"."site_visitors";
DROP POLICY IF EXISTS "Service role can manage ahrefs_reports" ON "public"."ahrefs_reports";
DROP POLICY IF EXISTS "Service role can manage communication_logs" ON "public"."communication_logs";
DROP POLICY IF EXISTS "Service role can update pageviews" ON "public"."site_pageviews";
DROP POLICY IF EXISTS "Service role can update sessions" ON "public"."site_sessions";
DROP POLICY IF EXISTS "Service role can update visitors" ON "public"."site_visitors";
DROP POLICY IF EXISTS "Service role full access" ON "public"."deleted_facebook_leads";
DROP POLICY IF EXISTS "Service role full access on agent_tasks" ON "public"."agent_tasks";
DROP POLICY IF EXISTS "Super admin manages global skills" ON "public"."ai_skills";
DROP POLICY IF EXISTS "Super admins can manage all manus tasks" ON "public"."manus_tasks";
DROP POLICY IF EXISTS "Super admins can view all error logs" ON "public"."error_logs";
DROP POLICY IF EXISTS "Super admins can view global_settings" ON "public"."global_settings";
DROP POLICY IF EXISTS "Super admins full access" ON "public"."terminology_presets";
DROP POLICY IF EXISTS "Tenant members can insert runs" ON "public"."agent_runs";
DROP POLICY IF EXISTS "Tenant members can update carmen sessions" ON "public"."carmen_whatsapp_sessions";
DROP POLICY IF EXISTS "Tenant members can update their runs" ON "public"."agent_runs";
DROP POLICY IF EXISTS "Tenant members can view carmen sessions" ON "public"."carmen_whatsapp_sessions";
DROP POLICY IF EXISTS "Tenant members can view runs" ON "public"."agent_runs";
DROP POLICY IF EXISTS "Tenant members can view their integration alerts" ON "public"."integration_alerts_log";
DROP POLICY IF EXISTS "Tenant members read maskyoo settings" ON "public"."maskyoo_settings";
DROP POLICY IF EXISTS "Tenant owners manage maskyoo settings" ON "public"."maskyoo_settings";
DROP POLICY IF EXISTS "Tenant users can insert communication_logs" ON "public"."communication_logs";
DROP POLICY IF EXISTS "Tenant users can manage gmail categories" ON "public"."gmail_categories";
DROP POLICY IF EXISTS "Tenant users can view communication_logs" ON "public"."communication_logs";
DROP POLICY IF EXISTS "Tenant users can view gmail categories" ON "public"."gmail_categories";
DROP POLICY IF EXISTS "Update maskyoo overrides" ON "public"."maskyoo_manual_overrides";
DROP POLICY IF EXISTS "Users can add collaborators in their tenant" ON "public"."task_collaborators";
DROP POLICY IF EXISTS "Users can create alerts in their tenant" ON "public"."report_alerts";
DROP POLICY IF EXISTS "Users can create expense_payments in their tenant" ON "public"."expense_payments";
DROP POLICY IF EXISTS "Users can create history through project" ON "public"."rank_tracking_history";
DROP POLICY IF EXISTS "Users can create income_payments in their tenant" ON "public"."income_payments";
DROP POLICY IF EXISTS "Users can create keywords through project" ON "public"."rank_tracking_keywords";
DROP POLICY IF EXISTS "Users can create payment links in their tenant" ON "public"."payment_links";
DROP POLICY IF EXISTS "Users can create rank tracking projects in their tenant" ON "public"."rank_tracking_projects";
DROP POLICY IF EXISTS "Users can create shared telegram bot state" ON "public"."telegram_bot_state";
DROP POLICY IF EXISTS "Users can create social gantt posts in their tenant" ON "public"."social_gantt_posts";
DROP POLICY IF EXISTS "Users can create sync jobs in their tenant" ON "public"."sync_jobs";
DROP POLICY IF EXISTS "Users can create their own skills" ON "public"."ai_skills";
DROP POLICY IF EXISTS "Users can delete agent tasks in their tenant" ON "public"."agent_tasks";
DROP POLICY IF EXISTS "Users can delete agents in their tenant" ON "public"."ai_agents";
DROP POLICY IF EXISTS "Users can delete ahrefs_reports in their tenant" ON "public"."ahrefs_reports";
DROP POLICY IF EXISTS "Users can delete alerts in their tenant" ON "public"."report_alerts";
DROP POLICY IF EXISTS "Users can delete breaks in their tenant" ON "public"."time_entry_breaks";
DROP POLICY IF EXISTS "Users can delete credentials in their tenant" ON "public"."client_credentials";
DROP POLICY IF EXISTS "Users can delete expense_payments in their tenant" ON "public"."expense_payments";
DROP POLICY IF EXISTS "Users can delete goals in their tenant" ON "public"."goals";
DROP POLICY IF EXISTS "Users can delete income_payments in their tenant" ON "public"."income_payments";
DROP POLICY IF EXISTS "Users can delete invoices in their tenant" ON "public"."supplier_invoices";
DROP POLICY IF EXISTS "Users can delete keywords through project" ON "public"."rank_tracking_keywords";
DROP POLICY IF EXISTS "Users can delete manus tasks in their tenant" ON "public"."manus_tasks";
DROP POLICY IF EXISTS "Users can delete one_time_incomes in their tenant" ON "public"."one_time_incomes";
DROP POLICY IF EXISTS "Users can delete own gmail tokens" ON "public"."gmail_tokens";
DROP POLICY IF EXISTS "Users can delete own memory" ON "public"."ai_memory";
DROP POLICY IF EXISTS "Users can delete payment links in their tenant" ON "public"."payment_links";
DROP POLICY IF EXISTS "Users can delete rank tracking projects in their tenant" ON "public"."rank_tracking_projects";
DROP POLICY IF EXISTS "Users can delete shared telegram bot state" ON "public"."telegram_bot_state";
DROP POLICY IF EXISTS "Users can delete social gantt posts in their tenant" ON "public"."social_gantt_posts";
DROP POLICY IF EXISTS "Users can delete their own connection messages" ON "public"."chat_messages";
DROP POLICY IF EXISTS "Users can delete their own files" ON "public"."team_chat_files";
DROP POLICY IF EXISTS "Users can delete their own hidden chats" ON "public"."hidden_chats";
DROP POLICY IF EXISTS "Users can delete their own shares" ON "public"."calendar_shares";
DROP POLICY IF EXISTS "Users can delete their own skills" ON "public"."ai_skills";
DROP POLICY IF EXISTS "Users can delete their tenant brands" ON "public"."ai_detection_brands";
DROP POLICY IF EXISTS "Users can delete their tenant prompts" ON "public"."ai_detection_prompts";
DROP POLICY IF EXISTS "Users can delete tracking configs in their tenant" ON "public"."site_tracking_configs";
DROP POLICY IF EXISTS "Users can insert agent tasks in their tenant" ON "public"."agent_tasks";
DROP POLICY IF EXISTS "Users can insert agents in their tenant" ON "public"."ai_agents";
DROP POLICY IF EXISTS "Users can insert ahrefs_reports in their tenant" ON "public"."ahrefs_reports";
DROP POLICY IF EXISTS "Users can insert breaks in their tenant" ON "public"."time_entry_breaks";
DROP POLICY IF EXISTS "Users can insert call logs in their tenant" ON "public"."call_logs";
DROP POLICY IF EXISTS "Users can insert error logs for their tenant" ON "public"."error_logs";
DROP POLICY IF EXISTS "Users can insert files in their tenant" ON "public"."team_chat_files";
DROP POLICY IF EXISTS "Users can insert goals in their tenant" ON "public"."goals";
DROP POLICY IF EXISTS "Users can insert invoices in their tenant" ON "public"."supplier_invoices";
DROP POLICY IF EXISTS "Users can insert manus tasks in their tenant" ON "public"."manus_tasks";
DROP POLICY IF EXISTS "Users can insert messages through their connection" ON "public"."chat_messages";
DROP POLICY IF EXISTS "Users can insert one_time_incomes in their tenant" ON "public"."one_time_incomes";
DROP POLICY IF EXISTS "Users can insert own gmail tokens" ON "public"."gmail_tokens";
DROP POLICY IF EXISTS "Users can insert own memory" ON "public"."ai_memory";
DROP POLICY IF EXISTS "Users can insert own read status" ON "public"."team_message_read_status";
DROP POLICY IF EXISTS "Users can insert telegram messages in their tenant" ON "public"."telegram_messages";
DROP POLICY IF EXISTS "Users can insert their own connection messages" ON "public"."chat_messages";
DROP POLICY IF EXISTS "Users can insert their own hidden chats" ON "public"."hidden_chats";
DROP POLICY IF EXISTS "Users can insert their own profile" ON "public"."profiles";
DROP POLICY IF EXISTS "Users can insert their tenant brands" ON "public"."ai_detection_brands";
DROP POLICY IF EXISTS "Users can insert their tenant heartbeat settings" ON "public"."tenant_heartbeat_settings";
DROP POLICY IF EXISTS "Users can insert their tenant prompts" ON "public"."ai_detection_prompts";
DROP POLICY IF EXISTS "Users can insert tracking configs in their tenant" ON "public"."site_tracking_configs";
DROP POLICY IF EXISTS "Users can manage alerts through project" ON "public"."rank_tracking_alerts";
DROP POLICY IF EXISTS "Users can manage categories in their tenant" ON "public"."team_channel_categories";
DROP POLICY IF EXISTS "Users can manage competitors through project" ON "public"."rank_tracking_competitors";
DROP POLICY IF EXISTS "Users can manage links in their tenant" ON "public"."team_channel_whatsapp_links";
DROP POLICY IF EXISTS "Users can manage own blocked senders" ON "public"."gmail_blocked_senders";
DROP POLICY IF EXISTS "Users can manage own message categories" ON "public"."gmail_message_categories";
DROP POLICY IF EXISTS "Users can manage own rules" ON "public"."gmail_category_rules";
DROP POLICY IF EXISTS "Users can manage own telephony settings" ON "public"."telephony_settings";
DROP POLICY IF EXISTS "Users can manage their own allowed labels" ON "public"."gmail_allowed_labels";
DROP POLICY IF EXISTS "Users can remove collaborators in their tenant" ON "public"."task_collaborators";
DROP POLICY IF EXISTS "Users can remove own reactions" ON "public"."team_message_reactions";
DROP POLICY IF EXISTS "Users can share their own calendar" ON "public"."calendar_shares";
DROP POLICY IF EXISTS "Users can update agent tasks in their tenant" ON "public"."agent_tasks";
DROP POLICY IF EXISTS "Users can update agents in their tenant" ON "public"."ai_agents";
DROP POLICY IF EXISTS "Users can update ahrefs_reports in their tenant" ON "public"."ahrefs_reports";
DROP POLICY IF EXISTS "Users can update alerts in their tenant" ON "public"."report_alerts";
DROP POLICY IF EXISTS "Users can update breaks in their tenant" ON "public"."time_entry_breaks";
DROP POLICY IF EXISTS "Users can update call logs in their tenant" ON "public"."call_logs";
DROP POLICY IF EXISTS "Users can update credentials in their tenant" ON "public"."client_credentials";
DROP POLICY IF EXISTS "Users can update goals in their tenant" ON "public"."goals";
DROP POLICY IF EXISTS "Users can update invoices in their tenant" ON "public"."supplier_invoices";
DROP POLICY IF EXISTS "Users can update keywords through project" ON "public"."rank_tracking_keywords";
DROP POLICY IF EXISTS "Users can update manus tasks in their tenant" ON "public"."manus_tasks";
DROP POLICY IF EXISTS "Users can update one_time_incomes in their tenant" ON "public"."one_time_incomes";
DROP POLICY IF EXISTS "Users can update own gmail tokens" ON "public"."gmail_tokens";
DROP POLICY IF EXISTS "Users can update own memory" ON "public"."ai_memory";
DROP POLICY IF EXISTS "Users can update own read status" ON "public"."team_message_read_status";
DROP POLICY IF EXISTS "Users can update own telephony settings" ON "public"."telephony_settings";
DROP POLICY IF EXISTS "Users can update payment links in their tenant" ON "public"."payment_links";
DROP POLICY IF EXISTS "Users can update rank tracking projects in their tenant" ON "public"."rank_tracking_projects";
DROP POLICY IF EXISTS "Users can update social gantt posts in their tenant" ON "public"."social_gantt_posts";
DROP POLICY IF EXISTS "Users can update sync jobs in their tenant" ON "public"."sync_jobs";
DROP POLICY IF EXISTS "Users can update their own connection messages" ON "public"."chat_messages";
DROP POLICY IF EXISTS "Users can update their own files" ON "public"."team_chat_files";
DROP POLICY IF EXISTS "Users can update their own shares" ON "public"."calendar_shares";
DROP POLICY IF EXISTS "Users can update their own skills" ON "public"."ai_skills";
DROP POLICY IF EXISTS "Users can update their tenant brands" ON "public"."ai_detection_brands";
DROP POLICY IF EXISTS "Users can update their tenant heartbeat settings" ON "public"."tenant_heartbeat_settings";
DROP POLICY IF EXISTS "Users can update their tenant prompts" ON "public"."ai_detection_prompts";
DROP POLICY IF EXISTS "Users can update tracking configs in their tenant" ON "public"."site_tracking_configs";
DROP POLICY IF EXISTS "Users can view accessible integrations" ON "public"."tenant_integrations";
DROP POLICY IF EXISTS "Users can view agent tasks in their tenant" ON "public"."agent_tasks";
DROP POLICY IF EXISTS "Users can view agents in their tenant" ON "public"."ai_agents";
DROP POLICY IF EXISTS "Users can view ahrefs_reports in their tenant" ON "public"."ahrefs_reports";
DROP POLICY IF EXISTS "Users can view alert logs through alert" ON "public"."rank_tracking_alert_logs";
DROP POLICY IF EXISTS "Users can view alerts in their tenant" ON "public"."report_alerts";
DROP POLICY IF EXISTS "Users can view alerts through project" ON "public"."rank_tracking_alerts";
DROP POLICY IF EXISTS "Users can view breaks in their tenant" ON "public"."time_entry_breaks";
DROP POLICY IF EXISTS "Users can view call logs in their tenant" ON "public"."call_logs";
DROP POLICY IF EXISTS "Users can view categories in their tenant" ON "public"."team_channel_categories";
DROP POLICY IF EXISTS "Users can view clients in scope" ON "public"."clients";
DROP POLICY IF EXISTS "Users can view collaborators in their tenant" ON "public"."task_collaborators";
DROP POLICY IF EXISTS "Users can view competitors through project" ON "public"."rank_tracking_competitors";
DROP POLICY IF EXISTS "Users can view credentials in their tenant" ON "public"."client_credentials";
DROP POLICY IF EXISTS "Users can view cross-tenant shared agencies" ON "public"."agencies";
DROP POLICY IF EXISTS "Users can view deleted facebook leads in their tenant" ON "public"."deleted_facebook_leads";
DROP POLICY IF EXISTS "Users can view events in their tenant" ON "public"."site_events";
DROP POLICY IF EXISTS "Users can view expense_payments in their tenant" ON "public"."expense_payments";
DROP POLICY IF EXISTS "Users can view files in their tenant" ON "public"."team_chat_files";
DROP POLICY IF EXISTS "Users can view flow processed leads in their tenant" ON "public"."flow_processed_leads";
DROP POLICY IF EXISTS "Users can view goals in their tenant" ON "public"."goals";
DROP POLICY IF EXISTS "Users can view heartbeat logs in their tenant" ON "public"."heartbeat_logs";
DROP POLICY IF EXISTS "Users can view history through project" ON "public"."rank_tracking_history";
DROP POLICY IF EXISTS "Users can view income_payments in their tenant" ON "public"."income_payments";
DROP POLICY IF EXISTS "Users can view integration access for their tenant" ON "public"."integration_tenant_access";
DROP POLICY IF EXISTS "Users can view invoices in their tenant" ON "public"."supplier_invoices";
DROP POLICY IF EXISTS "Users can view keywords through project" ON "public"."rank_tracking_keywords";
DROP POLICY IF EXISTS "Users can view lead_sales_people in their tenant" ON "public"."lead_sales_people";
DROP POLICY IF EXISTS "Users can view links in their tenant" ON "public"."team_channel_whatsapp_links";
DROP POLICY IF EXISTS "Users can view manus tasks in their tenant" ON "public"."manus_tasks";
DROP POLICY IF EXISTS "Users can view one_time_incomes in their tenant" ON "public"."one_time_incomes";
DROP POLICY IF EXISTS "Users can view own gmail tokens" ON "public"."gmail_tokens";
DROP POLICY IF EXISTS "Users can view own memory" ON "public"."ai_memory";
DROP POLICY IF EXISTS "Users can view own read status" ON "public"."team_message_read_status";
DROP POLICY IF EXISTS "Users can view pageviews in their tenant" ON "public"."site_pageviews";
DROP POLICY IF EXISTS "Users can view payment links from their tenant" ON "public"."payment_links";
DROP POLICY IF EXISTS "Users can view rank tracking projects in their tenant" ON "public"."rank_tracking_projects";
DROP POLICY IF EXISTS "Users can view relevant integration permissions" ON "public"."integration_user_permissions";
DROP POLICY IF EXISTS "Users can view sessions in their tenant" ON "public"."site_sessions";
DROP POLICY IF EXISTS "Users can view shared mirror automations" ON "public"."automations";
DROP POLICY IF EXISTS "Users can view social gantt posts in their tenant" ON "public"."social_gantt_posts";
DROP POLICY IF EXISTS "Users can view sync jobs in their tenant" ON "public"."sync_jobs";
DROP POLICY IF EXISTS "Users can view tables by role scope" ON "public"."crm_tables";
DROP POLICY IF EXISTS "Users can view tasks in scope" ON "public"."tasks";
DROP POLICY IF EXISTS "Users can view telegram bot state in their tenant" ON "public"."telegram_bot_state";
DROP POLICY IF EXISTS "Users can view telegram messages in their tenants" ON "public"."telegram_messages";
DROP POLICY IF EXISTS "Users can view telephony settings in their tenant" ON "public"."telephony_settings";
DROP POLICY IF EXISTS "Users can view templates from their tenant or public templates" ON "public"."tenant_templates";
DROP POLICY IF EXISTS "Users can view their calendar shares" ON "public"."calendar_shares";
DROP POLICY IF EXISTS "Users can view their own connection messages" ON "public"."chat_messages";
DROP POLICY IF EXISTS "Users can view their own hidden chats" ON "public"."hidden_chats";
DROP POLICY IF EXISTS "Users can view their own skills" ON "public"."ai_skills";
DROP POLICY IF EXISTS "Users can view their tenant brands" ON "public"."ai_detection_brands";
DROP POLICY IF EXISTS "Users can view their tenant competitor results" ON "public"."ai_detection_competitor_results";
DROP POLICY IF EXISTS "Users can view their tenant heartbeat settings" ON "public"."tenant_heartbeat_settings";
DROP POLICY IF EXISTS "Users can view their tenant prompts" ON "public"."ai_detection_prompts";
DROP POLICY IF EXISTS "Users can view their tenant results" ON "public"."ai_detection_results";
DROP POLICY IF EXISTS "Users can view their tenant scores" ON "public"."ai_detection_scores";
DROP POLICY IF EXISTS "Users can view tracking configs in their tenant" ON "public"."site_tracking_configs";
DROP POLICY IF EXISTS "Users can view visitors in their tenant" ON "public"."site_visitors";
DROP POLICY IF EXISTS "Users insert own connection messages" ON "public"."chat_messages";
DROP POLICY IF EXISTS "Users update own connection messages" ON "public"."chat_messages";
DROP POLICY IF EXISTS "Users view own connection messages" ON "public"."chat_messages";
DROP POLICY IF EXISTS "View campaigners linked to cross-tenant agencies" ON "public"."campaigners";
DROP POLICY IF EXISTS "View maskyoo overrides" ON "public"."maskyoo_manual_overrides";
DROP POLICY IF EXISTS "action_log_insert" ON "public"."agent_action_log";
DROP POLICY IF EXISTS "action_log_select" ON "public"."agent_action_log";
DROP POLICY IF EXISTS "agent_action_log_insert" ON "public"."agent_action_log";
DROP POLICY IF EXISTS "agent_action_log_select" ON "public"."agent_action_log";
DROP POLICY IF EXISTS "agent_approval_insert" ON "public"."agent_approval_queue";
DROP POLICY IF EXISTS "agent_approval_select" ON "public"."agent_approval_queue";
DROP POLICY IF EXISTS "agent_approval_update" ON "public"."agent_approval_queue";
DROP POLICY IF EXISTS "approval_insert" ON "public"."agent_approval_queue";
DROP POLICY IF EXISTS "approval_select" ON "public"."agent_approval_queue";
DROP POLICY IF EXISTS "approval_update" ON "public"."agent_approval_queue";
DROP POLICY IF EXISTS "ast_delete_source_admin" ON "public"."automation_shared_tenants";
DROP POLICY IF EXISTS "ast_insert_source_admin" ON "public"."automation_shared_tenants";
DROP POLICY IF EXISTS "ast_select_members" ON "public"."automation_shared_tenants";
DROP POLICY IF EXISTS "aup_tenant_modify" ON "public"."agent_user_profiles";
DROP POLICY IF EXISTS "aup_tenant_select" ON "public"."agent_user_profiles";
DROP POLICY IF EXISTS "communication_logs_tenant_access" ON "public"."communication_logs";
DROP POLICY IF EXISTS "cs_tenant_delete" ON "public"."campaign_schedules";
DROP POLICY IF EXISTS "cs_tenant_insert" ON "public"."campaign_schedules";
DROP POLICY IF EXISTS "cs_tenant_select" ON "public"."campaign_schedules";
DROP POLICY IF EXISTS "cs_tenant_update" ON "public"."campaign_schedules";
DROP POLICY IF EXISTS "marketing_assets_tenant_delete" ON "public"."marketing_assets";
DROP POLICY IF EXISTS "marketing_assets_tenant_insert" ON "public"."marketing_assets";
DROP POLICY IF EXISTS "marketing_assets_tenant_select" ON "public"."marketing_assets";
DROP POLICY IF EXISTS "marketing_assets_tenant_update" ON "public"."marketing_assets";
DROP POLICY IF EXISTS "marketing_media_library_tenant_delete" ON "public"."marketing_media_library";
DROP POLICY IF EXISTS "marketing_media_library_tenant_insert" ON "public"."marketing_media_library";
DROP POLICY IF EXISTS "marketing_media_library_tenant_select" ON "public"."marketing_media_library";
DROP POLICY IF EXISTS "marketing_media_library_tenant_update" ON "public"."marketing_media_library";
DROP POLICY IF EXISTS "marketing_pipeline_stages_tenant_delete" ON "public"."marketing_pipeline_stages";
DROP POLICY IF EXISTS "marketing_pipeline_stages_tenant_insert" ON "public"."marketing_pipeline_stages";
DROP POLICY IF EXISTS "marketing_pipeline_stages_tenant_select" ON "public"."marketing_pipeline_stages";
DROP POLICY IF EXISTS "marketing_pipeline_stages_tenant_update" ON "public"."marketing_pipeline_stages";
DROP POLICY IF EXISTS "marketing_pipelines_tenant_delete" ON "public"."marketing_pipelines";
DROP POLICY IF EXISTS "marketing_pipelines_tenant_insert" ON "public"."marketing_pipelines";
DROP POLICY IF EXISTS "marketing_pipelines_tenant_select" ON "public"."marketing_pipelines";
DROP POLICY IF EXISTS "marketing_pipelines_tenant_update" ON "public"."marketing_pipelines";
DROP POLICY IF EXISTS "marketing_runs_tenant_delete" ON "public"."marketing_runs";
DROP POLICY IF EXISTS "marketing_runs_tenant_insert" ON "public"."marketing_runs";
DROP POLICY IF EXISTS "marketing_runs_tenant_select" ON "public"."marketing_runs";
DROP POLICY IF EXISTS "marketing_runs_tenant_update" ON "public"."marketing_runs";
DROP POLICY IF EXISTS "marketing_stage_templates_tenant_delete" ON "public"."marketing_stage_templates";
DROP POLICY IF EXISTS "marketing_stage_templates_tenant_insert" ON "public"."marketing_stage_templates";
DROP POLICY IF EXISTS "marketing_stage_templates_tenant_select" ON "public"."marketing_stage_templates";
DROP POLICY IF EXISTS "marketing_stage_templates_tenant_update" ON "public"."marketing_stage_templates";
DROP POLICY IF EXISTS "marketing_work_items_tenant_delete" ON "public"."marketing_work_items";
DROP POLICY IF EXISTS "marketing_work_items_tenant_insert" ON "public"."marketing_work_items";
DROP POLICY IF EXISTS "marketing_work_items_tenant_select" ON "public"."marketing_work_items";
DROP POLICY IF EXISTS "marketing_work_items_tenant_update" ON "public"."marketing_work_items";
DROP POLICY IF EXISTS "mml_tenant_delete" ON "public"."marketing_media_library";
DROP POLICY IF EXISTS "mml_tenant_insert" ON "public"."marketing_media_library";
DROP POLICY IF EXISTS "mml_tenant_select" ON "public"."marketing_media_library";
DROP POLICY IF EXISTS "mml_tenant_update" ON "public"."marketing_media_library";
DROP POLICY IF EXISTS "service_role_all" ON "public"."whatsapp_sessions";
DROP POLICY IF EXISTS "tenant access agent_goals" ON "public"."agent_goals";
DROP POLICY IF EXISTS "tenant access agent_knowledge_folders" ON "public"."agent_knowledge_folders";
DROP POLICY IF EXISTS "tenant access agent_knowledge_items" ON "public"."agent_knowledge_items";
DROP POLICY IF EXISTS "tenant access agent_memory" ON "public"."agent_memory";
DROP POLICY IF EXISTS "tenant manage eval_runs" ON "public"."agent_eval_runs";
DROP POLICY IF EXISTS "tenant manage evals" ON "public"."agent_evals";
DROP POLICY IF EXISTS "tenant manage mcp" ON "public"."agent_mcp_connections";
DROP POLICY IF EXISTS "tenant manage supervisors" ON "public"."agent_supervisors";
DROP POLICY IF EXISTS "tenant members can update alerts" ON "public"."campaign_alerts";
DROP POLICY IF EXISTS "tenant members can view alerts" ON "public"."campaign_alerts";
DROP POLICY IF EXISTS "tenant members delete invoice_uploads" ON "public"."invoice_uploads";
DROP POLICY IF EXISTS "tenant members delete maskyoo_numbers" ON "public"."maskyoo_numbers";
DROP POLICY IF EXISTS "tenant members insert invoice_uploads" ON "public"."invoice_uploads";
DROP POLICY IF EXISTS "tenant members insert maskyoo_numbers" ON "public"."maskyoo_numbers";
DROP POLICY IF EXISTS "tenant members manage assets" ON "public"."marketing_assets";
DROP POLICY IF EXISTS "tenant members manage templates" ON "public"."marketing_stage_templates";
DROP POLICY IF EXISTS "tenant members manage triggers" ON "public"."marketing_triggers";
DROP POLICY IF EXISTS "tenant members read maskyoo_numbers" ON "public"."maskyoo_numbers";
DROP POLICY IF EXISTS "tenant members read runs" ON "public"."marketing_runs";
DROP POLICY IF EXISTS "tenant members update invoice_uploads" ON "public"."invoice_uploads";
DROP POLICY IF EXISTS "tenant members update maskyoo_numbers" ON "public"."maskyoo_numbers";
DROP POLICY IF EXISTS "tenant members update runs" ON "public"."marketing_runs";
DROP POLICY IF EXISTS "tenant members view invoice_uploads" ON "public"."invoice_uploads";
DROP POLICY IF EXISTS "tenant members write runs" ON "public"."marketing_runs";
DROP POLICY IF EXISTS "tenant read eval_runs" ON "public"."agent_eval_runs";
DROP POLICY IF EXISTS "tenant read evals" ON "public"."agent_evals";
DROP POLICY IF EXISTS "tenant read mcp" ON "public"."agent_mcp_connections";
DROP POLICY IF EXISTS "tenant read supervisors" ON "public"."agent_supervisors";
DROP POLICY IF EXISTS "tenant social_comments modify" ON "public"."social_comments";
DROP POLICY IF EXISTS "tenant social_comments select" ON "public"."social_comments";
DROP POLICY IF EXISTS "tenant social_pages modify" ON "public"."social_pages";
DROP POLICY IF EXISTS "tenant social_pages select" ON "public"."social_pages";
DROP POLICY IF EXISTS "tenant social_pub modify" ON "public"."social_publications";
DROP POLICY IF EXISTS "tenant social_pub select" ON "public"."social_publications";
DROP POLICY IF EXISTS "tenant_all_items" ON "public"."marketing_work_items";
DROP POLICY IF EXISTS "tenant_all_pipelines" ON "public"."marketing_pipelines";
DROP POLICY IF EXISTS "tenant_all_stages" ON "public"."marketing_pipeline_stages";
DROP POLICY IF EXISTS "tenant_insert_transitions" ON "public"."marketing_item_transitions";
DROP POLICY IF EXISTS "tenant_isolation" ON "public"."social_media_channels";
DROP POLICY IF EXISTS "tenant_isolation" ON "public"."social_media_post_channels";
DROP POLICY IF EXISTS "tenant_isolation" ON "public"."social_media_posts";
DROP POLICY IF EXISTS "tenant_isolation" ON "public"."social_media_wordpress_sites";
DROP POLICY IF EXISTS "tenant_read_woo_customers" ON "public"."woocommerce_customers";
DROP POLICY IF EXISTS "tenant_read_woo_orders" ON "public"."woocommerce_orders";
DROP POLICY IF EXISTS "tenant_read_woo_products" ON "public"."woocommerce_products";
DROP POLICY IF EXISTS "tenant_read_woo_sync_log" ON "public"."woocommerce_sync_log";
DROP POLICY IF EXISTS "tenant_select_transitions" ON "public"."marketing_item_transitions";
DROP POLICY IF EXISTS "tools_read" ON "public"."agent_tools";
DROP POLICY IF EXISTS "tools_write" ON "public"."agent_tools";
DROP POLICY IF EXISTS "users manage own layout" ON "public"."user_workspace_layout";
DROP POLICY IF EXISTS "Anyone read command center files" ON "storage"."objects";
DROP POLICY IF EXISTS "Authenticated users can read team chat files" ON "storage"."objects";
DROP POLICY IF EXISTS "Authenticated users can view team attachments" ON "storage"."objects";
DROP POLICY IF EXISTS "Authenticated users upload command center files" ON "storage"."objects";
DROP POLICY IF EXISTS "Public read social-media" ON "storage"."objects";
DROP POLICY IF EXISTS "Service role upload social-media" ON "storage"."objects";
DROP POLICY IF EXISTS "Tenant members can delete task attachments" ON "storage"."objects";
DROP POLICY IF EXISTS "Tenant members can update task attachments" ON "storage"."objects";
DROP POLICY IF EXISTS "Tenant members can upload task attachments" ON "storage"."objects";
DROP POLICY IF EXISTS "Tenant members can view task attachments" ON "storage"."objects";
DROP POLICY IF EXISTS "social-media authenticated delete" ON "storage"."objects";
DROP POLICY IF EXISTS "social-media authenticated insert" ON "storage"."objects";
DROP POLICY IF EXISTS "social-media authenticated read" ON "storage"."objects";
DROP POLICY IF EXISTS "Integration owners can manage permissions" ON "public"."integration_user_permissions";
DROP POLICY IF EXISTS "Owners view all leads in tenant" ON "public"."leads";
DROP POLICY IF EXISTS "SEO users view SEO-tagged clients" ON "public"."clients";
DROP POLICY IF EXISTS "Service role can update invitation tokens" ON "public"."invitation_tokens";
DROP POLICY IF EXISTS "Super admins can manage leads with permission" ON "public"."leads";
DROP POLICY IF EXISTS "Super admins can view all profiles" ON "public"."profiles";
DROP POLICY IF EXISTS "Super admins can view leads with permission" ON "public"."leads";
DROP POLICY IF EXISTS "Team managers view leads from managed agencies" ON "public"."leads";
DROP POLICY IF EXISTS "Users can create tasks in accessible agencies" ON "public"."tasks";
DROP POLICY IF EXISTS "Users can delete client_suppliers in their tenant" ON "public"."client_suppliers";
DROP POLICY IF EXISTS "Users can delete client_team in their tenant" ON "public"."client_team";
DROP POLICY IF EXISTS "Users can delete tasks in accessible agencies" ON "public"."tasks";
DROP POLICY IF EXISTS "Users can insert client_suppliers in their tenant" ON "public"."client_suppliers";
DROP POLICY IF EXISTS "Users can insert client_team in their tenant" ON "public"."client_team";
DROP POLICY IF EXISTS "Users can manage client_onboarding in their tenant" ON "public"."client_onboarding";
DROP POLICY IF EXISTS "Users can update client_suppliers in their tenant" ON "public"."client_suppliers";
DROP POLICY IF EXISTS "Users can update client_team in their tenant" ON "public"."client_team";
DROP POLICY IF EXISTS "Users can update clients in their or shared tenants" ON "public"."clients";
DROP POLICY IF EXISTS "Users can update financial data in their tenant" ON "public"."client_tenant_financial_data";
DROP POLICY IF EXISTS "Users can update tasks in accessible agencies" ON "public"."tasks";
DROP POLICY IF EXISTS "Users can update their own profile" ON "public"."profiles";
DROP POLICY IF EXISTS "Users can view client updates in their tenant" ON "public"."client_updates";
DROP POLICY IF EXISTS "Users can view client_suppliers in their tenant" ON "public"."client_suppliers";
DROP POLICY IF EXISTS "Users can view client_team in their tenant" ON "public"."client_team";
DROP POLICY IF EXISTS "Users can view financial data in their tenant" ON "public"."client_tenant_financial_data";
DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON "public"."profiles";
DROP POLICY IF EXISTS "Users can view their own profile" ON "public"."profiles";
DROP POLICY IF EXISTS "tenant_isolation" ON "public"."woocommerce_customers";
DROP POLICY IF EXISTS "tenant_isolation" ON "public"."woocommerce_orders";
DROP POLICY IF EXISTS "tenant_isolation" ON "public"."woocommerce_products";
DROP POLICY IF EXISTS "tenant_isolation" ON "public"."woocommerce_sync_log";

-- 2. Drop Staging-only and changed triggers
DROP TRIGGER IF EXISTS "trg_notify_client_follow_up_worker" ON "public"."clients";
DROP TRIGGER IF EXISTS "trg_notify_task_assigned" ON "public"."tasks";
DROP TRIGGER IF EXISTS "trg_notify_task_notification_worker" ON "public"."tasks";

-- 3. Drop Staging-only and changed constraints (foreign keys first)
ALTER TABLE "public"."agent_action_log" DROP CONSTRAINT IF EXISTS "agent_action_log_agent_id_fkey";
ALTER TABLE "public"."agent_action_log" DROP CONSTRAINT IF EXISTS "agent_action_log_tenant_id_fkey";
ALTER TABLE "public"."agent_approval_queue" DROP CONSTRAINT IF EXISTS "agent_approval_queue_tenant_id_fkey";
ALTER TABLE "public"."agent_eval_runs" DROP CONSTRAINT IF EXISTS "agent_eval_runs_agent_id_fkey";
ALTER TABLE "public"."agent_eval_runs" DROP CONSTRAINT IF EXISTS "agent_eval_runs_eval_id_fkey";
ALTER TABLE "public"."agent_evals" DROP CONSTRAINT IF EXISTS "agent_evals_agent_id_fkey";
ALTER TABLE "public"."agent_goals" DROP CONSTRAINT IF EXISTS "agent_goals_agent_id_fkey";
ALTER TABLE "public"."agent_knowledge_folders" DROP CONSTRAINT IF EXISTS "agent_knowledge_folders_agent_id_fkey";
ALTER TABLE "public"."agent_knowledge_folders" DROP CONSTRAINT IF EXISTS "agent_knowledge_folders_parent_folder_id_fkey";
ALTER TABLE "public"."agent_knowledge_items" DROP CONSTRAINT IF EXISTS "agent_knowledge_items_agent_id_fkey";
ALTER TABLE "public"."agent_knowledge_items" DROP CONSTRAINT IF EXISTS "agent_knowledge_items_folder_id_fkey";
ALTER TABLE "public"."agent_mcp_connections" DROP CONSTRAINT IF EXISTS "agent_mcp_connections_agent_id_fkey";
ALTER TABLE "public"."agent_memory" DROP CONSTRAINT IF EXISTS "agent_memory_agent_id_fkey";
ALTER TABLE "public"."agent_runs" DROP CONSTRAINT IF EXISTS "agent_runs_delegated_to_agent_id_fkey";
ALTER TABLE "public"."agent_runs" DROP CONSTRAINT IF EXISTS "agent_runs_parent_run_id_fkey";
ALTER TABLE "public"."agent_runs" DROP CONSTRAINT IF EXISTS "agent_runs_replay_of_run_id_fkey";
ALTER TABLE "public"."agent_tasks" DROP CONSTRAINT IF EXISTS "agent_tasks_tenant_id_fkey";
ALTER TABLE "public"."agent_user_profiles" DROP CONSTRAINT IF EXISTS "agent_user_profiles_agent_id_fkey";
ALTER TABLE "public"."ahrefs_reports" DROP CONSTRAINT IF EXISTS "ahrefs_reports_agency_id_fkey";
ALTER TABLE "public"."ahrefs_reports" DROP CONSTRAINT IF EXISTS "ahrefs_reports_client_id_fkey";
ALTER TABLE "public"."ahrefs_reports" DROP CONSTRAINT IF EXISTS "ahrefs_reports_tenant_id_fkey";
ALTER TABLE "public"."ai_skills" DROP CONSTRAINT IF EXISTS "ai_skills_tenant_id_fkey";
ALTER TABLE "public"."automation_shared_tenants" DROP CONSTRAINT IF EXISTS "automation_shared_tenants_automation_id_fkey";
ALTER TABLE "public"."automation_shared_tenants" DROP CONSTRAINT IF EXISTS "automation_shared_tenants_tenant_id_fkey";
ALTER TABLE "public"."communication_logs" DROP CONSTRAINT IF EXISTS "communication_logs_client_id_fkey";
ALTER TABLE "public"."communication_logs" DROP CONSTRAINT IF EXISTS "communication_logs_tenant_id_fkey";
ALTER TABLE "public"."communication_logs" DROP CONSTRAINT IF EXISTS "communication_logs_updated_by_fkey";
ALTER TABLE "public"."goals" DROP CONSTRAINT IF EXISTS "goals_parent_goal_id_fkey";
ALTER TABLE "public"."goals" DROP CONSTRAINT IF EXISTS "goals_tenant_id_fkey";
ALTER TABLE "public"."heartbeat_logs" DROP CONSTRAINT IF EXISTS "heartbeat_logs_agent_id_fkey";
ALTER TABLE "public"."heartbeat_logs" DROP CONSTRAINT IF EXISTS "heartbeat_logs_tenant_id_fkey";
ALTER TABLE "public"."invoice_uploads" DROP CONSTRAINT IF EXISTS "invoice_uploads_agency_id_fkey";
ALTER TABLE "public"."invoice_uploads" DROP CONSTRAINT IF EXISTS "invoice_uploads_client_id_fkey";
ALTER TABLE "public"."invoice_uploads" DROP CONSTRAINT IF EXISTS "invoice_uploads_finance_id_fkey";
ALTER TABLE "public"."invoice_uploads" DROP CONSTRAINT IF EXISTS "invoice_uploads_supplier_id_fkey";
ALTER TABLE "public"."invoice_uploads" DROP CONSTRAINT IF EXISTS "invoice_uploads_tenant_id_fkey";
ALTER TABLE "public"."marketing_ab_variants" DROP CONSTRAINT IF EXISTS "marketing_ab_variants_stage_id_fkey";
ALTER TABLE "public"."marketing_ab_variants" DROP CONSTRAINT IF EXISTS "marketing_ab_variants_tenant_id_fkey";
ALTER TABLE "public"."marketing_ab_variants" DROP CONSTRAINT IF EXISTS "marketing_ab_variants_work_item_id_fkey";
ALTER TABLE "public"."marketing_item_transitions" DROP CONSTRAINT IF EXISTS "marketing_item_transitions_item_id_fkey";
ALTER TABLE "public"."marketing_pipeline_stages" DROP CONSTRAINT IF EXISTS "marketing_pipeline_stages_agent_id_fkey";
ALTER TABLE "public"."marketing_pipeline_stages" DROP CONSTRAINT IF EXISTS "marketing_pipeline_stages_parent_stage_id_fkey";
ALTER TABLE "public"."marketing_pipeline_stages" DROP CONSTRAINT IF EXISTS "marketing_pipeline_stages_pipeline_id_fkey";
ALTER TABLE "public"."marketing_pipelines" DROP CONSTRAINT IF EXISTS "marketing_pipelines_client_id_fkey";
ALTER TABLE "public"."marketing_work_items" DROP CONSTRAINT IF EXISTS "marketing_work_items_pipeline_id_fkey";
ALTER TABLE "public"."maskyoo_numbers" DROP CONSTRAINT IF EXISTS "maskyoo_numbers_client_id_fkey";
ALTER TABLE "public"."seo_monthly_updates" DROP CONSTRAINT IF EXISTS "seo_monthly_updates_client_id_fkey";
ALTER TABLE "public"."seo_monthly_updates" DROP CONSTRAINT IF EXISTS "seo_monthly_updates_tenant_id_fkey";
ALTER TABLE "public"."seo_monthly_updates" DROP CONSTRAINT IF EXISTS "seo_monthly_updates_updated_by_fkey";
ALTER TABLE "public"."social_media_wordpress_sites" DROP CONSTRAINT IF EXISTS "social_media_wordpress_sites_agency_id_fkey";
ALTER TABLE "public"."social_media_wordpress_sites" DROP CONSTRAINT IF EXISTS "social_media_wordpress_sites_client_id_fkey";
ALTER TABLE "public"."social_publications" DROP CONSTRAINT IF EXISTS "social_publications_page_id_fkey";
ALTER TABLE "public"."telegram_bot_state" DROP CONSTRAINT IF EXISTS "telegram_bot_state_shared_from_state_id_fkey";
ALTER TABLE "public"."telegram_bot_state" DROP CONSTRAINT IF EXISTS "telegram_bot_state_tenant_id_fkey";
ALTER TABLE "public"."telegram_messages" DROP CONSTRAINT IF EXISTS "telegram_messages_client_id_fkey";
ALTER TABLE "public"."telegram_messages" DROP CONSTRAINT IF EXISTS "telegram_messages_lead_id_fkey";
ALTER TABLE "public"."telegram_messages" DROP CONSTRAINT IF EXISTS "telegram_messages_tenant_id_fkey";
ALTER TABLE "public"."tenant_heartbeat_settings" DROP CONSTRAINT IF EXISTS "tenant_heartbeat_settings_tenant_id_fkey";
ALTER TABLE "public"."user_active_tenant" DROP CONSTRAINT IF EXISTS "user_active_tenant_user_id_fkey";
ALTER TABLE "public"."woocommerce_customers" DROP CONSTRAINT IF EXISTS "woocommerce_customers_site_id_fkey";
ALTER TABLE "public"."woocommerce_customers" DROP CONSTRAINT IF EXISTS "woocommerce_customers_tenant_id_fkey";
ALTER TABLE "public"."woocommerce_orders" DROP CONSTRAINT IF EXISTS "woocommerce_orders_site_id_fkey";
ALTER TABLE "public"."woocommerce_orders" DROP CONSTRAINT IF EXISTS "woocommerce_orders_tenant_id_fkey";
ALTER TABLE "public"."woocommerce_products" DROP CONSTRAINT IF EXISTS "woocommerce_products_site_id_fkey";
ALTER TABLE "public"."woocommerce_products" DROP CONSTRAINT IF EXISTS "woocommerce_products_tenant_id_fkey";
ALTER TABLE "public"."woocommerce_sync_log" DROP CONSTRAINT IF EXISTS "woocommerce_sync_log_site_id_fkey";
ALTER TABLE "public"."woocommerce_sync_log" DROP CONSTRAINT IF EXISTS "woocommerce_sync_log_tenant_id_fkey";
ALTER TABLE "public"."social_pages_shared_tenants" DROP CONSTRAINT IF EXISTS "social_pages_shared_tenants_shared_by_fkey";
ALTER TABLE "public"."wordpress_sites_shared_tenants" DROP CONSTRAINT IF EXISTS "wordpress_sites_shared_tenants_shared_by_fkey";
ALTER TABLE "public"."tasks" DROP CONSTRAINT IF EXISTS "priority_value_range";
ALTER TABLE "public"."agent_runs" DROP CONSTRAINT IF EXISTS "agent_runs_status_check";
ALTER TABLE "public"."campaign_schedules" DROP CONSTRAINT IF EXISTS "campaign_schedules_action_check";
ALTER TABLE "public"."campaign_schedules" DROP CONSTRAINT IF EXISTS "campaign_schedules_entity_type_check";
ALTER TABLE "public"."campaign_schedules" DROP CONSTRAINT IF EXISTS "campaign_schedules_when_chk";
ALTER TABLE "public"."goals" DROP CONSTRAINT IF EXISTS "goals_owner_type_check";
ALTER TABLE "public"."integration_alerts_log" DROP CONSTRAINT IF EXISTS "integration_alerts_log_alert_type_check";
ALTER TABLE "public"."marketing_runs" DROP CONSTRAINT IF EXISTS "marketing_runs_status_check";
ALTER TABLE "public"."marketing_stage_templates" DROP CONSTRAINT IF EXISTS "marketing_stage_templates_default_approval_mode_check";
ALTER TABLE "public"."marketing_stage_templates" DROP CONSTRAINT IF EXISTS "marketing_stage_templates_track_check";
ALTER TABLE "public"."marketing_triggers" DROP CONSTRAINT IF EXISTS "marketing_triggers_schedule_preset_check";
ALTER TABLE "public"."marketing_triggers" DROP CONSTRAINT IF EXISTS "marketing_triggers_trigger_type_check";
ALTER TABLE "public"."maskyoo_numbers" DROP CONSTRAINT IF EXISTS "maskyoo_numbers_category_check";
ALTER TABLE "public"."seo_call_snapshots" DROP CONSTRAINT IF EXISTS "seo_call_snapshots_category_check";
ALTER TABLE "public"."social_pages" DROP CONSTRAINT IF EXISTS "social_pages_platform_check";
ALTER TABLE "public"."social_publications" DROP CONSTRAINT IF EXISTS "social_publications_post_type_check";
ALTER TABLE "public"."social_publications" DROP CONSTRAINT IF EXISTS "social_publications_status_check";
ALTER TABLE "public"."telegram_messages" DROP CONSTRAINT IF EXISTS "telegram_messages_direction_check";
ALTER TABLE "public"."whatsapp_sessions" DROP CONSTRAINT IF EXISTS "whatsapp_sessions_status_check";
ALTER TABLE "public"."agent_action_log" DROP CONSTRAINT IF EXISTS "agent_action_log_pkey";
ALTER TABLE "public"."agent_approval_queue" DROP CONSTRAINT IF EXISTS "agent_approval_queue_pkey";
ALTER TABLE "public"."agent_eval_runs" DROP CONSTRAINT IF EXISTS "agent_eval_runs_pkey";
ALTER TABLE "public"."agent_evals" DROP CONSTRAINT IF EXISTS "agent_evals_pkey";
ALTER TABLE "public"."agent_goals" DROP CONSTRAINT IF EXISTS "agent_goals_pkey";
ALTER TABLE "public"."agent_knowledge_folders" DROP CONSTRAINT IF EXISTS "agent_knowledge_folders_pkey";
ALTER TABLE "public"."agent_knowledge_items" DROP CONSTRAINT IF EXISTS "agent_knowledge_items_pkey";
ALTER TABLE "public"."agent_mcp_connections" DROP CONSTRAINT IF EXISTS "agent_mcp_connections_pkey";
ALTER TABLE "public"."agent_memory" DROP CONSTRAINT IF EXISTS "agent_memory_pkey";
ALTER TABLE "public"."agent_runs" DROP CONSTRAINT IF EXISTS "agent_runs_pkey";
ALTER TABLE "public"."agent_supervisors" DROP CONSTRAINT IF EXISTS "agent_supervisors_pkey";
ALTER TABLE "public"."agent_supervisors" DROP CONSTRAINT IF EXISTS "agent_supervisors_supervisor_agent_id_child_agent_id_key";
ALTER TABLE "public"."agent_tasks" DROP CONSTRAINT IF EXISTS "agent_tasks_pkey";
ALTER TABLE "public"."agent_tools" DROP CONSTRAINT IF EXISTS "agent_tools_pkey";
ALTER TABLE "public"."agent_tools" DROP CONSTRAINT IF EXISTS "agent_tools_tenant_id_name_key";
ALTER TABLE "public"."agent_user_profiles" DROP CONSTRAINT IF EXISTS "agent_user_profiles_agent_id_contact_phone_key";
ALTER TABLE "public"."agent_user_profiles" DROP CONSTRAINT IF EXISTS "agent_user_profiles_pkey";
ALTER TABLE "public"."ahrefs_reports" DROP CONSTRAINT IF EXISTS "ahrefs_reports_pkey";
ALTER TABLE "public"."ai_skills" DROP CONSTRAINT IF EXISTS "ai_skills_pkey";
ALTER TABLE "public"."ai_skills" DROP CONSTRAINT IF EXISTS "ai_skills_user_id_tenant_id_name_key";
ALTER TABLE "public"."campaign_alerts" DROP CONSTRAINT IF EXISTS "campaign_alerts_pkey";
ALTER TABLE "public"."campaign_schedules" DROP CONSTRAINT IF EXISTS "campaign_schedules_pkey";
ALTER TABLE "public"."carmen_memory_episodes" DROP CONSTRAINT IF EXISTS "carmen_memory_episodes_pkey";
ALTER TABLE "public"."carmen_memory_outbox" DROP CONSTRAINT IF EXISTS "carmen_memory_outbox_pkey";
ALTER TABLE "public"."carmen_memory_pointers" DROP CONSTRAINT IF EXISTS "carmen_memory_pointers_pkey";
ALTER TABLE "public"."carmen_whatsapp_sessions" DROP CONSTRAINT IF EXISTS "carmen_whatsapp_sessions_pkey";
ALTER TABLE "public"."communication_logs" DROP CONSTRAINT IF EXISTS "communication_logs_pkey";
ALTER TABLE "public"."heartbeat_logs" DROP CONSTRAINT IF EXISTS "heartbeat_logs_pkey";
ALTER TABLE "public"."integration_alerts_log" DROP CONSTRAINT IF EXISTS "integration_alerts_log_pkey";
ALTER TABLE "public"."invoice_uploads" DROP CONSTRAINT IF EXISTS "invoice_uploads_pkey";
ALTER TABLE "public"."marketing_item_transitions" DROP CONSTRAINT IF EXISTS "marketing_item_transitions_pkey";
ALTER TABLE "public"."marketing_media_library" DROP CONSTRAINT IF EXISTS "marketing_media_library_pkey";
ALTER TABLE "public"."marketing_pipelines" DROP CONSTRAINT IF EXISTS "marketing_pipelines_client_track_unique";
ALTER TABLE "public"."marketing_runs" DROP CONSTRAINT IF EXISTS "marketing_runs_pkey";
ALTER TABLE "public"."marketing_stage_templates" DROP CONSTRAINT IF EXISTS "marketing_stage_templates_pkey";
ALTER TABLE "public"."marketing_triggers" DROP CONSTRAINT IF EXISTS "marketing_triggers_pkey";
ALTER TABLE "public"."maskyoo_manual_overrides" DROP CONSTRAINT IF EXISTS "maskyoo_manual_overrides_pkey";
ALTER TABLE "public"."maskyoo_manual_overrides" DROP CONSTRAINT IF EXISTS "maskyoo_manual_overrides_tenant_id_maskyoo_last9_period_day_key";
ALTER TABLE "public"."maskyoo_numbers" DROP CONSTRAINT IF EXISTS "maskyoo_numbers_pkey";
ALTER TABLE "public"."maskyoo_numbers" DROP CONSTRAINT IF EXISTS "maskyoo_numbers_tenant_id_phone_last9_key";
ALTER TABLE "public"."maskyoo_settings" DROP CONSTRAINT IF EXISTS "maskyoo_settings_pkey";
ALTER TABLE "public"."processed_webhook_messages" DROP CONSTRAINT IF EXISTS "processed_webhook_messages_pkey";
ALTER TABLE "public"."seo_call_snapshots" DROP CONSTRAINT IF EXISTS "seo_call_snapshots_pkey";
ALTER TABLE "public"."seo_call_snapshots" DROP CONSTRAINT IF EXISTS "seo_call_snapshots_tenant_id_client_id_category_period_star_key";
ALTER TABLE "public"."seo_monthly_updates" DROP CONSTRAINT IF EXISTS "seo_monthly_updates_pkey";
ALTER TABLE "public"."social_comments" DROP CONSTRAINT IF EXISTS "social_comments_pkey";
ALTER TABLE "public"."social_publications" DROP CONSTRAINT IF EXISTS "social_publications_pkey";
ALTER TABLE "public"."telegram_bot_state" DROP CONSTRAINT IF EXISTS "telegram_bot_state_pkey";
ALTER TABLE "public"."telegram_messages" DROP CONSTRAINT IF EXISTS "telegram_messages_pkey";
ALTER TABLE "public"."tenant_heartbeat_settings" DROP CONSTRAINT IF EXISTS "tenant_heartbeat_settings_pkey";
ALTER TABLE "public"."user_workspace_layout" DROP CONSTRAINT IF EXISTS "user_workspace_layout_pkey";
ALTER TABLE "public"."whatsapp_sessions" DROP CONSTRAINT IF EXISTS "whatsapp_sessions_pkey";
ALTER TABLE "public"."woocommerce_customers" DROP CONSTRAINT IF EXISTS "woocommerce_customers_pkey";
ALTER TABLE "public"."woocommerce_orders" DROP CONSTRAINT IF EXISTS "woocommerce_orders_pkey";
ALTER TABLE "public"."woocommerce_products" DROP CONSTRAINT IF EXISTS "woocommerce_products_pkey";
ALTER TABLE "public"."woocommerce_sync_log" DROP CONSTRAINT IF EXISTS "woocommerce_sync_log_pkey";
ALTER TABLE "public"."crm_dashboards" DROP CONSTRAINT IF EXISTS "crm_dashboards_type_check";

-- 4. Drop Staging-only and changed indexes
DROP INDEX IF EXISTS "public"."agent_memory_instructions_title_unique";
DROP INDEX IF EXISTS "public"."ai_memory_user_id_tenant_id_category_key_key";
DROP INDEX IF EXISTS "public"."idx_agency_tenant_access_lookup";
DROP INDEX IF EXISTS "public"."idx_agent_action_log_tenant";
DROP INDEX IF EXISTS "public"."idx_approval_queue_tenant_status";
DROP INDEX IF EXISTS "public"."idx_carmen_sessions_automation";
DROP INDEX IF EXISTS "public"."idx_clients_tenant_status_created";
DROP INDEX IF EXISTS "public"."idx_communication_logs_client";
DROP INDEX IF EXISTS "public"."idx_communication_logs_tenant";
DROP INDEX IF EXISTS "public"."idx_social_pages_shared_page";
DROP INDEX IF EXISTS "public"."idx_social_pages_shared_tenant";
DROP INDEX IF EXISTS "public"."idx_tasks_tenant_due_date_status";
DROP INDEX IF EXISTS "public"."idx_tenant_users_user_role_tenant";
DROP INDEX IF EXISTS "public"."idx_user_managed_agencies_user_agency";
DROP INDEX IF EXISTS "public"."idx_user_roles_user_role_tenant";
DROP INDEX IF EXISTS "public"."idx_woo_customers_email";
DROP INDEX IF EXISTS "public"."idx_woo_customers_tenant";
DROP INDEX IF EXISTS "public"."idx_woo_orders_customer_email";
DROP INDEX IF EXISTS "public"."idx_woo_orders_status";
DROP INDEX IF EXISTS "public"."idx_woo_products_tenant";
DROP INDEX IF EXISTS "public"."idx_woo_sync_log_tenant";
DROP INDEX IF EXISTS "public"."idx_wp_sites_shared_site";
DROP INDEX IF EXISTS "public"."idx_wp_sites_shared_tenant";
DROP INDEX IF EXISTS "public"."idx_woo_sync_log_site";

-- 5. Drop Staging-only functions
DROP FUNCTION IF EXISTS "public"."client_is_seo_tagged"("is_seo_client" boolean, "services_val" "jsonb");
DROP FUNCTION IF EXISTS "public"."merge_client_records"("p_source" "uuid", "p_target" "uuid", "p_reason" "text");
DROP FUNCTION IF EXISTS "public"."notify_client_follow_up_worker"();
DROP FUNCTION IF EXISTS "public"."notify_task_assigned"();
DROP FUNCTION IF EXISTS "public"."user_can_view_client"("c" "public"."clients");
DROP FUNCTION IF EXISTS "public"."user_can_view_task"("t" "public"."tasks");

-- 7. Realtime publication: remove tables prod does not publish
ALTER PUBLICATION "supabase_realtime" DROP TABLE "public"."social_media_posts";
ALTER PUBLICATION "supabase_realtime" DROP TABLE "public"."telegram_messages";

-- 8. carmen_memory_outbox: prod does not tie the id sequence to the column
ALTER SEQUENCE "public"."carmen_memory_outbox_id_seq" OWNED BY NONE;

-- 9. Convert columns to prod's types, defaults and nullability
CREATE FUNCTION pg_temp.jsonb_to_text_array(j jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE WHEN j IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(j)) END $$;
ALTER TABLE "public"."leads" ALTER COLUMN "company_name" SET NOT NULL;
ALTER TABLE "public"."leads" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."leads" ALTER COLUMN "status" SET DEFAULT 'new'::"public"."lead_status";
ALTER TABLE "public"."agent_action_log" ALTER COLUMN "action_details" DROP DEFAULT;
ALTER TABLE "public"."agent_action_log" ALTER COLUMN "action_details" SET DEFAULT '{}'::"jsonb";
ALTER TABLE "public"."agent_action_log" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."agent_action_log" ALTER COLUMN "status" SET DEFAULT 'success'::"text";
ALTER TABLE "public"."agent_tasks" ALTER COLUMN "schedule_type" DROP NOT NULL;
ALTER TABLE "public"."agent_tasks" ALTER COLUMN "task_skills" DROP DEFAULT;
ALTER TABLE "public"."agent_tasks" ALTER COLUMN "task_skills" TYPE "jsonb" USING to_jsonb("task_skills");
ALTER TABLE "public"."agent_tasks" ALTER COLUMN "task_skills" DROP NOT NULL;
ALTER TABLE "public"."agent_tasks" ALTER COLUMN "parallel_execution" DROP NOT NULL;
ALTER TABLE "public"."agent_tasks" ALTER COLUMN "enabled" DROP NOT NULL;
ALTER TABLE "public"."agent_tasks" ALTER COLUMN "run_count" DROP NOT NULL;
ALTER TABLE "public"."ai_agents" ALTER COLUMN "response_length" DROP DEFAULT;
ALTER TABLE "public"."ai_agents" ALTER COLUMN "writing_style" DROP DEFAULT;
ALTER TABLE "public"."carmen_memory_outbox" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "public"."carmen_memory_outbox" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."carmen_memory_outbox_id_seq"'::"regclass");
ALTER TABLE "public"."clients" ALTER COLUMN "is_ecommerce" DROP NOT NULL;
ALTER TABLE "public"."clients" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "public"."clients" ALTER COLUMN "tier" TYPE "text" USING "tier"::text;
ALTER TABLE "public"."clients" ALTER COLUMN "services" DROP DEFAULT;
ALTER TABLE "public"."clients" ALTER COLUMN "services" TYPE "jsonb" USING to_jsonb("services");
ALTER TABLE "public"."clients" ALTER COLUMN "services" SET DEFAULT '[]'::"jsonb";
ALTER TABLE "public"."clients" ALTER COLUMN "monthly_fixed_expense" DROP NOT NULL;
ALTER TABLE "public"."communication_logs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."communication_logs" ALTER COLUMN "status" TYPE "text" USING "status"::text;
ALTER TABLE "public"."communication_logs" ALTER COLUMN "status" SET DEFAULT 'normal'::"text";
ALTER TABLE "public"."communication_logs" ALTER COLUMN "interaction_type" DROP DEFAULT;
ALTER TABLE "public"."communication_logs" ALTER COLUMN "interaction_type" TYPE "text" USING "interaction_type"::text;
ALTER TABLE "public"."communication_logs" ALTER COLUMN "interaction_type" SET DEFAULT 'other'::"text";
ALTER TABLE "public"."communication_logs" ALTER COLUMN "interaction_type" DROP NOT NULL;
ALTER TABLE "public"."communication_logs" ALTER COLUMN "note" DROP NOT NULL;
ALTER TABLE "public"."communication_logs" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "public"."social_media_channels" ALTER COLUMN "is_active" DROP NOT NULL;
ALTER TABLE "public"."social_media_channels" ALTER COLUMN "metadata" DROP NOT NULL;
ALTER TABLE "public"."social_media_channels" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "public"."social_media_channels" ALTER COLUMN "updated_at" DROP NOT NULL;
ALTER TABLE "public"."social_media_post_channels" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "public"."social_media_posts" ALTER COLUMN "content" DROP DEFAULT;
ALTER TABLE "public"."social_media_posts" ALTER COLUMN "media_urls" DROP DEFAULT;
ALTER TABLE "public"."social_media_posts" ALTER COLUMN "media_urls" TYPE "text"[] USING pg_temp.jsonb_to_text_array("media_urls");
ALTER TABLE "public"."social_media_posts" ALTER COLUMN "media_urls" SET DEFAULT '{}'::"text"[];
ALTER TABLE "public"."social_media_posts" ALTER COLUMN "media_urls" DROP NOT NULL;
ALTER TABLE "public"."social_media_posts" ALTER COLUMN "publish_to_wordpress" DROP NOT NULL;
ALTER TABLE "public"."social_media_posts" ALTER COLUMN "metadata" DROP NOT NULL;
ALTER TABLE "public"."social_media_posts" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "public"."social_media_posts" ALTER COLUMN "updated_at" DROP NOT NULL;
ALTER TABLE "public"."social_media_wordpress_sites" ALTER COLUMN "is_active" DROP NOT NULL;
ALTER TABLE "public"."social_media_wordpress_sites" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "public"."social_media_wordpress_sites" ALTER COLUMN "updated_at" DROP NOT NULL;
ALTER TABLE "public"."woocommerce_customers" ALTER COLUMN "woo_customer_id" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_customers" ALTER COLUMN "woo_customer_id" TYPE bigint USING "woo_customer_id"::bigint;
ALTER TABLE "public"."woocommerce_customers" ALTER COLUMN "total_spent" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_customers" ALTER COLUMN "total_spent" TYPE numeric USING "total_spent"::numeric;
ALTER TABLE "public"."woocommerce_customers" ALTER COLUMN "total_spent" SET DEFAULT 0;
ALTER TABLE "public"."woocommerce_customers" ALTER COLUMN "synced_at" DROP NOT NULL;
ALTER TABLE "public"."woocommerce_customers" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "public"."woocommerce_customers" ALTER COLUMN "updated_at" DROP NOT NULL;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "woo_order_id" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "woo_order_id" TYPE bigint USING "woo_order_id"::bigint;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "total" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "total" TYPE numeric USING "total"::numeric;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "total" SET DEFAULT 0;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "subtotal" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "subtotal" TYPE numeric USING "subtotal"::numeric;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "subtotal" SET DEFAULT 0;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "total_tax" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "total_tax" TYPE numeric USING "total_tax"::numeric;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "total_tax" SET DEFAULT 0;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "shipping_total" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "shipping_total" TYPE numeric USING "shipping_total"::numeric;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "shipping_total" SET DEFAULT 0;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "discount_total" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "discount_total" TYPE numeric USING "discount_total"::numeric;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "discount_total" SET DEFAULT 0;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "customer_id" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "customer_id" TYPE bigint USING "customer_id"::bigint;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "synced_at" DROP NOT NULL;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "public"."woocommerce_orders" ALTER COLUMN "updated_at" DROP NOT NULL;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "woo_product_id" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "woo_product_id" TYPE bigint USING "woo_product_id"::bigint;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "price" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "price" TYPE numeric USING "price"::numeric;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "regular_price" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "regular_price" TYPE numeric USING "regular_price"::numeric;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "sale_price" DROP DEFAULT;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "sale_price" TYPE numeric USING "sale_price"::numeric;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "synced_at" DROP NOT NULL;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "created_at" DROP NOT NULL;
ALTER TABLE "public"."woocommerce_products" ALTER COLUMN "updated_at" DROP NOT NULL;
ALTER TABLE "public"."woocommerce_sync_log" ALTER COLUMN "started_at" DROP NOT NULL;

-- 10. Types that prod has and Staging lacks
CREATE TYPE "public"."job_priority" AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
);
CREATE TYPE "public"."job_status" AS ENUM (
    'queued',
    'running',
    'done',
    'failed',
    'dead_letter'
);
CREATE TYPE "public"."job_type" AS ENUM (
    'user_action',
    'workflow',
    'integration',
    'heavy_job'
);

-- 11. Tables that prod has and Staging lacks
CREATE TABLE "public"."automation_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "execution_id" "text" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "automation_id" "uuid",
    "trigger_type" "text",
    "entity_id" "text",
    "depth" integer DEFAULT 0 NOT NULL,
    "actions_count" integer DEFAULT 0 NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "error" "text"
);
CREATE TABLE "public"."carmen_batch_deliveries" (
    "batch_id" "text" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "automation_id" "uuid",
    "connection_user_id" "uuid",
    "chat_id" "text" NOT NULL,
    "phone_number" "text",
    "is_group" boolean DEFAULT false NOT NULL,
    "task_type" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "delivered_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "carmen_batch_deliveries_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'delivered'::"text", 'failed'::"text"])))
);
CREATE TABLE "public"."integration_health" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "last_failure_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "is_circuit_open" boolean DEFAULT false NOT NULL,
    "cooldown_until" timestamp with time zone,
    "total_calls" integer DEFAULT 0 NOT NULL,
    "total_failures" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "public"."job_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "job_type" "public"."job_type" DEFAULT 'workflow'::"public"."job_type" NOT NULL,
    "priority" "public"."job_priority" DEFAULT 'medium'::"public"."job_priority" NOT NULL,
    "status" "public"."job_status" DEFAULT 'queued'::"public"."job_status" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result" "jsonb",
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "error" "text",
    "idempotency_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "locked_until" timestamp with time zone
);
CREATE TABLE "public"."pbn_service_commands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "scope" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "allowed_resource_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pbn_service_commands_scope_check" CHECK (("scope" = ANY (ARRAY['deploy_pbn_site'::"text", 'generate_pbn_articles'::"text"])))
);
CREATE TABLE "public"."processed_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "event_key" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE "public"."task_notification_deliveries" (
    "task_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "recipient_key" "text" DEFAULT ''::"text" NOT NULL,
    "delivered_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE "public"."tenant_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "resource_type" "text" NOT NULL,
    "max_per_minute" integer DEFAULT 300 NOT NULL,
    "current_count" integer DEFAULT 0 NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE "public"."wa_group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "group_chat_id" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "wa_id" "text",
    "name" "text",
    "contact_type" "text" DEFAULT 'unknown'::"text",
    "contact_id" "uuid",
    "contact_name" "text",
    "is_admin" boolean DEFAULT false,
    "last_synced_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

-- 12. Columns that prod has and Staging lacks
ALTER TABLE "public"."cursor_dispatches" ADD COLUMN IF NOT EXISTS "human_task_id" "uuid";

-- 13. Functions: prod's definitions
CREATE OR REPLACE FUNCTION "public"."check_circuit_breaker"("p_tenant_id" "uuid", "p_provider" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_record integration_health%ROWTYPE;
BEGIN
  SELECT * INTO v_record FROM integration_health
  WHERE tenant_id = p_tenant_id AND provider = p_provider;
  IF NOT FOUND THEN RETURN true; END IF;
  IF v_record.is_circuit_open THEN
    IF v_record.cooldown_until IS NOT NULL AND now() > v_record.cooldown_until THEN
      UPDATE integration_health SET is_circuit_open = false, consecutive_failures = 0
      WHERE tenant_id = p_tenant_id AND provider = p_provider;
      RETURN true;
    END IF;
    RETURN false;
  END IF;
  RETURN true;
END; $$;
CREATE OR REPLACE FUNCTION "public"."check_idempotency"("p_tenant_id" "uuid", "p_event_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO processed_events (tenant_id, event_key)
  VALUES (p_tenant_id, p_event_key) ON CONFLICT (event_key) DO NOTHING;
  RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_limit RECORD;
BEGIN
  SELECT * INTO v_limit FROM tenant_rate_limits WHERE tenant_id = p_tenant_id AND resource_type = p_resource_type;
  IF NOT FOUND THEN RETURN TRUE; END IF;
  IF v_limit.window_start < now() - interval '1 minute' THEN
    UPDATE tenant_rate_limits SET current_count = 1, window_start = now() WHERE id = v_limit.id;
    RETURN TRUE;
  END IF;
  IF v_limit.current_count >= v_limit.max_per_minute THEN RETURN FALSE; END IF;
  UPDATE tenant_rate_limits SET current_count = current_count + 1 WHERE id = v_limit.id;
  RETURN TRUE;
END; $$;
CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text", "p_default_max" integer DEFAULT 300) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_max integer; v_count integer; v_window timestamptz;
BEGIN
  SELECT max_per_minute, current_count, window_start INTO v_max, v_count, v_window
  FROM tenant_rate_limits WHERE tenant_id = p_tenant_id AND resource_type = p_resource_type;
  IF NOT FOUND THEN
    INSERT INTO tenant_rate_limits (tenant_id, resource_type, max_per_minute, current_count, window_start)
    VALUES (p_tenant_id, p_resource_type, p_default_max, 1, now()) ON CONFLICT (tenant_id, resource_type) DO NOTHING;
    RETURN true;
  END IF;
  IF v_window < now() - interval '1 minute' THEN
    UPDATE tenant_rate_limits SET current_count = 1, window_start = now()
    WHERE tenant_id = p_tenant_id AND resource_type = p_resource_type; RETURN true;
  END IF;
  IF v_count >= v_max THEN RETURN false; END IF;
  UPDATE tenant_rate_limits SET current_count = current_count + 1
  WHERE tenant_id = p_tenant_id AND resource_type = p_resource_type;
  RETURN true;
END; $$;
CREATE OR REPLACE FUNCTION "public"."claim_next_job"("p_job_types" "text"[] DEFAULT NULL::"text"[]) RETURNS TABLE("id" "uuid", "tenant_id" "uuid", "job_type" "text", "priority" integer, "payload" "jsonb", "attempts" integer, "max_attempts" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  UPDATE job_queue jq
  SET status = 'running', started_at = now(), attempts = jq.attempts + 1
  FROM (
    SELECT jq2.id FROM job_queue jq2
    WHERE jq2.status = 'queued'
      AND (p_job_types IS NULL OR jq2.job_type = ANY(p_job_types))
    ORDER BY jq2.priority ASC, jq2.created_at ASC
    LIMIT 1 FOR UPDATE SKIP LOCKED
  ) sub
  WHERE jq.id = sub.id
  RETURNING jq.id, jq.tenant_id, jq.job_type, jq.priority, jq.payload, jq.attempts, jq.max_attempts;
END; $$;
CREATE OR REPLACE FUNCTION "public"."cleanup_old_events"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM processed_events WHERE processed_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT; RETURN v_deleted;
END; $$;
CREATE OR REPLACE FUNCTION "public"."cleanup_old_jobs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM job_queue WHERE status IN ('done', 'dead_letter') AND finished_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT; RETURN v_deleted;
END; $$;
CREATE OR REPLACE FUNCTION "public"."client_update_documents_phone_call"("p_content" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN COALESCE(btrim(p_content), '') = '' THEN false
    WHEN p_content ~* '(לא|טרם|עוד לא)[[:space:]]+([^[:space:]]+[[:space:]]+){0,2}(לדבר|דיבר|שוחח)'
      OR p_content ~* 'אין[[:space:]]+מענה'
      OR p_content ~* '(הלקוח|הלקוחה)[[:space:]]+לא[[:space:]]+(ענה|ענתה)'
      THEN false
    ELSE p_content ~* '(דיברתי|דיברנו|דיברה|דיבר|שוחחתי|שוחחנו|שוחחה|שוחח).{0,40}(טלפונית|בטלפון|עם[[:space:]]+(הלקוח|הלקוחה))'
      OR p_content ~* '(טלפונית|בטלפון).{0,40}(דיברתי|דיברנו|דיברה|דיבר|שוחחתי|שוחחנו|שוחחה|שוחח)'
      OR p_content ~* '(שיחה טלפונית|שיחת טלפון).{0,30}(הלקוח|הלקוחה|לקוח|לקוחה)'
      OR p_content ~* 'בוצעה[[:space:]]+שיחה.{0,20}(הלקוח|הלקוחה|לקוח|לקוחה)'
  END;
$$;
CREATE OR REPLACE FUNCTION "public"."complete_job"("p_job_id" "uuid", "p_success" boolean, "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_attempts integer; v_max integer;
BEGIN
  SELECT attempts, max_attempts INTO v_attempts, v_max FROM job_queue WHERE id = p_job_id;
  IF p_success THEN
    UPDATE job_queue SET status = 'done', finished_at = now() WHERE id = p_job_id;
  ELSE
    IF v_attempts >= v_max THEN
      UPDATE job_queue SET status = 'dead_letter', finished_at = now(), error = p_error WHERE id = p_job_id;
    ELSE
      UPDATE job_queue SET status = 'queued', error = p_error, started_at = NULL WHERE id = p_job_id;
    END IF;
  END IF;
END; $$;
CREATE OR REPLACE FUNCTION "public"."enqueue_job"("p_tenant_id" "uuid", "p_job_type" "text", "p_priority" integer DEFAULT 5, "p_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_max_attempts" integer DEFAULT 3) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_job_id uuid; v_rate_ok boolean;
BEGIN
  v_rate_ok := check_rate_limit(p_tenant_id, p_job_type);
  IF NOT v_rate_ok THEN
    RAISE EXCEPTION 'Rate limit exceeded for tenant % on resource %', p_tenant_id, p_job_type;
  END IF;
  INSERT INTO job_queue (tenant_id, job_type, priority, status, payload, max_attempts)
  VALUES (p_tenant_id, p_job_type, p_priority, 'queued', p_payload, p_max_attempts)
  RETURNING id INTO v_job_id;
  RETURN v_job_id;
END; $$;
CREATE OR REPLACE FUNCTION "public"."format_client_mood_status_label"("status" "public"."client_mood_status") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN status IS NULL THEN 'לא הוגדר'
    WHEN status = 'happy'::public.client_mood_status THEN '😊 מבסוט / תקין'
    WHEN status = 'wavering'::public.client_mood_status THEN '😐 מתנדנד / רגיש'
    WHEN status = 'churn_risk'::public.client_mood_status THEN '😟 סכנת נטישה / תלונה'
    WHEN status = 'not_progressing'::public.client_mood_status THEN '😔 לא מתקדם'
    ELSE status::text
  END;
$$;
CREATE OR REPLACE FUNCTION "public"."get_chat_contacts"() RETURNS TABLE("contact_id" "uuid", "contact_type" "text", "name" "text", "contact_name" "text", "phone" "text", "email" "text", "agency_id" "uuid", "agency_name" "text", "unread_count" bigint, "last_message_at" timestamp with time zone, "is_blocked" boolean, "manychat_subscriber_id" "text", "active_chat_provider" "public"."chat_provider")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_tenant_id uuid;
  current_user_id uuid;
BEGIN
  current_tenant_id := get_user_tenant_id(auth.uid());
  current_user_id := auth.uid();
  
  IF current_tenant_id IS NULL OR current_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    c.id as contact_id,
    'client'::text as contact_type,
    c.name,
    c.contact_name,
    c.phone,
    c.email,
    c.agency_id,
    a.name as agency_name,
    COALESCE(
      (SELECT COUNT(*)::bigint 
       FROM chat_messages cm 
       WHERE cm.client_id = c.id 
       AND cm.direction = 'incoming' 
       AND cm.read_at IS NULL
       AND cm.is_blocked = false
       AND cm.connection_user_id = current_user_id),
      0
    ) as unread_count,
    (SELECT MAX(created_at) 
     FROM chat_messages cm 
     WHERE cm.client_id = c.id 
     AND cm.connection_user_id = current_user_id) as last_message_at,
    false as is_blocked,
    c.manychat_subscriber_id,
    c.active_chat_provider
  FROM clients c
  JOIN agencies a ON c.agency_id = a.id
  WHERE c.tenant_id = current_tenant_id
  AND EXISTS (
    SELECT 1 FROM chat_messages cm 
    WHERE cm.client_id = c.id
    AND cm.connection_user_id = current_user_id
    AND cm.is_blocked = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocked_contacts bc
    WHERE bc.client_id = c.id
    AND bc.connection_user_id = current_user_id
    AND bc.tenant_id = current_tenant_id
  )

  UNION ALL

  SELECT 
    l.id as contact_id,
    'lead'::text as contact_type,
    l.company_name as name,
    l.contact_name,
    l.phone,
    l.email,
    l.agency_id,
    a.name as agency_name,
    COALESCE(
      (SELECT COUNT(*)::bigint 
       FROM chat_messages cm 
       WHERE cm.lead_id = l.id 
       AND cm.direction = 'incoming' 
       AND cm.read_at IS NULL
       AND cm.is_blocked = false
       AND cm.connection_user_id = current_user_id),
      0
    ) as unread_count,
    (SELECT MAX(created_at) 
     FROM chat_messages cm 
     WHERE cm.lead_id = l.id
     AND cm.connection_user_id = current_user_id) as last_message_at,
    false as is_blocked,
    l.manychat_subscriber_id,
    l.active_chat_provider
  FROM leads l
  LEFT JOIN agencies a ON l.agency_id = a.id
  WHERE l.tenant_id = current_tenant_id
  AND EXISTS (
    SELECT 1 FROM chat_messages cm 
    WHERE cm.lead_id = l.id
    AND cm.connection_user_id = current_user_id
    AND cm.is_blocked = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocked_contacts bc
    WHERE bc.lead_id = l.id
    AND bc.connection_user_id = current_user_id
    AND bc.tenant_id = current_tenant_id
  )

  UNION ALL

  SELECT 
    g.id as contact_id,
    'group'::text as contact_type,
    g.group_name as name,
    NULL::text as contact_name,
    NULL::text as phone,
    NULL::text as email,
    g.agency_id,
    a.name as agency_name,
    COALESCE(
      (SELECT COUNT(*)::bigint 
       FROM chat_messages cm 
       WHERE cm.group_id = g.id 
       AND cm.direction = 'incoming' 
       AND cm.read_at IS NULL
       AND cm.is_blocked = false
       AND cm.connection_user_id = current_user_id),
      0
    ) as unread_count,
    (SELECT MAX(created_at) 
     FROM chat_messages cm 
     WHERE cm.group_id = g.id
     AND cm.connection_user_id = current_user_id) as last_message_at,
    false as is_blocked,
    NULL::text as manychat_subscriber_id,
    NULL::chat_provider as active_chat_provider
  FROM whatsapp_groups g
  LEFT JOIN agencies a ON g.agency_id = a.id
  WHERE g.tenant_id = current_tenant_id
  AND g.is_blocked = false
  AND EXISTS (
    SELECT 1 FROM chat_messages cm 
    WHERE cm.group_id = g.id
    AND cm.connection_user_id = current_user_id
    AND cm.is_blocked = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocked_contacts bc
    WHERE bc.group_id = g.id
    AND bc.connection_user_id = current_user_id
    AND bc.tenant_id = current_tenant_id
  )

  ORDER BY last_message_at DESC NULLS LAST;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."get_chat_contacts"("p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("contact_id" "uuid", "contact_type" "text", "name" "text", "contact_name" "text", "phone" "text", "email" "text", "agency_id" "uuid", "agency_name" "text", "unread_count" bigint, "last_message_at" timestamp with time zone, "is_blocked" boolean, "manychat_subscriber_id" "text", "active_chat_provider" "public"."chat_provider", "whatsapp_avatar_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_tenant_id uuid;
  current_user_id uuid;
BEGIN
  current_tenant_id := COALESCE(p_tenant_id, get_user_tenant_id(auth.uid()));
  current_user_id := auth.uid();
  
  IF current_tenant_id IS NULL OR current_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    c.id as contact_id,
    'client'::text as contact_type,
    c.name,
    c.contact_name,
    c.phone,
    c.email,
    c.agency_id,
    a.name as agency_name,
    COALESCE(
      (SELECT COUNT(*)::bigint 
       FROM chat_messages cm 
       WHERE cm.client_id = c.id 
       AND cm.direction = 'inbound' 
       AND cm.read_at IS NULL
       AND cm.is_blocked = false
       AND cm.connection_user_id = current_user_id),
      0
    ) as unread_count,
    (SELECT MAX(created_at) 
     FROM chat_messages cm 
     WHERE cm.client_id = c.id 
     AND cm.connection_user_id = current_user_id) as last_message_at,
    false as is_blocked,
    c.manychat_subscriber_id,
    c.active_chat_provider,
    c.whatsapp_avatar_url
  FROM clients c
  JOIN agencies a ON c.agency_id = a.id
  WHERE c.tenant_id = current_tenant_id
  AND EXISTS (
    SELECT 1 FROM chat_messages cm 
    WHERE cm.client_id = c.id
    AND cm.connection_user_id = current_user_id
    AND cm.is_blocked = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocked_contacts bc
    WHERE bc.client_id = c.id
    AND bc.connection_user_id = current_user_id
    AND bc.tenant_id = current_tenant_id
  )

  UNION ALL

  SELECT 
    l.id as contact_id,
    'lead'::text as contact_type,
    l.company_name as name,
    l.contact_name,
    l.phone,
    l.email,
    l.agency_id,
    a.name as agency_name,
    COALESCE(
      (SELECT COUNT(*)::bigint 
       FROM chat_messages cm 
       WHERE cm.lead_id = l.id 
       AND cm.direction = 'inbound' 
       AND cm.read_at IS NULL
       AND cm.is_blocked = false
       AND cm.connection_user_id = current_user_id),
      0
    ) as unread_count,
    (SELECT MAX(created_at) 
     FROM chat_messages cm 
     WHERE cm.lead_id = l.id
     AND cm.connection_user_id = current_user_id) as last_message_at,
    false as is_blocked,
    l.manychat_subscriber_id,
    l.active_chat_provider,
    l.whatsapp_avatar_url
  FROM leads l
  LEFT JOIN agencies a ON l.agency_id = a.id
  WHERE l.tenant_id = current_tenant_id
  AND EXISTS (
    SELECT 1 FROM chat_messages cm 
    WHERE cm.lead_id = l.id
    AND cm.connection_user_id = current_user_id
    AND cm.is_blocked = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocked_contacts bc
    WHERE bc.lead_id = l.id
    AND bc.connection_user_id = current_user_id
    AND bc.tenant_id = current_tenant_id
  )

  UNION ALL

  SELECT 
    g.id as contact_id,
    'group'::text as contact_type,
    g.group_name as name,
    NULL::text as contact_name,
    NULL::text as phone,
    NULL::text as email,
    g.agency_id,
    a.name as agency_name,
    COALESCE(
      (SELECT COUNT(*)::bigint 
       FROM chat_messages cm 
       WHERE cm.group_id = g.id 
       AND cm.direction = 'inbound' 
       AND cm.read_at IS NULL
       AND cm.is_blocked = false
       AND cm.connection_user_id = current_user_id),
      0
    ) as unread_count,
    (SELECT MAX(created_at) 
     FROM chat_messages cm 
     WHERE cm.group_id = g.id
     AND cm.connection_user_id = current_user_id) as last_message_at,
    false as is_blocked,
    NULL::text as manychat_subscriber_id,
    NULL::chat_provider as active_chat_provider,
    g.whatsapp_avatar_url
  FROM whatsapp_groups g
  LEFT JOIN agencies a ON g.agency_id = a.id
  WHERE g.tenant_id = current_tenant_id
  AND g.is_blocked = false
  AND EXISTS (
    SELECT 1 FROM chat_messages cm 
    WHERE cm.group_id = g.id
    AND cm.connection_user_id = current_user_id
    AND cm.is_blocked = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocked_contacts bc
    WHERE bc.group_id = g.id
    AND bc.connection_user_id = current_user_id
    AND bc.tenant_id = current_tenant_id
  )

  ORDER BY last_message_at DESC NULLS LAST;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."get_latest_client_call_updates"("p_client_ids" "uuid"[]) RETURNS TABLE("client_id" "uuid", "last_client_call_at" timestamp with time zone, "last_client_call_by" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT DISTINCT ON (updates.client_id)
    updates.client_id,
    updates.created_at AS last_client_call_at,
    COALESCE(NULLIF(profiles.full_name, ''), profiles.email) AS last_client_call_by
  FROM public.client_updates AS updates
  LEFT JOIN public.profiles AS profiles ON profiles.id = updates.user_id
  WHERE updates.client_id = ANY (p_client_ids)
    AND (
      updates.update_type = 'call'
      OR (
        updates.update_type = 'weekly_update'
        AND public.client_update_documents_phone_call(updates.content)
      )
    )
  ORDER BY updates.client_id, updates.created_at DESC;
$$;
CREATE OR REPLACE FUNCTION "public"."handle_new_tenant_pipeline_stages"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN PERFORM initialize_tenant_pipeline_stages(NEW.id); RETURN NEW; END;
$$;
CREATE OR REPLACE FUNCTION "public"."initialize_tenant_pipeline_stages"("_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.lead_pipeline_stages (tenant_id, stage_key, label, color, sort_order, is_active)
  VALUES
    (_tenant_id, 'new', 'חדש', '#3B82F6', 1, true), (_tenant_id, 'contacted', 'יצרנו קשר', '#8B5CF6', 2, true),
    (_tenant_id, 'meeting_scheduled', 'נקבעה פגישה', '#F59E0B', 3, true), (_tenant_id, 'proposal_sent', 'נשלחה הצעה', '#EC4899', 4, true),
    (_tenant_id, 'negotiation', 'משא ומתן', '#10B981', 5, true), (_tenant_id, 'closed', 'נסגר', '#22C55E', 6, true)
  ON CONFLICT (tenant_id, stage_key) DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."is_root_tenant"("tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT NOT EXISTS (SELECT 1 FROM tenants WHERE id = tenant_id AND parent_tenant_id IS NOT NULL);
$$;
CREATE OR REPLACE FUNCTION "public"."kick_internal_function"("p_function" "text", "p_body" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'net', 'vault'
    AS $$
DECLARE
  project_url text;
  worker_secret text;
  request_id bigint;
BEGIN
  IF coalesce(auth.jwt() ->> 'role', auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_function NOT IN (
    'cron-sync-google-ads',
    'cron-sync-facebook-insights',
    'cron-sync-facebook-ecommerce',
    'cron-sync-google-analytics'
  ) THEN
    RAISE EXCEPTION 'invalid function';
  END IF;

  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name IN ('SUPABASE_URL', 'supabase_url', 'project_url')
  ORDER BY CASE name WHEN 'SUPABASE_URL' THEN 0 WHEN 'supabase_url' THEN 1 ELSE 2 END
  LIMIT 1;

  SELECT decrypted_secret INTO worker_secret
  FROM vault.decrypted_secrets
  WHERE name IN ('service_role_key', 'SUPABASE_SERVICE_ROLE_KEY')
  ORDER BY CASE name WHEN 'service_role_key' THEN 0 ELSE 1 END
  LIMIT 1;

  IF project_url IS NULL OR worker_secret IS NULL OR worker_secret = '' THEN
    RAISE EXCEPTION 'kick secrets missing';
  END IF;

  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 150000
  ) INTO request_id;

  RETURN request_id;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."log_client_mood_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  actor uuid := auth.uid();
  old_label text;
  new_label text;
  body text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.mood_status IS NOT DISTINCT FROM OLD.mood_status THEN
    RETURN NEW;
  END IF;

  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  old_label := public.format_client_mood_status_label(OLD.mood_status);
  new_label := public.format_client_mood_status_label(NEW.mood_status);

  IF OLD.mood_status IS NULL THEN
    body := 'עודכנה שביעות רצון: ' || new_label;
  ELSE
    body := 'שביעות רצון: ' || old_label || ' → ' || new_label;
  END IF;

  INSERT INTO public.client_updates (
    client_id,
    tenant_id,
    user_id,
    content,
    update_type
  ) VALUES (
    NEW.id,
    NEW.tenant_id,
    actor,
    body,
    'mood_status'
  );

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."merge_orphan_profile_by_email"("_auth_user_id" "uuid", "_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_orphan_id uuid;
BEGIN
  IF _auth_user_id IS NULL OR NULLIF(trim(_email), '') IS NULL THEN
    RETURN;
  END IF;

  SELECT p.id
  INTO v_orphan_id
  FROM public.profiles p
  WHERE lower(p.email) = lower(_email)
    AND p.id <> _auth_user_id
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
  LIMIT 1;

  IF v_orphan_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles dst
  SET
    full_name = COALESCE(NULLIF(dst.full_name, ''), src.full_name),
    campaigner_id = COALESCE(dst.campaigner_id, src.campaigner_id),
    sales_person_id = COALESCE(dst.sales_person_id, src.sales_person_id),
    phone = COALESCE(dst.phone, src.phone),
    avatar_url = COALESCE(dst.avatar_url, src.avatar_url),
    ui_mode = COALESCE(dst.ui_mode, src.ui_mode),
    status = 'active',
    updated_at = now()
  FROM public.profiles src
  WHERE dst.id = _auth_user_id
    AND src.id = v_orphan_id;

  INSERT INTO public.tenant_users (user_id, tenant_id, role)
  SELECT _auth_user_id, tu.tenant_id, tu.role
  FROM public.tenant_users tu
  WHERE tu.user_id = v_orphan_id
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, tenant_id)
  SELECT _auth_user_id, ur.role, ur.tenant_id
  FROM public.user_roles ur
  WHERE ur.user_id = v_orphan_id
  ON CONFLICT (user_id, role, tenant_id) DO NOTHING;

  INSERT INTO public.user_permissions (user_id, module, can_access)
  SELECT _auth_user_id, up.module, up.can_access
  FROM public.user_permissions up
  WHERE up.user_id = v_orphan_id
  ON CONFLICT (user_id, module) DO UPDATE
    SET can_access = EXCLUDED.can_access;

  INSERT INTO public.user_active_tenant (user_id, tenant_id, updated_at)
  SELECT _auth_user_id, uat.tenant_id, now()
  FROM public.user_active_tenant uat
  WHERE uat.user_id = v_orphan_id
  ON CONFLICT (user_id) DO NOTHING;

  DELETE FROM public.user_permissions WHERE user_id = v_orphan_id;
  DELETE FROM public.user_roles WHERE user_id = v_orphan_id;
  DELETE FROM public.tenant_users WHERE user_id = v_orphan_id;
  DELETE FROM public.user_active_tenant WHERE user_id = v_orphan_id;
  DELETE FROM public.profiles WHERE id = v_orphan_id;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."propagate_whatsapp_group_invite_link"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.invite_link IS NOT NULL AND btrim(NEW.invite_link) <> '' THEN
    UPDATE public.whatsapp_groups AS wg
    SET invite_link = NEW.invite_link,
        updated_at = now()
    WHERE wg.group_chat_id = NEW.group_chat_id
      AND wg.id <> NEW.id
      AND (wg.invite_link IS NULL OR wg.invite_link <> NEW.invite_link);
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."record_integration_failure"("p_tenant_id" "uuid", "p_provider" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_failures integer;
BEGIN
  INSERT INTO integration_health (tenant_id, provider, consecutive_failures, last_failure_at, total_calls, total_failures)
  VALUES (p_tenant_id, p_provider, 1, now(), 1, 1)
  ON CONFLICT (tenant_id, provider) DO UPDATE
  SET consecutive_failures = integration_health.consecutive_failures + 1, last_failure_at = now(), total_calls = integration_health.total_calls + 1, total_failures = integration_health.total_failures + 1
  RETURNING consecutive_failures INTO v_failures;
  IF v_failures >= 5 THEN UPDATE integration_health SET is_circuit_open = true, cooldown_until = now() + interval '5 minutes' WHERE tenant_id = p_tenant_id AND provider = p_provider; END IF;
END; $$;
CREATE OR REPLACE FUNCTION "public"."record_integration_result"("p_tenant_id" "uuid", "p_provider" "text", "p_success" boolean, "p_failure_threshold" integer DEFAULT 5, "p_cooldown_minutes" integer DEFAULT 5) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_success THEN
    INSERT INTO integration_health (tenant_id, provider, consecutive_failures, last_failure_at, is_circuit_open, cooldown_until)
    VALUES (p_tenant_id, p_provider, 0, NULL, false, NULL)
    ON CONFLICT (tenant_id, provider) DO UPDATE SET consecutive_failures = 0, is_circuit_open = false, cooldown_until = NULL;
  ELSE
    INSERT INTO integration_health (tenant_id, provider, consecutive_failures, last_failure_at, is_circuit_open, cooldown_until)
    VALUES (p_tenant_id, p_provider, 1, now(), false, NULL)
    ON CONFLICT (tenant_id, provider) DO UPDATE SET consecutive_failures = integration_health.consecutive_failures + 1, last_failure_at = now(),
      is_circuit_open = CASE WHEN integration_health.consecutive_failures + 1 >= p_failure_threshold THEN true ELSE false END,
      cooldown_until = CASE WHEN integration_health.consecutive_failures + 1 >= p_failure_threshold THEN now() + (p_cooldown_minutes || ' minutes')::interval ELSE integration_health.cooldown_until END;
  END IF;
END; $$;
CREATE OR REPLACE FUNCTION "public"."record_integration_success"("p_tenant_id" "uuid", "p_provider" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO integration_health (tenant_id, provider, consecutive_failures, last_success_at, is_circuit_open, total_calls)
  VALUES (p_tenant_id, p_provider, 0, now(), false, 1)
  ON CONFLICT (tenant_id, provider) DO UPDATE SET consecutive_failures = 0, last_success_at = now(), is_circuit_open = false, cooldown_until = NULL, total_calls = integration_health.total_calls + 1;
END; $$;
CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."claim_campaign_pulse_delivery"("p_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  local_now timestamp := timezone('Asia/Jerusalem', now());
  current_slot timestamp;
  affected_rows integer := 0;
BEGIN
  IF EXTRACT(ISODOW FROM local_now) <> 7 THEN
    RETURN false;
  END IF;

  IF local_now::time < time '07:20' OR local_now::time >= time '07:40' THEN
    RETURN false;
  END IF;

  current_slot := date_trunc('day', local_now) + interval '7 hours 30 minutes';

  UPDATE public.tenant_heartbeat_settings
  SET campaign_pulse_last_sent_at = now()
  WHERE tenant_id = p_tenant_id
    AND campaign_pulse_enabled = true
    AND (
      campaign_pulse_last_sent_at IS NULL
      OR timezone('Asia/Jerusalem', campaign_pulse_last_sent_at) < current_slot
    );
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."copy_tenant_template"("_source_tenant_id" "uuid", "_target_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.custom_fields (
    tenant_id, entity_type, field_key, field_label, field_type,
    is_required, is_visible, options, sort_order
  )
  SELECT
    _target_tenant_id, entity_type, field_key, field_label, field_type,
    is_required, is_visible, options, sort_order
  FROM public.custom_fields
  WHERE tenant_id = _source_tenant_id
  ON CONFLICT (tenant_id, entity_type, field_key) DO NOTHING;

  INSERT INTO public.menu_items (
    tenant_id, menu_key, original_label, custom_label, route, icon,
    sort_order, is_visible, category, parent_menu_key, badge, hidden_from_child_tenants
  )
  SELECT
    _target_tenant_id, menu_key, original_label, custom_label, route, icon,
    sort_order, is_visible, category, parent_menu_key, badge, hidden_from_child_tenants
  FROM public.menu_items
  WHERE tenant_id = _source_tenant_id
  ON CONFLICT (tenant_id, menu_key) DO NOTHING;

  INSERT INTO public.tenant_terminology (tenant_id, term_key, custom_value)
  SELECT _target_tenant_id, term_key, custom_value
  FROM public.tenant_terminology
  WHERE tenant_id = _source_tenant_id
  ON CONFLICT (tenant_id, term_key) DO NOTHING;

  INSERT INTO public.lead_pipeline_stages (
    tenant_id, stage_key, label, color, sort_order, is_active
  )
  SELECT _target_tenant_id, stage_key, label, color, sort_order, is_active
  FROM public.lead_pipeline_stages
  WHERE tenant_id = _source_tenant_id
  ON CONFLICT (tenant_id, stage_key) DO NOTHING;

  INSERT INTO public.lead_statuses (tenant_id, status_key, label, color, sort_order, is_active)
  SELECT _target_tenant_id, status_key, label, color, sort_order, is_active
  FROM public.lead_statuses
  WHERE tenant_id = _source_tenant_id
  ON CONFLICT (tenant_id, status_key) DO NOTHING;

  INSERT INTO public.tenant_settings (tenant_id, setting_key, setting_value)
  SELECT _target_tenant_id, setting_key, setting_value
  FROM public.tenant_settings
  WHERE tenant_id = _source_tenant_id
  ON CONFLICT (tenant_id, setting_key) DO NOTHING;

  INSERT INTO public.automations (
    tenant_id, name, description, trigger_type, action_type,
    configuration, conditions, active
  )
  SELECT _target_tenant_id, name, description, trigger_type, action_type,
    configuration, conditions, active
  FROM public.automations
  WHERE tenant_id = _source_tenant_id;

END;
$$;
CREATE OR REPLACE FUNCTION "public"."get_chat_contacts"("p_tenant_id" "uuid", "p_connection_user_ids" "uuid"[], "p_provider" "public"."chat_provider") RETURNS TABLE("contact_id" "uuid", "contact_type" "text", "name" "text", "contact_name" "text", "phone" "text", "email" "text", "agency_id" "uuid", "agency_name" "text", "unread_count" bigint, "last_message_at" timestamp with time zone, "is_blocked" boolean, "manychat_subscriber_id" "text", "active_chat_provider" "public"."chat_provider", "whatsapp_avatar_url" "text", "sender_phone" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_tenant_id uuid;
  current_user_id uuid;
  is_admin boolean;
  allowed_user_ids uuid[];
  user_ids uuid[];
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  is_admin := COALESCE(public.is_super_admin(current_user_id), false);
  current_tenant_id := public.get_user_tenant_id(current_user_id);

  IF p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM current_tenant_id THEN
    IF NOT is_admin THEN
      RETURN;
    END IF;
    current_tenant_id := p_tenant_id;
  END IF;

  IF current_tenant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT owners.owner_id)
  INTO allowed_user_ids
  FROM (
    SELECT current_user_id AS owner_id
    UNION
    SELECT ti.user_id
    FROM public.tenant_integrations ti
    WHERE ti.tenant_id = current_tenant_id
      AND ti.user_id IS NOT NULL
      AND (
        is_admin
        OR ti.user_id = current_user_id
        OR ti.connection_visibility = 'org'
        OR EXISTS (
          SELECT 1
          FROM public.integration_user_permissions iup
          WHERE iup.integration_id = ti.id
            AND iup.user_id = current_user_id
        )
      )
  ) owners;

  user_ids := CASE
    WHEN p_connection_user_ids IS NULL THEN ARRAY[current_user_id]
    ELSE ARRAY(
      SELECT unnest(p_connection_user_ids)
      INTERSECT
      SELECT unnest(COALESCE(allowed_user_ids, ARRAY[current_user_id]))
    )
  END;

  IF array_length(user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT
      c.id AS contact_id,
      'client'::text AS contact_type,
      c.name AS name,
      c.contact_name AS contact_name,
      c.phone AS phone,
      c.email AS email,
      c.agency_id AS agency_id,
      a.name AS agency_name,
      COALESCE((
        SELECT COUNT(*)::bigint
        FROM public.chat_messages cm
        WHERE cm.client_id = c.id
          AND cm.direction = 'inbound'
          AND cm.read_at IS NULL
          AND cm.is_blocked = false
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
      ), 0) AS unread_count,
      (
        SELECT MAX(cm.created_at)
        FROM public.chat_messages cm
        WHERE cm.client_id = c.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      ) AS last_message_at,
      false AS is_blocked,
      c.manychat_subscriber_id AS manychat_subscriber_id,
      COALESCE(p_provider, (
        SELECT cm.provider
        FROM public.chat_messages cm
        WHERE cm.client_id = c.id
          AND cm.connection_user_id = ANY(user_ids)
          AND cm.is_blocked = false
        ORDER BY cm.created_at DESC
        LIMIT 1
      )) AS active_chat_provider,
      c.whatsapp_avatar_url AS whatsapp_avatar_url,
      c.phone AS sender_phone
    FROM public.clients c
    JOIN public.agencies a ON c.agency_id = a.id
    WHERE c.tenant_id = current_tenant_id
      AND EXISTS (
        SELECT 1
        FROM public.chat_messages cm
        WHERE cm.client_id = c.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_contacts bc
        WHERE bc.client_id = c.id
          AND bc.connection_user_id = current_user_id
          AND bc.tenant_id = current_tenant_id
      )

    UNION ALL

    SELECT
      l.id AS contact_id,
      'lead'::text AS contact_type,
      l.company_name AS name,
      l.contact_name AS contact_name,
      l.phone AS phone,
      l.email AS email,
      l.agency_id AS agency_id,
      a.name AS agency_name,
      COALESCE((
        SELECT COUNT(*)::bigint
        FROM public.chat_messages cm
        WHERE cm.lead_id = l.id
          AND cm.direction = 'inbound'
          AND cm.read_at IS NULL
          AND cm.is_blocked = false
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
      ), 0) AS unread_count,
      (
        SELECT MAX(cm.created_at)
        FROM public.chat_messages cm
        WHERE cm.lead_id = l.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      ) AS last_message_at,
      false AS is_blocked,
      l.manychat_subscriber_id AS manychat_subscriber_id,
      COALESCE(p_provider, (
        SELECT cm.provider
        FROM public.chat_messages cm
        WHERE cm.lead_id = l.id
          AND cm.connection_user_id = ANY(user_ids)
          AND cm.is_blocked = false
        ORDER BY cm.created_at DESC
        LIMIT 1
      )) AS active_chat_provider,
      l.whatsapp_avatar_url AS whatsapp_avatar_url,
      l.phone AS sender_phone
    FROM public.leads l
    LEFT JOIN public.agencies a ON l.agency_id = a.id
    WHERE l.tenant_id = current_tenant_id
      AND EXISTS (
        SELECT 1
        FROM public.chat_messages cm
        WHERE cm.lead_id = l.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_contacts bc
        WHERE bc.lead_id = l.id
          AND bc.connection_user_id = current_user_id
          AND bc.tenant_id = current_tenant_id
      )

    UNION ALL

    SELECT
      g.id AS contact_id,
      'group'::text AS contact_type,
      g.group_name AS name,
      NULL::text AS contact_name,
      NULL::text AS phone,
      NULL::text AS email,
      g.agency_id AS agency_id,
      a.name AS agency_name,
      COALESCE((
        SELECT COUNT(*)::bigint
        FROM public.chat_messages cm
        WHERE cm.group_id = g.id
          AND cm.direction = 'inbound'
          AND cm.read_at IS NULL
          AND cm.is_blocked = false
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
      ), 0) AS unread_count,
      (
        SELECT MAX(cm.created_at)
        FROM public.chat_messages cm
        WHERE cm.group_id = g.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      ) AS last_message_at,
      false AS is_blocked,
      NULL::text AS manychat_subscriber_id,
      COALESCE(p_provider, (
        SELECT cm.provider
        FROM public.chat_messages cm
        WHERE cm.group_id = g.id
          AND cm.connection_user_id = ANY(user_ids)
          AND cm.is_blocked = false
        ORDER BY cm.created_at DESC
        LIMIT 1
      )) AS active_chat_provider,
      g.whatsapp_avatar_url AS whatsapp_avatar_url,
      NULL::text AS sender_phone
    FROM public.whatsapp_groups g
    LEFT JOIN public.agencies a ON g.agency_id = a.id
    WHERE g.tenant_id = current_tenant_id
      AND g.is_blocked = false
      AND EXISTS (
        SELECT 1
        FROM public.chat_messages cm
        WHERE cm.group_id = g.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_contacts bc
        WHERE bc.group_id = g.id
          AND bc.connection_user_id = current_user_id
          AND bc.tenant_id = current_tenant_id
      )

    UNION ALL

    SELECT
      md5(cm.sender_phone)::uuid AS contact_id,
      'unknown'::text AS contact_type,
      COALESCE((array_agg(NULLIF(cm.sender_name, '') ORDER BY cm.created_at DESC))[1], cm.sender_phone, 'Unknown') AS name,
      NULL::text AS contact_name,
      cm.sender_phone AS phone,
      NULL::text AS email,
      NULL::uuid AS agency_id,
      NULL::text AS agency_name,
      COUNT(*) FILTER (
        WHERE cm.direction = 'inbound'
          AND cm.read_at IS NULL
          AND cm.is_blocked = false
      )::bigint AS unread_count,
      MAX(cm.created_at) AS last_message_at,
      false AS is_blocked,
      NULL::text AS manychat_subscriber_id,
      COALESCE(p_provider, (array_agg(cm.provider ORDER BY cm.created_at DESC))[1]) AS active_chat_provider,
      (array_agg((cm.raw_provider_data->>'senderProfileImage')::text ORDER BY cm.created_at DESC))[1] AS whatsapp_avatar_url,
      cm.sender_phone AS sender_phone
    FROM public.chat_messages cm
    WHERE cm.tenant_id = current_tenant_id
      AND cm.client_id IS NULL
      AND cm.lead_id IS NULL
      AND cm.group_id IS NULL
      AND cm.sender_phone IS NOT NULL
      AND cm.connection_user_id = ANY(user_ids)
      AND (p_provider IS NULL OR cm.provider = p_provider)
      AND cm.is_blocked = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_contacts bc
        WHERE bc.sender_phone = cm.sender_phone
          AND bc.connection_user_id = current_user_id
          AND bc.tenant_id = current_tenant_id
      )
    GROUP BY cm.sender_phone
  ) sub
  ORDER BY sub.last_message_at DESC NULLS LAST;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."get_lead_visitor_journey"("p_lead_id" "uuid") RETURNS TABLE("session_id" "uuid", "started_at" timestamp with time zone, "duration_seconds" integer, "page_count" integer, "utm_source" "text", "utm_medium" "text", "utm_campaign" "text", "referrer" "text", "landing_page" "text", "device_type" "text", "pages" "jsonb", "events" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as session_id, s.started_at, s.duration_seconds, s.page_count,
    s.utm_source, s.utm_medium, s.utm_campaign, s.referrer, s.landing_page, s.device_type,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('url', pv.page_url,'title', pv.page_title,'time_on_page', pv.time_on_page,'scroll_depth', pv.scroll_depth,'viewed_at', pv.viewed_at) ORDER BY pv.viewed_at) FROM site_pageviews pv WHERE pv.session_id = s.id),'[]'::jsonb) as pages,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name', e.event_name,'category', e.event_category,'label', e.event_label,'data', e.event_data,'occurred_at', e.occurred_at) ORDER BY e.occurred_at) FROM site_events e WHERE e.session_id = s.id),'[]'::jsonb) as events
  FROM site_sessions s
  JOIN site_visitors v ON s.visitor_id = v.id
  WHERE v.lead_id = p_lead_id
  ORDER BY s.started_at DESC;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."get_user_client_ids"("_user_id" "uuid") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH campaigner_clients AS (
    SELECT ct.client_id
    FROM public.profiles p
    JOIN public.client_team ct ON ct.campaigner_id = p.campaigner_id
    WHERE p.id = _user_id
      AND public.has_role(_user_id, 'campaigner'::app_role)
  ),
  seo_clients AS (
    SELECT c.id AS client_id
    FROM public.clients c
    WHERE public.user_has_seo_scope(_user_id)
      AND (
        c.is_seo_client = true
        OR c.services @> '["seo"]'::jsonb
      )
      AND (
        c.tenant_id = public.get_user_tenant_id(_user_id)
        OR public.user_has_cross_tenant_agency_access(_user_id, c.agency_id)
      )
  )
  SELECT COALESCE(
    ARRAY_AGG(DISTINCT client_id),
    ARRAY[]::uuid[]
  )
  FROM (
    SELECT client_id FROM campaigner_clients
    UNION ALL
    SELECT client_id FROM seo_clients
  ) combined
$$;
CREATE OR REPLACE FUNCTION "public"."get_user_tenant_id"("_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT tenant_id FROM (
    SELECT tenant_id FROM public.user_active_tenant WHERE user_id = _user_id
    UNION ALL
    SELECT tenant_id FROM public.tenant_users WHERE user_id = _user_id LIMIT 1
  ) sub LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION "public"."handle_campaigner_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.tenant_users WHERE user_id = NEW.id LIMIT 1;
  IF NEW.campaigner_id IS NOT NULL AND (OLD.campaigner_id IS NULL OR OLD.campaigner_id != NEW.campaigner_id) THEN
    INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (NEW.id, 'campaigner', v_tenant_id) ON CONFLICT (user_id, role, tenant_id) DO NOTHING;
  END IF;
  IF NEW.campaigner_id IS NULL AND OLD.campaigner_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.client_team WHERE campaigner_id = OLD.campaigner_id) THEN
      DELETE FROM public.user_roles WHERE user_id = NEW.id AND role = 'campaigner' AND tenant_id = v_tenant_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."handle_client_onboarding_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE default_campaigner_id uuid;
BEGIN
  IF NEW.status = 'onboarding' AND (OLD.status IS NULL OR OLD.status != 'onboarding') THEN
    IF NOT EXISTS (SELECT 1 FROM public.client_onboarding WHERE client_id = NEW.id AND status != 'campaign_live') THEN
      SELECT id INTO default_campaigner_id FROM public.campaigners WHERE full_name = 'דוד' AND active = true LIMIT 1;
      IF default_campaigner_id IS NULL THEN SELECT campaigner_id INTO default_campaigner_id FROM public.client_team WHERE client_id = NEW.id LIMIT 1; END IF;
      IF default_campaigner_id IS NULL THEN SELECT id INTO default_campaigner_id FROM public.campaigners WHERE active = true LIMIT 1; END IF;
      IF default_campaigner_id IS NOT NULL THEN
        INSERT INTO public.client_onboarding (client_id, agency_id, campaigner_id, title, status, notes, tenant_id)
        VALUES (NEW.id, NEW.agency_id, default_campaigner_id, 'קליטת לקוח: ' || NEW.name, 'research_meeting', 'נוצר אוטומטית מעדכון סטטוס לקוח', NEW.tenant_id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."handle_lead_to_onboarding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE new_client_id uuid;
BEGIN
  IF NEW.status = 'closed' AND NEW.won_date IS NOT NULL AND (OLD.won_date IS NULL OR OLD.won_date != NEW.won_date)
     AND NOT EXISTS (SELECT 1 FROM public.clients WHERE name = NEW.company_name AND agency_id = NEW.agency_id AND notes LIKE 'נוצר מליד:%' AND created_at > NOW() - INTERVAL '5 minutes') THEN
    INSERT INTO public.clients (name, agency_id, email, phone, industry, notes, status, folder_link, tenant_id)
    VALUES (NEW.company_name, NEW.agency_id, NEW.email, NEW.phone, NEW.industry, 'נוצר מליד: ' || COALESCE(NEW.notes, ''), 'onboarding', NEW.folder_link, NEW.tenant_id) RETURNING id INTO new_client_id;
    INSERT INTO public.client_onboarding (client_id, agency_id, campaigner_id, title, status, notes, tenant_id)
    SELECT new_client_id, NEW.agency_id, (SELECT id FROM public.campaigners WHERE full_name = 'דוד' AND active = true LIMIT 1), 'קליטת לקוח: ' || NEW.company_name, 'research_meeting', 'נוצר אוטומטית מליד - נא לבחור קמפיינר', NEW.tenant_id
    WHERE EXISTS (SELECT 1 FROM public.campaigners WHERE full_name = 'דוד' AND active = true);
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv    public.invitation_tokens%ROWTYPE;
  v_meta   jsonb;
  v_role   text;
  v_tenant uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'active')
  ON CONFLICT (id) DO NOTHING;

  BEGIN
    PERFORM public.merge_orphan_profile_by_email(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user orphan merge failed for %: %', NEW.email, SQLERRM;
  END;

  BEGIN
    SELECT * INTO v_inv
    FROM public.invitation_tokens
    WHERE lower(email) = lower(NEW.email)
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_inv.id IS NOT NULL AND v_inv.tenant_id IS NOT NULL THEN
      v_meta   := COALESCE(v_inv.metadata, '{}'::jsonb);
      v_role   := NULLIF(v_meta->>'role', '');
      v_tenant := v_inv.tenant_id;

      INSERT INTO public.tenant_users (user_id, tenant_id, role)
      SELECT NEW.id, v_tenant, COALESCE(v_role, 'member')
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE user_id = NEW.id AND tenant_id = v_tenant
      );

      INSERT INTO public.user_active_tenant (user_id, tenant_id)
      SELECT NEW.id, v_tenant
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_active_tenant WHERE user_id = NEW.id
      );

      IF v_role IS NOT NULL THEN
        BEGIN
          INSERT INTO public.user_roles (user_id, role, tenant_id)
          VALUES (NEW.id, v_role::public.app_role, v_tenant)
          ON CONFLICT (user_id, role, tenant_id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'handle_new_user: bad role % for %: %', v_role, NEW.email, SQLERRM;
        END;
      END IF;

      IF jsonb_typeof(v_meta->'modulePermissions') = 'array' THEN
        INSERT INTO public.user_permissions (user_id, module, can_access)
        SELECT NEW.id, m.value, true
        FROM jsonb_array_elements_text(v_meta->'modulePermissions') AS m(value)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.user_permissions up
          WHERE up.user_id = NEW.id AND up.module = m.value
        );
      END IF;

      IF NULLIF(v_meta->>'campaignerId', '') IS NOT NULL THEN
        UPDATE public.profiles SET campaigner_id = (v_meta->>'campaignerId')::uuid WHERE id = NEW.id;
      END IF;
      IF NULLIF(v_meta->>'salesPersonId', '') IS NOT NULL THEN
        UPDATE public.profiles SET sales_person_id = (v_meta->>'salesPersonId')::uuid WHERE id = NEW.id;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user auto-link failed for %: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."has_finance_permission"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id AND module = 'finance_view' AND can_access = true)
  OR has_role(_user_id, 'owner'::app_role) OR is_super_admin(_user_id)
$$;
CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = _role AND ( (_role = 'super_admin' AND ur.tenant_id IS NULL) OR ur.tenant_id = public.get_user_tenant_id(_user_id) OR ( ur.tenant_id IS NULL AND EXISTS ( SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = _user_id AND tu.tenant_id = public.get_user_tenant_id(_user_id) AND tu.role::text = _role::text ) ) ) ) $$;
CREATE OR REPLACE FUNCTION "public"."initialize_tenant_menu_items"("_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.menu_items (tenant_id, menu_key, original_label, route, icon, sort_order, is_visible, category, parent_menu_key)
  VALUES
    (_tenant_id, 'agencies', 'סוכנויות', '/agencies', 'Building2', 1, true, 'main', NULL),
    (_tenant_id, 'clients', 'לקוחות', '/clients', 'Users', 2, true, 'main', NULL),
    (_tenant_id, 'tasks', 'משימות', '/tasks', 'CheckSquare', 3, true, 'main', NULL),
    (_tenant_id, 'client-onboarding', 'לקוחות בקליטה', '/client-onboarding', 'UserPlus', 4, true, 'main', NULL),
    (_tenant_id, 'time-tracking', 'שעון נוכחות', '/time-tracking', 'Clock', 5, true, 'main', NULL),
    (_tenant_id, 'campaigners', 'צוות', '/campaigners', 'Megaphone', 6, true, 'main', NULL),
    (_tenant_id, 'users', 'ניהול משתמשים', '/users', 'ShieldCheck', 7, true, 'main', NULL),
    (_tenant_id, 'my-profile', 'אזור אישי', '/my-profile', 'User', 8, true, 'main', NULL),
    (_tenant_id, 'chat', 'צ''אט', '/chat', 'MessageCircle', 9, true, 'main', NULL),
    
    (_tenant_id, 'management', 'ניהול', '#', 'Settings', 100, true, 'group', NULL),
    (_tenant_id, 'dashboard', 'דשבורד', '/dashboard', 'LayoutDashboard', 101, true, 'management', 'management'),
    (_tenant_id, 'finance', 'כספים', '/finance', 'DollarSign', 102, true, 'management', 'management'),
    (_tenant_id, 'reports', 'דוחות', '/reports', 'BarChart3', 103, true, 'management', 'management'),
    (_tenant_id, 'suppliers', 'ספקים', '/suppliers', 'Truck', 104, true, 'management', 'management'),
    (_tenant_id, 'automations', 'אוטומציות', '/automations', 'Zap', 105, true, 'management', 'management'),
    (_tenant_id, 'tenants', 'ניהול ארגונים', '/tenants', 'Building', 106, true, 'management', 'management'),
    (_tenant_id, 'branding', 'התאמת מערכת', '/branding', 'Palette', 107, true, 'management', 'management'),
    (_tenant_id, 'accounting-integrations', 'הנהלת חשבונות', '/accounting-integrations', 'Building', 108, true, 'management', 'management'),
    (_tenant_id, 'ai-support', 'תמיכה טכנית AI', '/ai-support', 'Bot', 109, true, 'management', 'management'),
    (_tenant_id, 'menu-management', 'ניהול תפריטים', '/menu-management', 'Menu', 110, true, 'management', 'management'),
    (_tenant_id, 'fields-management', 'ניהול שדות', '/fields-management', 'ListTree', 111, true, 'management', 'management'),
    
    (_tenant_id, 'sales', 'ניהול מכירות', '#', 'TrendingUp', 200, true, 'group', NULL),
    (_tenant_id, 'sales-dashboard', 'דשבורד מכירות', '/sales-dashboard', 'TrendingUp', 201, true, 'sales', 'sales'),
    (_tenant_id, 'leads', 'לידים', '/leads', 'Target', 202, true, 'sales', 'sales'),
    (_tenant_id, 'products', 'מוצרים ושירותים', '/products', 'Package', 203, true, 'sales', 'sales'),
    (_tenant_id, 'sales-people', 'אנשי מכירות', '/sales-people', 'UserCheck', 204, true, 'sales', 'sales'),
    (_tenant_id, 'integrations', 'אינטגרציות', '/integrations', 'Plug', 206, true, 'sales', 'sales')
  ON CONFLICT (tenant_id, menu_key) DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."initialize_tenant_terminology"("_tenant_id" "uuid", "_business_type" "text" DEFAULT 'marketing_agency'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE _terms JSONB;
BEGIN
  IF _business_type = 'general_business' THEN
    _terms := '[{"key":"agency","singular":"מחלקה","plural":"מחלקות","orig_s":"סוכנות","orig_p":"סוכנויות"},{"key":"client","singular":"לקוח","plural":"לקוחות","orig_s":"לקוח","orig_p":"לקוחות"},{"key":"lead","singular":"ליד","plural":"לידים","orig_s":"ליד","orig_p":"לידים"},{"key":"task","singular":"משימה","plural":"משימות","orig_s":"משימה","orig_p":"משימות"},{"key":"campaigner","singular":"עובד","plural":"עובדים","orig_s":"קמפיינר","orig_p":"קמפיינרים"},{"key":"sales_person","singular":"איש מכירות","plural":"אנשי מכירות","orig_s":"איש מכירות","orig_p":"אנשי מכירות"},{"key":"supplier","singular":"ספק","plural":"ספקים","orig_s":"ספק","orig_p":"ספקים"},{"key":"product","singular":"מוצר","plural":"מוצרים","orig_s":"מוצר","orig_p":"מוצרים"},{"key":"onboarding","singular":"קליטה","plural":"קליטות","orig_s":"קליטה","orig_p":"קליטות"},{"key":"role_owner","singular":"בעלים","plural":"בעלים","orig_s":"בעלים","orig_p":"בעלים"},{"key":"role_team_manager","singular":"מנהל","plural":"מנהלים","orig_s":"מנהל צוות","orig_p":"מנהלי צוות"},{"key":"role_campaigner","singular":"עובד","plural":"עובדים","orig_s":"קמפיינר","orig_p":"קמפיינרים"},{"key":"role_sales_person","singular":"איש מכירות","plural":"אנשי מכירות","orig_s":"איש מכירות","orig_p":"אנשי מכירות"},{"key":"role_seo","singular":"מנהל פרויקט","plural":"מנהלי פרויקטים","orig_s":"SEO","orig_p":"SEO"},{"key":"role_super_admin","singular":"מנהל מערכת","plural":"מנהלי מערכת","orig_s":"סופר אדמין","orig_p":"סופר אדמינים"},{"key":"task_tab_all","singular":"כל המשימות","plural":"כל המשימות","orig_s":"כל המשימות","orig_p":"כל המשימות"},{"key":"task_tab_seo","singular":"משימות פרויקט","plural":"משימות פרויקט","orig_s":"משימות ללקוחות","orig_p":"משימות ללקוחות"},{"key":"task_tab_campaign","singular":"משימות כלליות","plural":"משימות כלליות","orig_s":"משימות ללידים","orig_p":"משימות ללידים"}]'::JSONB;
  ELSE
    _terms := '[{"key":"agency","singular":"סוכנות","plural":"סוכנויות","orig_s":"סוכנות","orig_p":"סוכנויות"},{"key":"client","singular":"לקוח","plural":"לקוחות","orig_s":"לקוח","orig_p":"לקוחות"},{"key":"lead","singular":"ליד","plural":"לידים","orig_s":"ליד","orig_p":"לידים"},{"key":"task","singular":"משימה","plural":"משימות","orig_s":"משימה","orig_p":"משימות"},{"key":"campaigner","singular":"קמפיינר","plural":"קמפיינרים","orig_s":"קמפיינר","orig_p":"קמפיינרים"},{"key":"sales_person","singular":"איש מכירות","plural":"אנשי מכירות","orig_s":"איש מכירות","orig_p":"אנשי מכירות"},{"key":"supplier","singular":"ספק","plural":"ספקים","orig_s":"ספק","orig_p":"ספקים"},{"key":"product","singular":"מוצר","plural":"מוצרים","orig_s":"מוצר","orig_p":"מוצרים"},{"key":"onboarding","singular":"קליטה","plural":"קליטות","orig_s":"קליטה","orig_p":"קליטות"},{"key":"role_owner","singular":"בעלים","plural":"בעלים","orig_s":"בעלים","orig_p":"בעלים"},{"key":"role_team_manager","singular":"מנהל צוות","plural":"מנהלי צוות","orig_s":"מנהל צוות","orig_p":"מנהלי צוות"},{"key":"role_campaigner","singular":"קמפיינר","plural":"קמפיינרים","orig_s":"קמפיינר","orig_p":"קמפיינרים"},{"key":"role_sales_person","singular":"איש מכירות","plural":"אנשי מכירות","orig_s":"איש מכירות","orig_p":"אנשי מכירות"},{"key":"role_seo","singular":"SEO","plural":"SEO","orig_s":"SEO","orig_p":"SEO"},{"key":"role_super_admin","singular":"סופר אדמין","plural":"סופר אדמינים","orig_s":"סופר אדמין","orig_p":"סופר אדמינים"},{"key":"task_tab_all","singular":"כל המשימות","plural":"כל המשימות","orig_s":"כל המשימות","orig_p":"כל המשימות"},{"key":"task_tab_seo","singular":"משימות ללקוחות","plural":"משימות ללקוחות","orig_s":"משימות ללקוחות","orig_p":"משימות ללקוחות"},{"key":"task_tab_campaign","singular":"משימות ללידים","plural":"משימות ללידים","orig_s":"משימות ללידים","orig_p":"משימות ללידים"}]'::JSONB;
  END IF;
  INSERT INTO tenant_terminology (tenant_id, term_key, singular, plural, original_singular, original_plural)
  SELECT _tenant_id, term->>'key', term->>'singular', term->>'plural', term->>'orig_s', term->>'orig_p'
  FROM jsonb_array_elements(_terms) AS term
  ON CONFLICT (tenant_id, term_key) DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."initialize_tenant_terminology_from_preset"("_tenant_id" "uuid", "_preset_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE _preset RECORD; _term JSONB;
BEGIN
  SELECT * INTO _preset FROM terminology_presets WHERE id = _preset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preset not found'; END IF;
  FOR _term IN SELECT * FROM jsonb_array_elements(_preset.terms) LOOP
    INSERT INTO tenant_terminology (tenant_id, term_key, singular, plural, original_singular, original_plural)
    VALUES (_tenant_id, _term->>'key', _term->>'singular', _term->>'plural', _term->>'singular', _term->>'plural')
    ON CONFLICT (tenant_id, term_key) DO NOTHING;
  END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."is_automation_shared_to_tenant"("_automation_id" "uuid", "_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.automation_shared_tenants WHERE automation_id = _automation_id AND tenant_id = _tenant_id)
$$;
CREATE OR REPLACE FUNCTION "public"."is_channel_member"("p_channel_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_channel_members WHERE channel_id = p_channel_id AND user_id = p_user_id AND tenant_id = get_user_tenant_id(p_user_id))
$$;
CREATE OR REPLACE FUNCTION "public"."is_super_admin"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin' AND tenant_id IS NULL)
$$;
CREATE OR REPLACE FUNCTION "public"."list_system_cron_jobs"() RETURNS TABLE("jobid" bigint, "jobname" "text", "schedule" "text", "active" boolean, "command" "text", "last_run_at" timestamp with time zone, "last_status" "text", "last_duration_ms" bigint, "last_return_message" "text", "success_count_7d" bigint, "fail_count_7d" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron'
    AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'permission denied'; END IF;
  RETURN QUERY
  WITH last_run AS (SELECT DISTINCT ON (d.jobid) d.jobid, d.start_time AS last_run_at, d.status AS last_status, EXTRACT(EPOCH FROM (d.end_time - d.start_time))::bigint * 1000 AS last_duration_ms, d.return_message AS last_return_message FROM cron.job_run_details d ORDER BY d.jobid, d.start_time DESC),
  stats AS (SELECT d.jobid, COUNT(*) FILTER (WHERE d.status='succeeded') AS success_count_7d, COUNT(*) FILTER (WHERE d.status='failed') AS fail_count_7d FROM cron.job_run_details d WHERE d.start_time > now() - interval '7 days' GROUP BY d.jobid)
  SELECT j.jobid, j.jobname, j.schedule, j.active, j.command, lr.last_run_at, lr.last_status, lr.last_duration_ms, lr.last_return_message, COALESCE(s.success_count_7d, 0), COALESCE(s.fail_count_7d, 0)
  FROM cron.job j LEFT JOIN last_run lr ON lr.jobid=j.jobid LEFT JOIN stats s ON s.jobid=j.jobid ORDER BY j.jobname;
END; $$;
CREATE OR REPLACE FUNCTION "public"."notify_task_notification_worker"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.campaigner_id IS DISTINCT FROM NEW.campaigner_id
       OR OLD.sales_person_id IS DISTINCT FROM NEW.sales_person_id THEN
      NEW.assignment_notification_sent_at := NULL;
      IF NEW.status <> 'done' THEN
        NEW.high_priority_reminder_sent_at := NULL;
        NEW.high_priority_creator_notified_at := NULL;
      END IF;
    END IF;

    IF OLD.due_date IS DISTINCT FROM NEW.due_date AND NEW.status <> 'done' THEN
      IF NEW.due_date IS NOT NULL
         AND (OLD.due_date IS NULL OR NEW.due_date > OLD.due_date) THEN
        NEW.overdue_notified_at := NULL;
        NEW.overdue_creator_notified_at := NULL;
      END IF;
    END IF;

    IF OLD.self_reminder_at IS DISTINCT FROM NEW.self_reminder_at THEN
      NEW.self_reminder_sent_at := NULL;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'done' THEN
      NEW.completion_creator_notified_at := NULL;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM net.http_post(
      url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/task-notification-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'task_worker_anon_key'
        )
      ),
      body := jsonb_build_object('task_id', NEW.id),
      timeout_milliseconds := 5000
    );
  ELSIF OLD.campaigner_id IS DISTINCT FROM NEW.campaigner_id
     OR OLD.sales_person_id IS DISTINCT FROM NEW.sales_person_id
     OR OLD.self_reminder_at IS DISTINCT FROM NEW.self_reminder_at
     OR OLD.due_date IS DISTINCT FROM NEW.due_date
     OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'done') THEN
    PERFORM net.http_post(
      url := 'https://zvoijyneresvkadpprel.supabase.co/functions/v1/task-notification-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'task_worker_anon_key'
        )
      ),
      body := jsonb_build_object('task_id', NEW.id),
      timeout_milliseconds := 5000
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_task_notification_worker failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."search_contacts_for_chat"("p_search_term" "text", "p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("contact_id" "text", "contact_type" "text", "name" "text", "contact_name" "text", "phone" "text", "email" "text", "agency_id" "uuid", "agency_name" "text", "unread_count" bigint, "last_message_at" timestamp with time zone, "is_blocked" boolean, "manychat_subscriber_id" "text", "active_chat_provider" "public"."chat_provider", "sender_phone" "text", "has_messages" boolean, "whatsapp_avatar_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_tenant_id uuid;
  current_user_id uuid;
  search_pattern text;
BEGIN
  current_user_id := auth.uid();
  search_pattern := '%' || lower(p_search_term) || '%';

  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  current_tenant_id := get_user_tenant_id(current_user_id);

  IF p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM current_tenant_id THEN
    IF NOT COALESCE(is_super_admin(current_user_id), false) THEN
      RETURN;
    END IF;
    current_tenant_id := p_tenant_id;
  END IF;

  IF current_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    c.id::text as contact_id,
    'client'::text as contact_type,
    c.name,
    c.contact_name,
    c.phone,
    c.email,
    c.agency_id,
    a.name as agency_name,
    COALESCE(
      (SELECT COUNT(*)::bigint 
       FROM chat_messages cm 
       WHERE cm.client_id = c.id 
       AND cm.direction = 'inbound' 
       AND cm.read_at IS NULL
       AND cm.is_blocked = false
       AND cm.connection_user_id = current_user_id),
      0
    ) as unread_count,
    (SELECT MAX(created_at) 
     FROM chat_messages cm 
     WHERE cm.client_id = c.id 
     AND cm.connection_user_id = current_user_id) as last_message_at,
    false as is_blocked,
    c.manychat_subscriber_id,
    c.active_chat_provider,
    c.phone as sender_phone,
    EXISTS(SELECT 1 FROM chat_messages cm WHERE cm.client_id = c.id AND cm.connection_user_id = current_user_id) as has_messages,
    c.whatsapp_avatar_url
  FROM clients c
  JOIN agencies a ON c.agency_id = a.id
  WHERE c.tenant_id = current_tenant_id
  AND (
    lower(c.name) LIKE search_pattern
    OR lower(COALESCE(c.contact_name, '')) LIKE search_pattern
    OR lower(COALESCE(c.phone, '')) LIKE search_pattern
    OR lower(COALESCE(c.email, '')) LIKE search_pattern
  )

  UNION ALL

  SELECT 
    l.id::text as contact_id,
    'lead'::text as contact_type,
    l.company_name as name,
    l.contact_name,
    l.phone,
    l.email,
    l.agency_id,
    a.name as agency_name,
    COALESCE(
      (SELECT COUNT(*)::bigint 
       FROM chat_messages cm 
       WHERE cm.lead_id = l.id 
       AND cm.direction = 'inbound' 
       AND cm.read_at IS NULL
       AND cm.is_blocked = false
       AND cm.connection_user_id = current_user_id),
      0
    ) as unread_count,
    (SELECT MAX(created_at) 
     FROM chat_messages cm 
     WHERE cm.lead_id = l.id
     AND cm.connection_user_id = current_user_id) as last_message_at,
    false as is_blocked,
    l.manychat_subscriber_id,
    l.active_chat_provider,
    l.phone as sender_phone,
    EXISTS(SELECT 1 FROM chat_messages cm WHERE cm.lead_id = l.id AND cm.connection_user_id = current_user_id) as has_messages,
    l.whatsapp_avatar_url
  FROM leads l
  LEFT JOIN agencies a ON l.agency_id = a.id
  WHERE l.tenant_id = current_tenant_id
  AND (
    lower(l.company_name) LIKE search_pattern
    OR lower(COALESCE(l.contact_name, '')) LIKE search_pattern
    OR lower(COALESCE(l.phone, '')) LIKE search_pattern
    OR lower(COALESCE(l.email, '')) LIKE search_pattern
  )

  UNION ALL

  SELECT 
    g.id::text as contact_id,
    'group'::text as contact_type,
    g.group_name as name,
    NULL::text as contact_name,
    NULL::text as phone,
    NULL::text as email,
    g.agency_id,
    a.name as agency_name,
    COALESCE(
      (SELECT COUNT(*)::bigint 
       FROM chat_messages cm 
       WHERE cm.group_id = g.id 
       AND cm.direction = 'inbound' 
       AND cm.read_at IS NULL
       AND cm.is_blocked = false
       AND cm.connection_user_id = current_user_id),
      0
    ) as unread_count,
    (SELECT MAX(created_at) 
     FROM chat_messages cm 
     WHERE cm.group_id = g.id
     AND cm.connection_user_id = current_user_id) as last_message_at,
    false as is_blocked,
    NULL::text as manychat_subscriber_id,
    'green_api'::chat_provider as active_chat_provider,
    NULL::text as sender_phone,
    EXISTS(SELECT 1 FROM chat_messages cm WHERE cm.group_id = g.id AND cm.connection_user_id = current_user_id) as has_messages,
    g.whatsapp_avatar_url
  FROM whatsapp_groups g
  LEFT JOIN agencies a ON g.agency_id = a.id
  WHERE g.tenant_id = current_tenant_id
  AND g.is_blocked = false
  AND (
    lower(g.group_name) LIKE search_pattern
    OR lower(COALESCE(g.description, '')) LIKE search_pattern
  )

  UNION ALL

  SELECT 
    uc.sender_phone as contact_id,
    'unknown'::text as contact_type,
    COALESCE(uc.sender_name, uc.sender_phone) as name,
    NULL::text as contact_name,
    uc.sender_phone as phone,
    NULL::text as email,
    NULL::uuid as agency_id,
    NULL::text as agency_name,
    COALESCE(
      (SELECT COUNT(*)::bigint 
       FROM chat_messages cm 
       WHERE cm.sender_phone = uc.sender_phone 
       AND cm.client_id IS NULL 
       AND cm.lead_id IS NULL 
       AND cm.group_id IS NULL
       AND cm.direction = 'inbound' 
       AND cm.read_at IS NULL
       AND cm.is_blocked = false
       AND cm.connection_user_id = current_user_id
       AND cm.tenant_id = current_tenant_id),
      0
    ) as unread_count,
    uc.last_message_at,
    false as is_blocked,
    NULL::text as manychat_subscriber_id,
    uc.provider as active_chat_provider,
    uc.sender_phone as sender_phone,
    true as has_messages,
    uc.avatar_url as whatsapp_avatar_url
  FROM (
    SELECT DISTINCT ON (cm.sender_phone)
      cm.sender_phone,
      cm.sender_name,
      cm.provider,
      MAX(cm.created_at) OVER (PARTITION BY cm.sender_phone) as last_message_at,
      (cm.raw_provider_data->>'senderProfileImage')::text as avatar_url
    FROM chat_messages cm
    WHERE cm.tenant_id = current_tenant_id
      AND cm.client_id IS NULL
      AND cm.lead_id IS NULL
      AND cm.group_id IS NULL
      AND cm.sender_phone IS NOT NULL
      AND cm.connection_user_id = current_user_id
      AND cm.is_blocked = false
      AND (
        lower(cm.sender_phone) LIKE search_pattern
        OR lower(COALESCE(cm.sender_name, '')) LIKE search_pattern
      )
    ORDER BY cm.sender_phone, cm.created_at DESC
  ) uc
  WHERE NOT EXISTS (
    SELECT 1 FROM blocked_contacts bc
    WHERE bc.sender_phone = uc.sender_phone
    AND bc.connection_user_id = current_user_id
    AND bc.tenant_id = current_tenant_id
  )

  ORDER BY last_message_at DESC NULLS LAST;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."trigger_integration_disconnected"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  old_needs_reauth boolean;
  new_needs_reauth boolean;
  last_trigger_at timestamptz;
  integration_label text;
  payload_body jsonb;
BEGIN
  old_needs_reauth := COALESCE((OLD.settings->>'needs_reauth')::boolean, false);
  new_needs_reauth := COALESCE((NEW.settings->>'needs_reauth')::boolean, false);

  IF NOT (new_needs_reauth = true AND old_needs_reauth = false) THEN
    RETURN NEW;
  END IF;

  last_trigger_at := (NEW.settings->>'last_disconnect_trigger_at')::timestamptz;
  IF last_trigger_at IS NOT NULL AND last_trigger_at > now() - interval '24 hours' THEN
    RETURN NEW;
  END IF;

  integration_label := CASE NEW.integration_type
    WHEN 'google_analytics' THEN 'Google Analytics'
    WHEN 'google_search_console' THEN 'Google Search Console'
    WHEN 'google_ads' THEN 'Google Ads'
    WHEN 'google_calendar' THEN 'Google Calendar'
    WHEN 'gmail' THEN 'Gmail'
    WHEN 'facebook' THEN 'Facebook'
    WHEN 'meta_ads' THEN 'Meta Ads'
    WHEN 'ahrefs' THEN 'Ahrefs'
    WHEN 'green_api' THEN 'WhatsApp (Green API)'
    WHEN 'manychat' THEN 'ManyChat'
    WHEN 'telegram' THEN 'Telegram'
    ELSE COALESCE(NEW.integration_type, 'Integration')
  END;

  payload_body := jsonb_build_object(
    'trigger_type', 'integration_disconnected',
    'tenant_id', NEW.tenant_id,
    'data', jsonb_build_object(
      'integration_id', NEW.id,
      'integration_type', NEW.integration_type,
      'integration_name', integration_label,
      'last_error', NEW.settings->>'last_auth_error',
      'last_error_at', NEW.settings->>'last_auth_error_at',
      'disconnected_at', now()
    )
  );

  PERFORM net.http_post(
    url := 'https://jnzguisakdtcollxmgzd.supabase.co/functions/v1/trigger-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impuemd1aXNha2R0Y29sbHhtZ3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NTcxNTcsImV4cCI6MjA3NjEzMzE1N30.VrxuppQtj-cByA2ml2krzwoM1rHwelXIr0f5D3eP4KM'
    ),
    body := payload_body
  );

  NEW.settings := COALESCE(NEW.settings, '{}'::jsonb)
    || jsonb_build_object('last_disconnect_trigger_at', now());

  RAISE LOG 'Integration disconnect trigger fired: tenant=% integration=%', NEW.tenant_id, NEW.integration_type;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."user_can_access_client"("_user_id" "uuid", "_client_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH client_scope AS (
    SELECT id, tenant_id, agency_id, is_seo_client, services
    FROM public.clients
    WHERE id = _client_id
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM client_scope c
    WHERE
      public.is_super_admin(_user_id)
      OR (
        (public.has_role(_user_id, 'owner'::app_role) OR public.has_role(_user_id, 'agency_owner'::app_role))
        AND (
          c.tenant_id = public.get_user_tenant_id(_user_id)
          OR public.user_has_cross_tenant_agency_access(_user_id, c.agency_id)
        )
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public.tenant_users tu
          WHERE tu.user_id = _user_id
            AND tu.role IN ('owner', 'agency_owner')
            AND (
              c.tenant_id = tu.tenant_id
              OR public.user_has_cross_tenant_agency_access(_user_id, c.agency_id)
            )
        )
      )
      OR (
        public.has_role(_user_id, 'team_manager'::app_role)
        AND public.user_manages_agency(_user_id, c.agency_id)
        AND (
          c.tenant_id = public.get_user_tenant_id(_user_id)
          OR public.user_has_cross_tenant_agency_access(_user_id, c.agency_id)
        )
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public.tenant_users tu
          WHERE tu.user_id = _user_id
            AND tu.role = 'team_manager'
            AND (
              c.tenant_id = tu.tenant_id
              OR public.user_has_cross_tenant_agency_access(_user_id, c.agency_id)
            )
        )
        AND public.user_manages_agency(_user_id, c.agency_id)
      )
      OR (
        public.has_role(_user_id, 'sales_person'::app_role)
        AND c.agency_id = ANY(COALESCE(public.get_user_sales_person_agency_ids(_user_id), ARRAY[]::uuid[]))
      )
      OR (
        public.has_role(_user_id, 'campaigner'::app_role)
        AND c.id = ANY(COALESCE(public.get_user_client_ids(_user_id), ARRAY[]::uuid[]))
      )
      OR (
        public.user_has_seo_scope(_user_id)
        AND (
          c.is_seo_client = true
          OR c.services @> '["seo"]'::jsonb
        )
        AND (
          c.tenant_id = public.get_user_tenant_id(_user_id)
          OR public.user_has_cross_tenant_agency_access(_user_id, c.agency_id)
        )
      )
  );
$$;
CREATE OR REPLACE FUNCTION "public"."user_has_integration_access"("p_integration_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    DECLARE v_integration RECORD;
    BEGIN
      SELECT * INTO v_integration FROM tenant_integrations WHERE id = p_integration_id;
      IF NOT FOUND THEN RETURN FALSE; END IF;
      IF v_integration.user_id = auth.uid() THEN RETURN TRUE; END IF;
      IF v_integration.user_id IS NULL OR v_integration.connection_visibility = 'org' THEN
        RETURN EXISTS (SELECT 1 FROM tenant_users WHERE tenant_id = v_integration.tenant_id AND user_id = auth.uid());
      END IF;
      IF v_integration.connection_visibility = 'shared' THEN
        RETURN EXISTS (SELECT 1 FROM integration_user_permissions WHERE integration_id = p_integration_id AND user_id = auth.uid());
      END IF;
      RETURN FALSE;
    END; $$;
CREATE OR REPLACE FUNCTION "public"."user_has_integration_permission"("p_user_id" "uuid", "p_integration_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    DECLARE v_integration RECORD;
    BEGIN
      SELECT * INTO v_integration FROM tenant_integrations WHERE id = p_integration_id;
      IF NOT FOUND THEN RETURN FALSE; END IF;
      IF is_super_admin(p_user_id) THEN RETURN TRUE; END IF;
      IF v_integration.user_id = p_user_id THEN RETURN TRUE; END IF;
      IF v_integration.user_id IS NULL OR v_integration.connection_visibility = 'org' THEN
        RETURN EXISTS (SELECT 1 FROM tenant_users WHERE tenant_id = v_integration.tenant_id AND user_id = p_user_id);
      END IF;
      IF v_integration.connection_visibility = 'shared' THEN
        RETURN EXISTS (SELECT 1 FROM integration_user_permissions WHERE integration_id = p_integration_id AND user_id = p_user_id);
      END IF;
      RETURN FALSE;
    END; $$;

-- 14. Constraints that prod has (keys and checks first, then foreign keys)
ALTER TABLE "public"."social_media_channels" ADD CONSTRAINT "social_media_channels_platform_check" CHECK (("platform" = ANY (ARRAY['facebook'::"text", 'instagram'::"text", 'linkedin'::"text", 'youtube'::"text"])));
ALTER TABLE "public"."social_media_post_channels" ADD CONSTRAINT "social_media_post_channels_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'publishing'::"text", 'published'::"text", 'failed'::"text"])));
ALTER TABLE "public"."social_media_posts" ADD CONSTRAINT "social_media_posts_post_type_check" CHECK (("post_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'video'::"text", 'carousel'::"text", 'story'::"text", 'reel'::"text"])));
ALTER TABLE "public"."social_media_posts" ADD CONSTRAINT "social_media_posts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'publishing'::"text", 'published'::"text", 'failed'::"text", 'cancelled'::"text"])));
ALTER TABLE ONLY "public"."manually_read_contacts"
    ADD CONSTRAINT "manually_read_contacts_user_id_client_id_key" UNIQUE ("user_id", "client_id");
ALTER TABLE ONLY "public"."seo_call_snapshots"
    ADD CONSTRAINT "seo_call_snapshots_unique_period" UNIQUE ("tenant_id", "client_id", "category", "period_start", "period_end");
ALTER TABLE ONLY "public"."social_media_post_channels"
    ADD CONSTRAINT "social_media_post_channels_post_id_channel_id_key" UNIQUE ("post_id", "channel_id");
ALTER TABLE "public"."crm_dashboards" ADD CONSTRAINT "crm_dashboards_type_check" CHECK (("dashboard_type" = ANY (ARRAY['client'::"text", 'agency'::"text"])));
ALTER TABLE ONLY "public"."carmen_batch_deliveries"
    ADD CONSTRAINT "carmen_batch_deliveries_pkey" PRIMARY KEY ("batch_id");
ALTER TABLE ONLY "public"."pbn_service_commands"
    ADD CONSTRAINT "pbn_service_commands_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."pbn_service_commands"
    ADD CONSTRAINT "pbn_service_commands_token_hash_key" UNIQUE ("token_hash");
ALTER TABLE ONLY "public"."task_notification_deliveries"
    ADD CONSTRAINT "task_notification_deliveries_pkey" PRIMARY KEY ("task_id", "notification_type", "recipient_key");
ALTER TABLE ONLY "public"."wa_group_members"
    ADD CONSTRAINT "wa_group_members_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."wa_group_members"
    ADD CONSTRAINT "wa_group_members_tenant_id_group_chat_id_phone_key" UNIQUE ("tenant_id", "group_chat_id", "phone");
ALTER TABLE ONLY "public"."cursor_dispatches"
    ADD CONSTRAINT "cursor_dispatches_human_task_id_fkey" FOREIGN KEY ("human_task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."marketing_pipeline_stages"
    ADD CONSTRAINT "marketing_pipeline_stages_agent_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."marketing_pipeline_stages"
    ADD CONSTRAINT "marketing_pipeline_stages_pipeline_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."marketing_pipelines"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."social_media_posts"
    ADD CONSTRAINT "social_media_posts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");
ALTER TABLE ONLY "public"."social_pages_shared_tenants"
    ADD CONSTRAINT "social_pages_shared_tenants_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "auth"."users"("id");
ALTER TABLE ONLY "public"."wordpress_sites_shared_tenants"
    ADD CONSTRAINT "wordpress_sites_shared_tenants_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "auth"."users"("id");
ALTER TABLE ONLY "public"."task_notification_deliveries"
    ADD CONSTRAINT "task_notification_deliveries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;

-- 15. Indexes that prod has
CREATE UNIQUE INDEX "ai_memory_uq_user_tenant_cat_key" ON "public"."ai_memory" USING "btree" ("user_id", "tenant_id", "category", "key") NULLS NOT DISTINCT;
CREATE UNIQUE INDEX "chat_contact_tags_target_unique" ON "public"."chat_contact_tags" USING "btree" ("tag_id", "user_id", "client_id", "lead_id", "group_id", "sender_phone") NULLS NOT DISTINCT;
CREATE INDEX "idx_automation_executions_lookup" ON "public"."automation_executions" USING "btree" ("execution_id", "entity_id", "trigger_type");
CREATE INDEX "idx_automation_executions_tenant" ON "public"."automation_executions" USING "btree" ("tenant_id", "started_at");
CREATE INDEX "idx_carmen_batch_deliveries_tenant_chat" ON "public"."carmen_batch_deliveries" USING "btree" ("tenant_id", "chat_id", "status");
CREATE INDEX "idx_carmen_sessions_last_message" ON "public"."carmen_whatsapp_sessions" USING "btree" ("last_message_at");
CREATE INDEX "idx_carmen_sessions_lookup" ON "public"."carmen_whatsapp_sessions" USING "btree" ("tenant_id", "chat_id", "status");
CREATE INDEX "idx_chat_messages_unlinked_thread" ON "public"."chat_messages" USING "btree" ("connection_user_id", "tenant_id", "sender_phone", "created_at" DESC) WHERE (("client_id" IS NULL) AND ("lead_id" IS NULL) AND ("group_id" IS NULL) AND ("is_blocked" = false));
CREATE INDEX "idx_client_updates_client_type" ON "public"."client_updates" USING "btree" ("client_id", "update_type");
CREATE INDEX "idx_client_updates_update_type" ON "public"."client_updates" USING "btree" ("update_type");
CREATE INDEX "idx_cursor_dispatches_human_task" ON "public"."cursor_dispatches" USING "btree" ("human_task_id") WHERE ("human_task_id" IS NOT NULL);
CREATE INDEX "idx_job_queue_locked" ON "public"."job_queue" USING "btree" ("locked_until") WHERE ("status" = 'running'::"public"."job_status");
CREATE INDEX "idx_job_queue_status_priority" ON "public"."job_queue" USING "btree" ("status", "priority", "created_at") WHERE ("status" = 'queued'::"public"."job_status");
CREATE INDEX "idx_job_queue_tenant" ON "public"."job_queue" USING "btree" ("tenant_id", "status");
CREATE INDEX "idx_processed_events_cleanup" ON "public"."processed_events" USING "btree" ("processed_at");
CREATE INDEX "idx_social_media_channels_tenant" ON "public"."social_media_channels" USING "btree" ("tenant_id");
CREATE INDEX "idx_social_media_post_channels_post" ON "public"."social_media_post_channels" USING "btree" ("post_id");
CREATE INDEX "idx_social_media_posts_scheduled" ON "public"."social_media_posts" USING "btree" ("scheduled_at") WHERE ("status" = 'scheduled'::"text");
CREATE INDEX "idx_social_media_posts_status" ON "public"."social_media_posts" USING "btree" ("status");
CREATE INDEX "idx_social_media_posts_tenant" ON "public"."social_media_posts" USING "btree" ("tenant_id");
CREATE INDEX "idx_social_media_wordpress_sites_tenant" ON "public"."social_media_wordpress_sites" USING "btree" ("tenant_id");
CREATE INDEX "idx_spst_page" ON "public"."social_pages_shared_tenants" USING "btree" ("social_page_id");
CREATE INDEX "idx_spst_tenant" ON "public"."social_pages_shared_tenants" USING "btree" ("tenant_id");
CREATE INDEX "idx_task_notification_deliveries_delivered_at" ON "public"."task_notification_deliveries" USING "btree" ("delivered_at" DESC);
CREATE INDEX "idx_wsst_site" ON "public"."wordpress_sites_shared_tenants" USING "btree" ("site_id");
CREATE INDEX "idx_wsst_tenant" ON "public"."wordpress_sites_shared_tenants" USING "btree" ("tenant_id");
CREATE UNIQUE INDEX "integration_health_tenant_provider_unique" ON "public"."integration_health" USING "btree" ("tenant_id", "provider");
CREATE INDEX "pbn_service_commands_active_idx" ON "public"."pbn_service_commands" USING "btree" ("token_hash", "tenant_id", "scope") WHERE ("used_at" IS NULL);
CREATE UNIQUE INDEX "processed_events_event_key_unique" ON "public"."processed_events" USING "btree" ("event_key");
CREATE INDEX "wa_group_members_tenant_group_phone" ON "public"."wa_group_members" USING "btree" ("tenant_id", "group_chat_id", "phone");
CREATE INDEX "wa_group_members_tenant_phone" ON "public"."wa_group_members" USING "btree" ("tenant_id", "phone");
CREATE INDEX "idx_woo_sync_log_site" ON "public"."woocommerce_sync_log" USING "btree" ("site_id", "started_at" DESC);

-- 16. Triggers that prod has
CREATE OR REPLACE TRIGGER "on_tenant_created_pipeline_stages" AFTER INSERT ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_tenant_pipeline_stages"();
CREATE OR REPLACE TRIGGER "trg_log_client_mood_status_change" AFTER UPDATE OF "mood_status" ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."log_client_mood_status_change"();
CREATE OR REPLACE TRIGGER "trg_propagate_whatsapp_group_invite_link" AFTER INSERT OR UPDATE OF "invite_link" ON "public"."whatsapp_groups" FOR EACH ROW WHEN ((("new"."invite_link" IS NOT NULL) AND ("btrim"("new"."invite_link") <> ''::"text"))) EXECUTE FUNCTION "public"."propagate_whatsapp_group_invite_link"();
CREATE OR REPLACE TRIGGER "trg_user_active_tenant_updated_at" BEFORE UPDATE ON "public"."user_active_tenant" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "trg_notify_task_notification_worker" BEFORE INSERT OR UPDATE OF "campaigner_id", "sales_person_id", "status", "priority", "due_date", "due_time", "self_reminder_at" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."notify_task_notification_worker"();

-- 17. Row level security on the new tables
ALTER TABLE "public"."automation_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."carmen_batch_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integration_health" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."job_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pbn_service_commands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."processed_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."task_notification_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenant_rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."wa_group_members" ENABLE ROW LEVEL SECURITY;

-- 18. Policies that prod has
CREATE POLICY "Authenticated users can view global_settings" ON "public"."global_settings" FOR SELECT USING (true);
CREATE POLICY "Campaigners view assigned clients" ON "public"."clients" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("id" = ANY ("public"."get_user_client_ids"("auth"."uid"())))));
CREATE POLICY "Campaigners view maskyoo_numbers" ON "public"."maskyoo_numbers" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "maskyoo_numbers"."tenant_id") AND (("ur"."role")::"text" = ANY (ARRAY['owner'::"text", 'team_manager'::"text"]))))) OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'seo'::"public"."app_role"))));
CREATE POLICY "Campaigners view seo_call_snapshots for their clients" ON "public"."seo_call_snapshots" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "seo_call_snapshots"."tenant_id") AND (("ur"."role")::"text" = ANY (ARRAY['owner'::"text", 'team_manager'::"text"]))))) OR (("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'seo'::"public"."app_role")) AND ("client_id" = ANY ("public"."get_user_client_ids"("auth"."uid"()))))));
CREATE POLICY "Owners view all clients in tenant" ON "public"."clients" FOR SELECT USING ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) AND "public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role")));
CREATE POLICY "SEO users view tenant and shared agencies" ON "public"."agencies" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'seo'::"public"."app_role") AND (("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "id"))));
CREATE POLICY "Sales people can view clients from their agencies" ON "public"."clients" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) AND ("agency_id" = ANY ("public"."get_user_sales_person_agency_ids"("auth"."uid"()))))));
CREATE POLICY "Shared-agency cross-tenant client view" ON "public"."clients" FOR SELECT USING (((NOT "public"."user_is_restricted_client_viewer"("auth"."uid"())) AND ("agency_id" IS NOT NULL) AND "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id")));
CREATE POLICY "Shared-agency cross-tenant client_team view" ON "public"."client_team" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_team"."client_id") AND ("c"."agency_id" IS NOT NULL) AND (NOT "public"."user_is_restricted_client_viewer"("auth"."uid"())) AND "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "c"."agency_id")))));
CREATE POLICY "Shared-agency cross-tenant task view" ON "public"."tasks" FOR SELECT USING (((NOT "public"."user_is_restricted_client_viewer"("auth"."uid"())) AND ("agency_id" IS NOT NULL) AND "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id")));
CREATE POLICY "Super admins can view clients with permission" ON "public"."clients" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) AND (( SELECT "tenants"."allow_super_admin_access"
   FROM "public"."tenants"
  WHERE ("tenants"."id" = "clients"."tenant_id")) = true)));
CREATE POLICY "Super admins view clients with permission" ON "public"."clients" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) AND (( SELECT "tenants"."allow_super_admin_access"
   FROM "public"."tenants"
  WHERE ("tenants"."id" = "clients"."tenant_id")) = true)));
CREATE POLICY "Super admins view leads with permission" ON "public"."leads" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) AND (( SELECT "tenants"."allow_super_admin_access"
   FROM "public"."tenants"
  WHERE ("tenants"."id" = "leads"."tenant_id")) = true)));
CREATE POLICY "System can insert automation logs" ON "public"."automation_logs" FOR INSERT WITH CHECK (true);
CREATE POLICY "Team managers view clients from managed agencies" ON "public"."clients" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") AND "public"."user_manages_agency"("auth"."uid"(), "agency_id") AND (("tenant_id" = "public"."get_effective_tenant_id"()) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id"))));
CREATE POLICY "Tenant isolation for social_media_channels" ON "public"."social_media_channels" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));
CREATE POLICY "Tenant isolation for social_media_post_channels" ON "public"."social_media_post_channels" USING (("post_id" IN ( SELECT "social_media_posts"."id"
   FROM "public"."social_media_posts"
  WHERE ("social_media_posts"."tenant_id" IN ( SELECT "tenant_users"."tenant_id"
           FROM "public"."tenant_users"
          WHERE ("tenant_users"."user_id" = "auth"."uid"()))))));
CREATE POLICY "Tenant isolation for social_media_posts" ON "public"."social_media_posts" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));
CREATE POLICY "Tenant isolation for social_media_wordpress_sites" ON "public"."social_media_wordpress_sites" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));
CREATE POLICY "Tenant managers manage ahrefs_reports" ON "public"."ahrefs_reports" TO "authenticated" USING (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "ahrefs_reports"."tenant_id") AND (("ur"."role")::"text" = ANY (ARRAY['owner'::"text", 'team_manager'::"text"]))))))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "ahrefs_reports"."tenant_id") AND (("ur"."role")::"text" = ANY (ARRAY['owner'::"text", 'team_manager'::"text"])))))));
CREATE POLICY "Tenant managers manage maskyoo_numbers" ON "public"."maskyoo_numbers" USING (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "maskyoo_numbers"."tenant_id") AND (("ur"."role")::"text" = ANY (ARRAY['owner'::"text", 'team_manager'::"text"]))))))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "maskyoo_numbers"."tenant_id") AND (("ur"."role")::"text" = ANY (ARRAY['owner'::"text", 'team_manager'::"text"])))))));
CREATE POLICY "Tenant managers manage maskyoo_settings" ON "public"."maskyoo_settings" USING (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "maskyoo_settings"."tenant_id") AND (("ur"."role")::"text" = ANY (ARRAY['owner'::"text", 'team_manager'::"text"]))))))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "maskyoo_settings"."tenant_id") AND (("ur"."role")::"text" = ANY (ARRAY['owner'::"text", 'team_manager'::"text"])))))));
CREATE POLICY "Tenant managers manage seo_call_snapshots" ON "public"."seo_call_snapshots" USING (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "seo_call_snapshots"."tenant_id") AND (("ur"."role")::"text" = ANY (ARRAY['owner'::"text", 'team_manager'::"text"]))))))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "seo_call_snapshots"."tenant_id") AND (("ur"."role")::"text" = ANY (ARRAY['owner'::"text", 'team_manager'::"text"])))))));
CREATE POLICY "Tenant members read call_logs" ON "public"."call_logs" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."tenant_users" "tu"
  WHERE (("tu"."user_id" = "auth"."uid"()) AND ("tu"."tenant_id" = "call_logs"."tenant_id"))))));
CREATE POLICY "Tenant members view ahrefs_reports" ON "public"."ahrefs_reports" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "ahrefs_reports"."tenant_id") AND ("ur"."role" = ANY (ARRAY['owner'::"public"."app_role", 'team_manager'::"public"."app_role"]))))) OR (("agency_id" IS NOT NULL) AND "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id")) OR (("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'seo'::"public"."app_role")) AND ("client_id" IS NOT NULL) AND ("client_id" = ANY ("public"."get_user_client_ids"("auth"."uid"()))))));
CREATE POLICY "Users can update chat_messages in their tenant" ON "public"."chat_messages" FOR UPDATE USING ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can view tables in their tenant scope" ON "public"."crm_tables" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) AND (("agency_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."agencies" "a"
  WHERE (("a"."id" = "crm_tables"."agency_id") AND ("a"."tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())))))))));
CREATE POLICY "Users can view tasks for their leads" ON "public"."tasks" FOR SELECT USING ((("lead_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."leads" "l"
  WHERE (("l"."id" = "tasks"."lead_id") AND (("l"."tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())))))));
CREATE POLICY "Users can view tasks from accessible agencies" ON "public"."tasks" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND "public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role")) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") AND "public"."user_manages_agency"("auth"."uid"(), "agency_id")) OR ("public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") AND "public"."user_manages_agency"("auth"."uid"(), "agency_id") AND "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id")) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND "public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("campaigner_id" = "public"."get_user_campaigner_id"("auth"."uid"())))));
CREATE POLICY "Users can view their own integrations" ON "public"."tenant_integrations" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can view their permissions" ON "public"."integration_user_permissions" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."tenant_integrations" "ti"
  WHERE (("ti"."id" = "integration_user_permissions"."integration_id") AND ("ti"."user_id" = "auth"."uid"()))))));
CREATE POLICY "Users manage own active tenant" ON "public"."user_active_tenant" USING ((("auth"."uid"() = "user_id") OR "public"."is_super_admin"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users read own active tenant" ON "public"."user_active_tenant" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "campaign_alerts_delete" ON "public"."campaign_alerts" FOR DELETE USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role")))));
CREATE POLICY "campaign_alerts_select" ON "public"."campaign_alerts" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("client_id" IS NOT NULL) AND ("client_id" = ANY ("public"."get_user_client_ids"("auth"."uid"()))))))));
CREATE POLICY "campaign_alerts_update" ON "public"."campaign_alerts" FOR UPDATE USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("client_id" IS NOT NULL) AND ("client_id" = ANY ("public"."get_user_client_ids"("auth"."uid"())))))))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("client_id" IS NOT NULL) AND ("client_id" = ANY ("public"."get_user_client_ids"("auth"."uid"()))))))));
CREATE POLICY "campaign_alerts_write" ON "public"."campaign_alerts" FOR INSERT WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role")))));
CREATE POLICY "campaign_schedules_delete" ON "public"."campaign_schedules" FOR DELETE USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role")))));
CREATE POLICY "campaign_schedules_select" ON "public"."campaign_schedules" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("client_id" IS NOT NULL) AND ("client_id" = ANY ("public"."get_user_client_ids"("auth"."uid"()))))))));
CREATE POLICY "campaign_schedules_update" ON "public"."campaign_schedules" FOR UPDATE USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("client_id" IS NOT NULL) AND ("client_id" = ANY ("public"."get_user_client_ids"("auth"."uid"())))))))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("client_id" IS NOT NULL) AND ("client_id" = ANY ("public"."get_user_client_ids"("auth"."uid"()))))))));
CREATE POLICY "campaign_schedules_write" ON "public"."campaign_schedules" FOR INSERT WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role")))));
CREATE POLICY "delete_social_gantt" ON "public"."social_gantt_posts" FOR DELETE USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));
CREATE POLICY "insert_social_gantt" ON "public"."social_gantt_posts" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));
CREATE POLICY "report_alerts_delete" ON "public"."report_alerts" FOR DELETE USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role")))));
CREATE POLICY "report_alerts_select" ON "public"."report_alerts" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR ("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"())))));
CREATE POLICY "report_alerts_update" ON "public"."report_alerts" FOR UPDATE USING (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role"))))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role")))));
CREATE POLICY "report_alerts_write" ON "public"."report_alerts" FOR INSERT WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR (("tenant_id" = "public"."get_effective_tenant_id"()) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role")))));
CREATE POLICY "select_social_gantt" ON "public"."social_gantt_posts" FOR SELECT USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));
CREATE POLICY "tenant_members_manage_spst" ON "public"."social_pages_shared_tenants" TO "authenticated" USING ((("tenant_id" IN ( SELECT "tu"."tenant_id"
   FROM "public"."tenant_users" "tu"
  WHERE ("tu"."user_id" = "auth"."uid"()))) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "tenant_members_manage_wsst" ON "public"."wordpress_sites_shared_tenants" TO "authenticated" USING ((("tenant_id" IN ( SELECT "tu"."tenant_id"
   FROM "public"."tenant_users" "tu"
  WHERE ("tu"."user_id" = "auth"."uid"()))) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "tenant_members_view_integrations" ON "public"."tenant_integrations" FOR SELECT TO "authenticated" USING ((("tenant_id" IN ( SELECT "tu"."tenant_id"
   FROM "public"."tenant_users" "tu"
  WHERE ("tu"."user_id" = "auth"."uid"()))) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "update_social_gantt" ON "public"."social_gantt_posts" FOR UPDATE USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));
CREATE POLICY "wa_group_members_service" ON "public"."wa_group_members" TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "wa_group_members_tenant" ON "public"."wa_group_members" USING (("tenant_id" = ( SELECT (("auth"."jwt"() ->> 'tenant_id'::"text"))::"uuid" AS "uuid")));
CREATE POLICY "Anyone can read team chat files" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'team-chat-files'::"text"));
CREATE POLICY "Anyone can view supplier invoices" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'supplier-invoices'::"text"));
CREATE POLICY "Anyone can view team attachments" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'team-attachments'::"text"));
CREATE POLICY "Users read own command center files" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'command-center-files'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
CREATE POLICY "Users upload own command center files" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'command-center-files'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
CREATE POLICY "Integration owners can manage permissions" ON "public"."integration_user_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."tenant_integrations" "ti"
  WHERE (("ti"."id" = "integration_user_permissions"."integration_id") AND (("ti"."user_id" = "auth"."uid"()) OR ("ti"."tenant_id" = "public"."get_user_tenant_id"("auth"."uid"()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tenant_integrations" "ti"
  WHERE (("ti"."id" = "integration_user_permissions"."integration_id") AND (("ti"."user_id" = "auth"."uid"()) OR ("ti"."tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())))))));
CREATE POLICY "Owners view all leads in tenant" ON "public"."leads" FOR SELECT USING ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) AND "public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role")));
CREATE POLICY "SEO users view SEO-tagged clients" ON "public"."clients" FOR SELECT TO "authenticated" USING (("public"."user_has_seo_scope"("auth"."uid"()) AND (("is_seo_client" = true) OR ("services" @> '["seo"]'::"jsonb")) AND (("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id"))));
CREATE POLICY "Service role can update invitation tokens" ON "public"."invitation_tokens" FOR UPDATE USING (true);
CREATE POLICY "Super admins can manage leads with permission" ON "public"."leads" USING (("public"."is_super_admin"("auth"."uid"()) AND (( SELECT "tenants"."allow_super_admin_access"
   FROM "public"."tenants"
  WHERE ("tenants"."id" = "leads"."tenant_id")) = true))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) AND (( SELECT "tenants"."allow_super_admin_access"
   FROM "public"."tenants"
  WHERE ("tenants"."id" = "leads"."tenant_id")) = true)));
CREATE POLICY "Super admins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_super_admin"("auth"."uid"()));
CREATE POLICY "Super admins can view leads with permission" ON "public"."leads" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) AND (( SELECT "tenants"."allow_super_admin_access"
   FROM "public"."tenants"
  WHERE ("tenants"."id" = "leads"."tenant_id")) = true)));
CREATE POLICY "Team managers view leads from managed agencies" ON "public"."leads" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") AND ("agency_id" IS NOT NULL) AND "public"."user_manages_agency"("auth"."uid"(), "agency_id") AND (("tenant_id" = "public"."get_effective_tenant_id"()) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id"))));
CREATE POLICY "Users can create tasks in accessible agencies" ON "public"."tasks" FOR INSERT WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "tasks"."tenant_id") AND ("ur"."role" = ANY (ARRAY['owner'::"public"."app_role", 'team_manager'::"public"."app_role", 'campaigner'::"public"."app_role"]))))) AND (("agency_id" IN ( SELECT "agencies"."id"
   FROM "public"."agencies"
  WHERE ("agencies"."tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())))) OR ("agency_id" IN ( SELECT "ata"."agency_id"
   FROM "public"."agency_tenant_access" "ata"
  WHERE ("ata"."accessing_tenant_id" = "public"."get_user_tenant_id"("auth"."uid"()))))))));
CREATE POLICY "Users can delete client_suppliers in their tenant" ON "public"."client_suppliers" FOR DELETE TO "authenticated" USING ((("public"."get_client_tenant_id"("client_id") = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can delete client_team in their tenant" ON "public"."client_team" FOR DELETE TO "authenticated" USING ((("public"."get_client_tenant_id"("client_id") = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can delete tasks in accessible agencies" ON "public"."tasks" FOR DELETE USING (("public"."is_super_admin"("auth"."uid"()) OR ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "tasks"."tenant_id") AND ("ur"."role" = ANY (ARRAY['owner'::"public"."app_role", 'team_manager'::"public"."app_role"]))))) AND (("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR ("agency_id" IN ( SELECT "ata"."agency_id"
   FROM "public"."agency_tenant_access" "ata"
  WHERE ("ata"."accessing_tenant_id" = "public"."get_user_tenant_id"("auth"."uid"()))))))));
CREATE POLICY "Users can insert client_suppliers in their tenant" ON "public"."client_suppliers" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_client_tenant_id"("client_id") = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can insert client_team in their tenant" ON "public"."client_team" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_client_tenant_id"("client_id") = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can manage client_onboarding in their tenant" ON "public"."client_onboarding" TO "authenticated" USING ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"()))) WITH CHECK ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can update client_suppliers in their tenant" ON "public"."client_suppliers" FOR UPDATE TO "authenticated" USING ((("public"."get_client_tenant_id"("client_id") = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can update client_team in their tenant" ON "public"."client_team" FOR UPDATE TO "authenticated" USING ((("public"."get_client_tenant_id"("client_id") = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can update clients in their or shared tenants" ON "public"."clients" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"("auth"."uid"()) OR ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id")) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'sales_person'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("id" = ANY ("public"."get_user_client_ids"("auth"."uid"())))) OR ("public"."has_role"("auth"."uid"(), 'seo'::"public"."app_role") AND (("is_seo_client" = true) OR ("services" @> '["seo"]'::"jsonb"))))))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id")) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'sales_person'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("id" = ANY ("public"."get_user_client_ids"("auth"."uid"())))) OR ("public"."has_role"("auth"."uid"(), 'seo'::"public"."app_role") AND (("is_seo_client" = true) OR ("services" @> '["seo"]'::"jsonb")))))));
CREATE POLICY "Users can update financial data in their tenant" ON "public"."client_tenant_financial_data" FOR UPDATE USING ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can update tasks in accessible agencies" ON "public"."tasks" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"("auth"."uid"()) OR ((("tenant_id" = "public"."get_effective_tenant_id"()) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id")) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'sales_person'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("campaigner_id" = "public"."get_user_campaigner_id"("auth"."uid"()))))))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR ((("tenant_id" = "public"."get_effective_tenant_id"()) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id")) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'sales_person'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") AND ("campaigner_id" = "public"."get_user_campaigner_id"("auth"."uid"())))))));
CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));
CREATE POLICY "Users can view client updates in their tenant" ON "public"."client_updates" FOR SELECT USING ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can view client_suppliers in their tenant" ON "public"."client_suppliers" FOR SELECT TO "authenticated" USING ((("public"."get_client_tenant_id"("client_id") = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can view client_team in their tenant" ON "public"."client_team" FOR SELECT TO "authenticated" USING ((("public"."get_client_tenant_id"("client_id") = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can view financial data in their tenant" ON "public"."client_tenant_financial_data" FOR SELECT USING ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."is_super_admin"("auth"."uid"())));
CREATE POLICY "Users can view profiles in their tenant" ON "public"."profiles" FOR SELECT USING (("id" IN ( SELECT "tu1"."user_id"
   FROM "public"."tenant_users" "tu1"
  WHERE ("tu1"."tenant_id" IN ( SELECT "tu2"."tenant_id"
           FROM "public"."tenant_users" "tu2"
          WHERE ("tu2"."user_id" = "auth"."uid"()))))));
CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));
CREATE POLICY "tenant_isolation" ON "public"."woocommerce_customers" USING (("tenant_id" = "public"."get_effective_tenant_id"()));
CREATE POLICY "tenant_isolation" ON "public"."woocommerce_orders" USING (("tenant_id" = "public"."get_effective_tenant_id"()));
CREATE POLICY "tenant_isolation" ON "public"."woocommerce_products" USING (("tenant_id" = "public"."get_effective_tenant_id"()));
CREATE POLICY "tenant_isolation" ON "public"."woocommerce_sync_log" USING (("tenant_id" = "public"."get_effective_tenant_id"()));

-- 19. Comments: prod's text, or none
COMMENT ON COLUMN "public"."campaign_pulse_snapshots"."lead_spend_7d" IS NULL;
COMMENT ON COLUMN "public"."campaign_pulse_snapshots"."roas_change_pct" IS NULL;
COMMENT ON COLUMN "public"."clients"."follow_up_campaigner_notified_at" IS NULL;
COMMENT ON TABLE "public"."goal_brain_requests" IS 'Async orchestration requests sent to Cursor Direct; completed via goal-brain-callback.';
COMMENT ON COLUMN "public"."agent_tasks"."task_skills" IS NULL;
COMMENT ON COLUMN "public"."leads"."status" IS 'Pipeline stage (שלב במשפך)';
COMMENT ON COLUMN "public"."clients"."meta_ads_account_id" IS NULL;
COMMENT ON COLUMN "public"."tasks"."target_date" IS 'Deadline by which the task should be completed. due_date/due_time schedule execution on the calendar.';
COMMENT ON COLUMN "public"."campaign_pulse_snapshots"."ecommerce_goal_status" IS NULL;
COMMENT ON COLUMN "public"."ai_agents"."response_length" IS NULL;
COMMENT ON COLUMN "public"."agent_tasks"."enabled" IS NULL;
COMMENT ON COLUMN "public"."campaign_pulse_snapshots"."last_client_call_at" IS 'Timestamp of the latest client_updates row whose update_type is call.';
COMMENT ON COLUMN "public"."agent_tasks"."schedule_type" IS NULL;
COMMENT ON COLUMN "public"."agent_tasks"."parallel_execution" IS NULL;
COMMENT ON COLUMN "public"."woocommerce_orders"."attribution" IS NULL;
COMMENT ON COLUMN "public"."clients"."follow_up_manager_notified_at" IS NULL;
COMMENT ON COLUMN "public"."clients"."follow_up_date" IS NULL;
COMMENT ON TABLE "public"."goal_orchestrator_brain" IS 'Sticky Cursor Direct session (bc-…) used as the autonomous goal engine orchestration brain per tenant.';
COMMENT ON COLUMN "public"."campaign_pulse_snapshots"."campaign_goal_mode" IS NULL;
COMMENT ON COLUMN "public"."agent_tasks"."task_mode" IS NULL;
COMMENT ON COLUMN "public"."clients"."google_ads_account_id" IS NULL;
COMMENT ON COLUMN "public"."goals"."cursor_session_url" IS 'https://cursor.com/agents/bc-… for the goal sticky session.';
COMMENT ON COLUMN "public"."ai_agents"."active_skills" IS NULL;
COMMENT ON COLUMN "public"."ai_agents"."language" IS NULL;
COMMENT ON COLUMN "public"."campaign_pulse_snapshots"."ecommerce_spend_7d" IS NULL;
COMMENT ON COLUMN "public"."agent_tasks"."run_count" IS NULL;
COMMENT ON COLUMN "public"."agent_tasks"."last_run" IS NULL;
COMMENT ON COLUMN "public"."agent_tasks"."cron_expression" IS NULL;
COMMENT ON COLUMN "public"."campaign_pulse_snapshots"."lead_goal_status" IS NULL;
COMMENT ON COLUMN "public"."social_media_wordpress_sites"."campaign_form_mapping" IS NULL;
COMMENT ON TABLE "public"."carmen_batch_deliveries" IS 'Delivery routing/status for delegate_parallel batches, so run-agent-task can auto-send one synthesized report to the originating WhatsApp chat when every subtask in the batch completes, instead of relying on Carmen recalling the batch_id across conversation turns.';
COMMENT ON COLUMN "public"."ai_agents"."writing_style" IS NULL;
COMMENT ON COLUMN "public"."goal_plan_steps"."cursor_agent_id" IS 'Sticky Cursor agent (bc-…) dedicated to this sub-project track.';
COMMENT ON COLUMN "public"."leads"."response_status" IS 'Lead response status (סטטוס תגובה)';
COMMENT ON COLUMN "public"."goal_plan_steps"."parallel_track" IS 'When true, this cursor step runs in parallel with other parallel_track steps on the same goal.';
COMMENT ON TABLE "public"."seo_monthly_shares" IS 'Public slideshow shares for SEO monthly work reports. snapshot is refreshed live from seo_monthly_updates on each public open.';
COMMENT ON COLUMN "public"."goals"."cursor_agent_id" IS 'Sticky Cursor Cloud Agent (bc-…) for this goal. All technical work on the goal follows up here.';
COMMENT ON COLUMN "public"."agent_tasks"."parallel_subtasks" IS NULL;
COMMENT ON COLUMN "public"."social_media_wordpress_sites"."campaign_url_mapping" IS NULL;
COMMENT ON COLUMN "public"."agent_tasks"."scheduled_at" IS NULL;
COMMENT ON COLUMN "public"."goal_plan_steps"."sub_project_key" IS 'Stable id for a sub-project track (e.g. creative, copy, seo) — owns its own Cursor agent.';
COMMENT ON COLUMN "public"."clients"."is_ecommerce" IS NULL;
COMMENT ON COLUMN "public"."ai_agents"."active_modes" IS NULL;
COMMENT ON COLUMN "public"."campaign_pulse_snapshots"."last_client_call_by" IS 'Display name or email of the user who recorded the latest client call update.';
COMMENT ON FUNCTION "public"."user_can_annotate_lead"("_lead_id" "uuid") IS 'Whether the current user may view/create lead_updates for this lead';
COMMENT ON COLUMN "public"."agent_tasks"."is_dangerous" IS 'TRUE = mutating/side-effecting -> serial lane; FALSE = read-only -> parallel lane.';

-- 20. Grants: match prod
-- New objects first lose the grants Supabase adds by default, then get exactly prod's.
REVOKE ALL ON TABLE "public"."automation_executions" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."carmen_batch_deliveries" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."integration_health" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."job_queue" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."pbn_service_commands" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."processed_events" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."task_notification_deliveries" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tenant_rate_limits" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."wa_group_members" FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."check_circuit_breaker"("p_tenant_id" "uuid", "p_provider" "text") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."check_circuit_breaker"("p_tenant_id" "uuid", "p_provider" "text") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."check_idempotency"("p_tenant_id" "uuid", "p_event_key" "text") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."check_idempotency"("p_tenant_id" "uuid", "p_event_key" "text") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text", "p_default_max" integer) FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text", "p_default_max" integer) TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."claim_next_job"("p_job_types" "text"[]) FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."claim_next_job"("p_job_types" "text"[]) TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."cleanup_old_events"() FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."cleanup_old_events"() TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."cleanup_old_jobs"() FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."cleanup_old_jobs"() TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."client_update_documents_phone_call"("p_content" "text") FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."complete_job"("p_job_id" "uuid", "p_success" boolean, "p_error" "text") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."complete_job"("p_job_id" "uuid", "p_success" boolean, "p_error" "text") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."enqueue_job"("p_tenant_id" "uuid", "p_job_type" "text", "p_priority" integer, "p_payload" "jsonb", "p_max_attempts" integer) FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."enqueue_job"("p_tenant_id" "uuid", "p_job_type" "text", "p_priority" integer, "p_payload" "jsonb", "p_max_attempts" integer) TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."format_client_mood_status_label"("status" "public"."client_mood_status") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."format_client_mood_status_label"("status" "public"."client_mood_status") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_chat_contacts"() FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_chat_contacts"() TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_chat_contacts"("p_tenant_id" "uuid") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_chat_contacts"("p_tenant_id" "uuid") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_latest_client_call_updates"("p_client_ids" "uuid"[]) FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."handle_new_tenant_pipeline_stages"() FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."handle_new_tenant_pipeline_stages"() TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."initialize_tenant_pipeline_stages"("_tenant_id" "uuid") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."initialize_tenant_pipeline_stages"("_tenant_id" "uuid") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_root_tenant"("tenant_id" "uuid") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_root_tenant"("tenant_id" "uuid") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."kick_internal_function"("p_function" "text", "p_body" "jsonb") FROM PUBLIC, "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."log_client_mood_status_change"() FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."log_client_mood_status_change"() TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."merge_orphan_profile_by_email"("_auth_user_id" "uuid", "_email" "text") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."merge_orphan_profile_by_email"("_auth_user_id" "uuid", "_email" "text") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."propagate_whatsapp_group_invite_link"() FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."propagate_whatsapp_group_invite_link"() TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."record_integration_failure"("p_tenant_id" "uuid", "p_provider" "text") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_integration_failure"("p_tenant_id" "uuid", "p_provider" "text") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."record_integration_result"("p_tenant_id" "uuid", "p_provider" "text", "p_success" boolean, "p_failure_threshold" integer, "p_cooldown_minutes" integer) FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_integration_result"("p_tenant_id" "uuid", "p_provider" "text", "p_success" boolean, "p_failure_threshold" integer, "p_cooldown_minutes" integer) TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."record_integration_success"("p_tenant_id" "uuid", "p_provider" "text") FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_integration_success"("p_tenant_id" "uuid", "p_provider" "text") TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_channel_invite_by_token"("_token" "text") TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."increment_skill_usage"("skill_ids" "uuid"[]) TO PUBLIC;
GRANT ALL ON FUNCTION "public"."check_circuit_breaker"("p_tenant_id" "uuid", "p_provider" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_circuit_breaker"("p_tenant_id" "uuid", "p_provider" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_circuit_breaker"("p_tenant_id" "uuid", "p_provider" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."check_idempotency"("p_tenant_id" "uuid", "p_event_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_idempotency"("p_tenant_id" "uuid", "p_event_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_idempotency"("p_tenant_id" "uuid", "p_event_key" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text", "p_default_max" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text", "p_default_max" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_tenant_id" "uuid", "p_resource_type" "text", "p_default_max" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."claim_next_job"("p_job_types" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_next_job"("p_job_types" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_next_job"("p_job_types" "text"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."cleanup_old_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_events"() TO "service_role";
GRANT ALL ON FUNCTION "public"."cleanup_old_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_jobs"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."client_update_documents_phone_call"("p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."client_update_documents_phone_call"("p_content" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."complete_job"("p_job_id" "uuid", "p_success" boolean, "p_error" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_job"("p_job_id" "uuid", "p_success" boolean, "p_error" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_job"("p_job_id" "uuid", "p_success" boolean, "p_error" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."enqueue_job"("p_tenant_id" "uuid", "p_job_type" "text", "p_priority" integer, "p_payload" "jsonb", "p_max_attempts" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_job"("p_tenant_id" "uuid", "p_job_type" "text", "p_priority" integer, "p_payload" "jsonb", "p_max_attempts" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_job"("p_tenant_id" "uuid", "p_job_type" "text", "p_priority" integer, "p_payload" "jsonb", "p_max_attempts" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."format_client_mood_status_label"("status" "public"."client_mood_status") TO "anon";
GRANT ALL ON FUNCTION "public"."format_client_mood_status_label"("status" "public"."client_mood_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."format_client_mood_status_label"("status" "public"."client_mood_status") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_chat_contacts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_chat_contacts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_contacts"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_chat_contacts"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_chat_contacts"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_contacts"("p_tenant_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_latest_client_call_updates"("p_client_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_latest_client_call_updates"("p_client_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_tenant_pipeline_stages"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_tenant_pipeline_stages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_tenant_pipeline_stages"() TO "service_role";
GRANT ALL ON FUNCTION "public"."increment_skill_usage"("skill_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_tenant_pipeline_stages"("_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_tenant_pipeline_stages"("_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_tenant_pipeline_stages"("_tenant_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_root_tenant"("tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_root_tenant"("tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_root_tenant"("tenant_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."kick_internal_function"("p_function" "text", "p_body" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kick_internal_function"("p_function" "text", "p_body" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."log_client_mood_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_client_mood_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_client_mood_status_change"() TO "service_role";
GRANT ALL ON FUNCTION "public"."merge_orphan_profile_by_email"("_auth_user_id" "uuid", "_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_orphan_profile_by_email"("_auth_user_id" "uuid", "_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_orphan_profile_by_email"("_auth_user_id" "uuid", "_email" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."propagate_whatsapp_group_invite_link"() TO "anon";
GRANT ALL ON FUNCTION "public"."propagate_whatsapp_group_invite_link"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."propagate_whatsapp_group_invite_link"() TO "service_role";
GRANT ALL ON FUNCTION "public"."record_integration_failure"("p_tenant_id" "uuid", "p_provider" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_integration_failure"("p_tenant_id" "uuid", "p_provider" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_integration_failure"("p_tenant_id" "uuid", "p_provider" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."record_integration_result"("p_tenant_id" "uuid", "p_provider" "text", "p_success" boolean, "p_failure_threshold" integer, "p_cooldown_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."record_integration_result"("p_tenant_id" "uuid", "p_provider" "text", "p_success" boolean, "p_failure_threshold" integer, "p_cooldown_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_integration_result"("p_tenant_id" "uuid", "p_provider" "text", "p_success" boolean, "p_failure_threshold" integer, "p_cooldown_minutes" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."record_integration_success"("p_tenant_id" "uuid", "p_provider" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_integration_success"("p_tenant_id" "uuid", "p_provider" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_integration_success"("p_tenant_id" "uuid", "p_provider" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";
GRANT ALL ON TABLE "public"."automation_executions" TO "anon";
GRANT ALL ON TABLE "public"."automation_executions" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_executions" TO "service_role";
GRANT ALL ON TABLE "public"."carmen_batch_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."carmen_batch_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."carmen_batch_deliveries" TO "service_role";
GRANT ALL ON TABLE "public"."integration_health" TO "anon";
GRANT ALL ON TABLE "public"."integration_health" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_health" TO "service_role";
GRANT ALL ON TABLE "public"."job_queue" TO "anon";
GRANT ALL ON TABLE "public"."job_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."job_queue" TO "service_role";
GRANT ALL ON TABLE "public"."pbn_service_commands" TO "service_role";
GRANT ALL ON TABLE "public"."processed_events" TO "anon";
GRANT ALL ON TABLE "public"."processed_events" TO "authenticated";
GRANT ALL ON TABLE "public"."processed_events" TO "service_role";
GRANT ALL ON TABLE "public"."task_notification_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."task_notification_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."task_notification_deliveries" TO "service_role";
GRANT ALL ON TABLE "public"."tenant_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."tenant_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_rate_limits" TO "service_role";
GRANT ALL ON TABLE "public"."wa_group_members" TO "anon";
GRANT ALL ON TABLE "public"."wa_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."wa_group_members" TO "service_role";

COMMIT;
