-- Catch-up: schema that shipped code on origin/main uses but the production baseline lacks.
-- Definitions come from Staging's schema dump unless noted. Applied to Production after the
-- history repair; Staging gets the same end state through the reconcile.
--
-- Left out on purpose:
-- - RLS policies for the 61 policy-less tables: fixed table by table in AIO-67..75.
-- - clients.trg_notify_client_follow_up_worker and notify_client_follow_up_worker(): they start
--   WhatsApp follow-up reminders, which need David's approval first.
-- - Crons, including the report-delivery and follow-up workers: they belong in a separate
--   cron migration once cron ownership is decided.
-- report_schedules rows default to enabled = false, and nothing drives the report worker yet.

-- Enum values used by the automation builder
ALTER TYPE "public"."automation_action" ADD VALUE IF NOT EXISTS 'send_telegram';
ALTER TYPE "public"."automation_trigger" ADD VALUE IF NOT EXISTS 'telegram_message_received';
ALTER TYPE "public"."automation_trigger" ADD VALUE IF NOT EXISTS 'account_stopped_spending';
ALTER TYPE "public"."automation_trigger" ADD VALUE IF NOT EXISTS 'ad_account_billing_issue';
ALTER TYPE "public"."automation_trigger" ADD VALUE IF NOT EXISTS 'ad_account_blocked';
ALTER TYPE "public"."automation_trigger" ADD VALUE IF NOT EXISTS 'integration_disconnected';

-- Columns on existing tables
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "follow_up_date" "date";
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "follow_up_manager_notified_at" timestamp with time zone;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "follow_up_campaigner_notified_at" timestamp with time zone;
ALTER TABLE "public"."ai_agents" ADD COLUMN IF NOT EXISTS "active_modes" "text"[] DEFAULT '{}'::"text"[];
ALTER TABLE "public"."ai_agents" ADD COLUMN IF NOT EXISTS "active_skills" "text"[] DEFAULT '{}'::"text"[];
ALTER TABLE "public"."social_media_wordpress_sites" ADD COLUMN IF NOT EXISTS "woo_consumer_key" "text";
ALTER TABLE "public"."social_media_wordpress_sites" ADD COLUMN IF NOT EXISTS "woo_consumer_secret" "text";
ALTER TABLE "public"."woocommerce_sync_log" ADD COLUMN IF NOT EXISTS "sync_type" "text" DEFAULT 'full'::"text" NOT NULL;
ALTER TABLE "public"."woocommerce_sync_log" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT "now"() NOT NULL;

-- New tables
CREATE TABLE IF NOT EXISTS "public"."report_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "table_id" "uuid",
    "dashboard_id" "uuid",
    "enabled" boolean DEFAULT false NOT NULL,
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "day_of_week" smallint,
    "day_of_month" smallint,
    "send_time" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Jerusalem'::"text" NOT NULL,
    "channels" "text"[] DEFAULT ARRAY['whatsapp'::"text"] NOT NULL,
    "whatsapp_group_id" "uuid",
    "phone" "text",
    "email_recipients" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "email_subject" "text",
    "message" "text",
    "next_run_at" timestamp with time zone,
    "last_run_at" timestamp with time zone,
    "locked_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "report_schedule_has_channel" CHECK ((("channels" <@ ARRAY['whatsapp'::"text", 'email'::"text"]) AND ("cardinality"("channels") > 0))),
    CONSTRAINT "report_schedule_target_matches" CHECK (((("target_type" = 'table'::"text") AND ("table_id" IS NOT NULL) AND ("dashboard_id" IS NULL)) OR (("target_type" = 'dashboard'::"text") AND ("dashboard_id" IS NOT NULL) AND ("table_id" IS NULL)))),
    CONSTRAINT "report_schedules_day_of_month_check" CHECK ((("day_of_month" >= 1) AND ("day_of_month" <= 28))),
    CONSTRAINT "report_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "report_schedules_frequency_check" CHECK (("frequency" = ANY (ARRAY['weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "report_schedules_target_type_check" CHECK (("target_type" = ANY (ARRAY['table'::"text", 'dashboard'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."report_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid",
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "channels" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "report_deliveries_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'partial'::"text", 'failed'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."seo_geo_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "work_item_id" "uuid" NOT NULL,
    "wordpress_site_id" "uuid",
    "auto_approve" boolean DEFAULT false NOT NULL,
    "horizon_months" integer DEFAULT 3 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seo_geo_programs_horizon_months_check" CHECK ((("horizon_months" >= 1) AND ("horizon_months" <= 12)))
);
CREATE TABLE IF NOT EXISTS "public"."seo_geo_keywords" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "work_item_id" "uuid" NOT NULL,
    "keyword" "text" NOT NULL,
    "intent" "text",
    "priority" "text",
    "source" "text" DEFAULT 'plan'::"text" NOT NULL,
    "promoted" boolean DEFAULT true NOT NULL,
    "evidence" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."seo_geo_calendar_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "work_item_id" "uuid" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "primary_keyword" "text",
    "content_type" "text",
    "cluster" "text",
    "intent" "text",
    "angle" "text",
    "geo_questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "approval_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_by_carmen" boolean DEFAULT false NOT NULL,
    "generation_status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "title_draft" "text",
    "excerpt" "text",
    "content_html" "text",
    "meta_description" "text",
    "live_url" "text",
    "published_at" timestamp with time zone,
    "publish_error" "text",
    "wordpress_post_id" "text",
    "plan_index" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seo_geo_calendar_entries_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'auto_approved'::"text"]))),
    CONSTRAINT "seo_geo_calendar_entries_generation_status_check" CHECK (("generation_status" = ANY (ARRAY['planned'::"text", 'generating'::"text", 'draft'::"text", 'published'::"text", 'failed'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."seo_share_response_cache" (
    "share_token" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."gsc_keyword_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "site_url" "text" NOT NULL,
    "period_key" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "keywords" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "row_count" integer DEFAULT 0 NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gsc_keyword_snapshots_period_key_check" CHECK (("period_key" = ANY (ARRAY['current_90d'::"text", 'prev_month'::"text", 'three_month'::"text", 'yearly'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."grok_dispatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "agent_id" "uuid",
    "tool" "text" NOT NULL,
    "request_text" "text" NOT NULL,
    "context" "text",
    "branch" "text",
    "session_url" "text",
    "cursor_agent_id" "text",
    "status" "text" DEFAULT 'dispatched'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "grok_dispatches_tool_check" CHECK (("tool" = ANY (ARRAY['request_dev_task'::"text", 'ask_grok'::"text"])))
);
COMMENT ON TABLE "public"."grok_dispatches" IS 'Carmen → Grok Bot Cloud Agent dispatches: what Carmen asked, the agent URL, and status.';
CREATE TABLE IF NOT EXISTS "public"."grok_sticky_agents" (
    "tenant_id" "uuid" NOT NULL,
    "cursor_agent_id" "text" NOT NULL,
    "session_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
COMMENT ON TABLE "public"."grok_sticky_agents" IS 'Maps tenant → durable Grok Cloud Agent id (bc-…). grok-mcp reuses it via POST /v1/agents/{id}/runs.';
CREATE TABLE IF NOT EXISTS "public"."carmen_mcp_dispatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "tool" "text" DEFAULT 'ask_carmen'::"text" NOT NULL,
    "request_text" "text" NOT NULL,
    "context" "text",
    "conversation_id" "uuid",
    "tools_used" "text"[],
    "status" "text" DEFAULT 'ok'::"text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
COMMENT ON TABLE "public"."carmen_mcp_dispatches" IS 'External MCP clients (Grok Bot) → Carmen via carmen-mcp: request, conversation, tools, outcome.';
CREATE TABLE IF NOT EXISTS "public"."agent_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "credential_type" "text" NOT NULL,
    "credential_name" "text" NOT NULL,
    "encrypted_value" "text" NOT NULL,
    "metadata" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- Functions
CREATE OR REPLACE FUNCTION "public"."deactivate_reports_for_inactive_client"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status IN ('paused', 'ended')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.crm_tables
    SET campaign_active = false
    WHERE client_id = NEW.id
      AND campaign_active IS DISTINCT FROM false;
  END IF;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."get_leads_by_stages"("p_tenant_id" "uuid", "p_agency_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_stages" "text"[] DEFAULT NULL::"text"[], "p_limit_per_stage" integer DEFAULT 50, "p_search_query" "text" DEFAULT NULL::"text", "p_from_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_sales_person_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_response_statuses" "text"[] DEFAULT NULL::"text"[], "p_follow_up_today" boolean DEFAULT false, "p_start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_tag_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_offset_per_stage" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  stage_record RECORD;
  stage_leads JSONB;
  stage_count BIGINT;
  search_pattern TEXT;
  phone_digits TEXT;
  effective_start_date timestamp with time zone;
  effective_end_date timestamp with time zone;
BEGIN
  IF p_search_query IS NOT NULL AND p_search_query != '' THEN
    search_pattern := '%' || lower(p_search_query) || '%';
    IF length(regexp_replace(p_search_query, '\D', '', 'g')) >= 8 THEN
      phone_digits := right(regexp_replace(p_search_query, '\D', '', 'g'), 9);
    END IF;
  END IF;

  effective_start_date := COALESCE(p_start_date, p_from_date);
  effective_end_date := COALESCE(p_end_date, p_to_date);

  FOR stage_record IN
    SELECT id, stage_key, label, color, sort_order
    FROM lead_pipeline_stages
    WHERE tenant_id = p_tenant_id AND is_active = true
    ORDER BY sort_order ASC
  LOOP
    IF p_stages IS NULL OR stage_record.stage_key = ANY(p_stages) THEN

      SELECT COUNT(*)
      INTO stage_count
      FROM leads l
      WHERE l.tenant_id = p_tenant_id
        AND l.archived_at IS NULL
        AND l.status = stage_record.stage_key
        AND (
          p_agency_ids IS NULL
          OR l.agency_id IS NULL
          OR l.agency_id = ANY(p_agency_ids)
          OR l.sales_person_id = public.get_user_sales_person_id(auth.uid())
          OR EXISTS (
            SELECT 1
            FROM lead_sales_people lsp
            WHERE lsp.lead_id = l.id
              AND lsp.sales_person_id = public.get_user_sales_person_id(auth.uid())
          )
          OR (
            p_sales_person_ids IS NOT NULL
            AND (
              l.sales_person_id = ANY(p_sales_person_ids)
              OR EXISTS (
                SELECT 1
                FROM lead_sales_people lsp
                WHERE lsp.lead_id = l.id
                  AND lsp.sales_person_id = ANY(p_sales_person_ids)
              )
            )
          )
        )
        AND (
          p_sales_person_ids IS NULL
          OR l.sales_person_id = ANY(p_sales_person_ids)
          OR EXISTS (
            SELECT 1
            FROM lead_sales_people lsp
            WHERE lsp.lead_id = l.id
              AND lsp.tenant_id = l.tenant_id
              AND lsp.sales_person_id = ANY(p_sales_person_ids)
          )
        )
        AND (p_response_statuses IS NULL OR l.response_status = ANY(p_response_statuses))
        AND (effective_start_date IS NULL OR l.created_at >= effective_start_date)
        AND (effective_end_date IS NULL OR l.created_at <= effective_end_date)
        AND (NOT p_follow_up_today OR l.follow_up_date <= CURRENT_DATE)
        AND (search_pattern IS NULL OR (
          lower(COALESCE(l.contact_name, '')) LIKE search_pattern OR
          lower(COALESCE(l.company_name, '')) LIKE search_pattern OR
          lower(COALESCE(l.email, '')) LIKE search_pattern OR
          COALESCE(l.phone, '') LIKE search_pattern OR
          lower(COALESCE(l.campaign_name, '')) LIKE search_pattern OR
          (
            phone_digits IS NOT NULL
            AND regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') LIKE '%' || phone_digits || '%'
          )
        ))
        AND (p_tag_ids IS NULL OR EXISTS (
          SELECT 1
          FROM chat_contact_tags cct
          WHERE cct.lead_id = l.id
            AND cct.tag_id = ANY(p_tag_ids)
        ));

      SELECT COALESCE(jsonb_agg(lead_data ORDER BY
        CASE WHEN p_follow_up_today THEN (lead_data->>'follow_up_date') END ASC NULLS LAST,
        (lead_data->>'created_at') DESC
      ), '[]'::JSONB)
      INTO stage_leads
      FROM (
        SELECT jsonb_build_object(
          'id', l.id,
          'contact_name', l.contact_name,
          'company_name', l.company_name,
          'email', l.email,
          'phone', l.phone,
          'source', l.source,
          'first_source', l.first_source,
          'campaign_name', l.campaign_name,
          'status', l.status,
          'response_status', l.response_status,
          'notes', l.notes,
          'agency_id', l.agency_id,
          'sales_person_id', l.sales_person_id,
          'created_at', l.created_at,
          'first_created_at', l.first_created_at,
          'updated_at', l.updated_at,
          'follow_up_date', l.follow_up_date,
          'estimated_deal_value', l.estimated_deal_value,
          'won_date', l.won_date,
          'folder_link', l.folder_link,
          'industry', l.industry,
          'tenant_id', l.tenant_id,
          'manychat_subscriber_id', l.manychat_subscriber_id,
          'active_chat_provider', l.active_chat_provider,
          'whatsapp_avatar_url', l.whatsapp_avatar_url,
          'leadgen_id', NULL,
          'lead_sales_people', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('sales_person_id', lsp.sales_person_id))
             FROM lead_sales_people lsp
             WHERE lsp.lead_id = l.id AND lsp.tenant_id = l.tenant_id),
            '[]'::jsonb
          )
        ) as lead_data
        FROM leads l
        WHERE l.tenant_id = p_tenant_id
          AND l.archived_at IS NULL
          AND l.status = stage_record.stage_key
          AND (
            p_agency_ids IS NULL
            OR l.agency_id IS NULL
            OR l.agency_id = ANY(p_agency_ids)
            OR l.sales_person_id = public.get_user_sales_person_id(auth.uid())
            OR EXISTS (
              SELECT 1
              FROM lead_sales_people lsp
              WHERE lsp.lead_id = l.id
                AND lsp.sales_person_id = public.get_user_sales_person_id(auth.uid())
            )
            OR (
              p_sales_person_ids IS NOT NULL
              AND (
                l.sales_person_id = ANY(p_sales_person_ids)
                OR EXISTS (
                  SELECT 1
                  FROM lead_sales_people lsp
                  WHERE lsp.lead_id = l.id
                    AND lsp.sales_person_id = ANY(p_sales_person_ids)
                )
              )
            )
          )
          AND (
            p_sales_person_ids IS NULL
            OR l.sales_person_id = ANY(p_sales_person_ids)
            OR EXISTS (
              SELECT 1
              FROM lead_sales_people lsp
              WHERE lsp.lead_id = l.id
                AND lsp.tenant_id = l.tenant_id
                AND lsp.sales_person_id = ANY(p_sales_person_ids)
            )
          )
          AND (p_response_statuses IS NULL OR l.response_status = ANY(p_response_statuses))
          AND (effective_start_date IS NULL OR l.created_at >= effective_start_date)
          AND (effective_end_date IS NULL OR l.created_at <= effective_end_date)
          AND (NOT p_follow_up_today OR l.follow_up_date <= CURRENT_DATE)
          AND (search_pattern IS NULL OR (
            lower(COALESCE(l.contact_name, '')) LIKE search_pattern OR
            lower(COALESCE(l.company_name, '')) LIKE search_pattern OR
            lower(COALESCE(l.email, '')) LIKE search_pattern OR
            COALESCE(l.phone, '') LIKE search_pattern OR
            lower(COALESCE(l.campaign_name, '')) LIKE search_pattern OR
            (
              phone_digits IS NOT NULL
              AND regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') LIKE '%' || phone_digits || '%'
            )
          ))
          AND (p_tag_ids IS NULL OR EXISTS (
            SELECT 1
            FROM chat_contact_tags cct
            WHERE cct.lead_id = l.id
              AND cct.tag_id = ANY(p_tag_ids)
          ))
        ORDER BY
          CASE WHEN p_follow_up_today THEN l.follow_up_date END ASC NULLS LAST,
          l.created_at DESC
        LIMIT p_limit_per_stage
        OFFSET p_offset_per_stage
      ) sub;

      result := result || jsonb_build_object(
        stage_record.stage_key,
        jsonb_build_object(
          'id', stage_record.id,
          'label', stage_record.label,
          'color', stage_record.color,
          'sort_order', stage_record.sort_order,
          'leads', stage_leads,
          'total_count', stage_count
        )
      );
    END IF;
  END LOOP;

  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."graphify_group_subgraph"("p_group" "text", "p_limit" integer DEFAULT 400) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_version text;
  v_result jsonb;
begin
  if not public.graphify_is_admin() then
    raise exception 'Graphify access is limited to admins';
  end if;

  select version into v_version from public.aios_graph_versions where status = 'active' limit 1;
  if v_version is null then
    return jsonb_build_object('nodes', '[]'::jsonb, 'edges', '[]'::jsonb);
  end if;

  with picked as (
    select n.id, n.label, n.file_type, n.source_file, n.source_location,
           (select count(*) from public.aios_graph_edges e
             where e.version = v_version and (e.source_id = n.id or e.target_id = n.id)) as degree
    from public.aios_graph_nodes n
    where n.version = v_version
      and public.graphify_node_group(n.community_name, n.source_file) = p_group
    order by degree desc, n.label
    limit least(greatest(p_limit, 1), 800)
  )
  select jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'label', p.label, 'file_type', p.file_type,
        'source_file', p.source_file, 'source_location', p.source_location,
        'degree', p.degree))
      from picked p), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', e.source_id, 'target', e.target_id,
        'relation', e.relation, 'weight', e.weight))
      from public.aios_graph_edges e
      where e.version = v_version
        and e.source_id in (select id from picked)
        and e.target_id in (select id from picked)), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."graphify_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('owner'::app_role, 'agency_owner'::app_role, 'super_admin'::app_role)
  );
$$;
CREATE OR REPLACE FUNCTION "public"."graphify_node_group"("p_community_name" "text", "p_source_file" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select coalesce(
    nullif(p_community_name, ''),
    case
      when p_source_file is null or p_source_file = '' then 'אחר'
      when p_source_file like 'src/%' or p_source_file like 'supabase/%'
        then split_part(p_source_file, '/', 1) || '/' || split_part(p_source_file, '/', 2)
      when position('/' in p_source_file) > 0
        then split_part(p_source_file, '/', 1)
      else 'קבצי תצורה'
    end
  );
$$;
CREATE OR REPLACE FUNCTION "public"."graphify_overview"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_version record;
  v_groups jsonb;
  v_relations jsonb;
begin
  if not public.graphify_is_admin() then
    raise exception 'Graphify access is limited to admins';
  end if;

  select version, commit_sha, node_count, edge_count, activated_at
    into v_version
    from public.aios_graph_versions where status = 'active' limit 1;

  if v_version.version is null then
    return jsonb_build_object('active', false);
  end if;

  with base as (
    select public.graphify_node_group(n.community_name, n.source_file) as grp,
           coalesce(n.file_type, 'other') as ft
    from public.aios_graph_nodes n
    where n.version = v_version.version
  ), per_type as (
    select grp, ft, count(*) as cnt from base group by grp, ft
  ), grouped as (
    select grp, sum(cnt)::int as node_cnt, jsonb_object_agg(ft, cnt) as fts
    from per_type group by grp
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'group_key', grp, 'name', grp, 'nodes', node_cnt, 'file_types', fts
         ) order by node_cnt desc), '[]'::jsonb)
    into v_groups
  from grouped;

  select coalesce(jsonb_object_agg(relation, cnt), '{}'::jsonb) into v_relations
  from (
    select relation, count(*) as cnt
    from public.aios_graph_edges where version = v_version.version
    group by relation order by cnt desc
  ) r;

  return jsonb_build_object(
    'active', true,
    'version', v_version.version,
    'commit_sha', v_version.commit_sha,
    'node_count', v_version.node_count,
    'edge_count', v_version.edge_count,
    'activated_at', v_version.activated_at,
    'communities', v_groups,
    'relations', v_relations
  );
end;
$$;
CREATE OR REPLACE FUNCTION "public"."graphify_search"("p_query" "text", "p_depth" integer DEFAULT 2, "p_limit" integer DEFAULT 40) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_result jsonb;
begin
  if not public.graphify_is_admin() then
    raise exception 'Graphify access is limited to admins';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_result
  from public.carmen_query_system_graph(p_query, p_depth, p_limit) r;

  return v_result;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."leads_sync_sales_person_link"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.sales_person_id IS NOT NULL AND NEW.tenant_id IS NOT NULL THEN
    INSERT INTO public.lead_sales_people (lead_id, sales_person_id, tenant_id)
    VALUES (NEW.id, NEW.sales_person_id, NEW.tenant_id)
    ON CONFLICT (lead_id, sales_person_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."set_report_schedule_next_run"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  local_now timestamp;
  candidate timestamp;
  days_ahead integer;
BEGIN
  NEW.updated_at := now();
  IF NOT NEW.enabled THEN
    NEW.next_run_at := NULL;
    RETURN NEW;
  END IF;

  local_now := timezone(NEW.timezone, now());
  IF NEW.frequency = 'weekly' THEN
    NEW.day_of_week := COALESCE(NEW.day_of_week, 0);
    days_ahead := (NEW.day_of_week - extract(dow FROM local_now)::integer + 7) % 7;
    candidate := date_trunc('day', local_now)
      + days_ahead * interval '1 day'
      + NEW.send_time;
    IF candidate <= local_now THEN candidate := candidate + interval '7 days'; END IF;
  ELSE
    NEW.day_of_month := COALESCE(NEW.day_of_month, 1);
    candidate := date_trunc('month', local_now)
      + (NEW.day_of_month - 1) * interval '1 day'
      + NEW.send_time;
    IF candidate <= local_now THEN candidate := candidate + interval '1 month'; END IF;
  END IF;

  NEW.next_run_at := candidate AT TIME ZONE NEW.timezone;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."user_can_annotate_lead"("_lead_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = _lead_id
      AND (
        public.is_super_admin(auth.uid())
        OR public.has_role(auth.uid(), 'owner')
        OR public.user_is_tenant_member(l.tenant_id)
        OR l.agency_id = ANY (public.get_user_agency_ids(auth.uid()))
        OR l.agency_id = ANY (public.get_user_sales_person_agency_ids(auth.uid()))
        OR public.user_has_cross_tenant_agency_access(auth.uid(), l.agency_id)
        OR l.sales_person_id = public.get_user_sales_person_id(auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.lead_sales_people lsp
          WHERE lsp.lead_id = l.id
            AND lsp.sales_person_id = public.get_user_sales_person_id(auth.uid())
        )
      )
  );
$$;

-- Primary keys, unique and check constraints on the new tables
ALTER TABLE ONLY "public"."report_schedules"
    ADD CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."report_deliveries"
    ADD CONSTRAINT "report_deliveries_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."seo_geo_programs"
    ADD CONSTRAINT "seo_geo_programs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."seo_geo_programs"
    ADD CONSTRAINT "seo_geo_programs_work_item_id_key" UNIQUE ("work_item_id");
ALTER TABLE ONLY "public"."seo_geo_keywords"
    ADD CONSTRAINT "seo_geo_keywords_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."seo_geo_keywords"
    ADD CONSTRAINT "seo_geo_keywords_work_item_id_keyword_key" UNIQUE ("work_item_id", "keyword");
ALTER TABLE ONLY "public"."seo_geo_calendar_entries"
    ADD CONSTRAINT "seo_geo_calendar_entries_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."seo_share_response_cache"
    ADD CONSTRAINT "seo_share_response_cache_pkey" PRIMARY KEY ("share_token");
ALTER TABLE ONLY "public"."gsc_keyword_snapshots"
    ADD CONSTRAINT "gsc_keyword_snapshots_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."gsc_keyword_snapshots"
    ADD CONSTRAINT "gsc_keyword_snapshots_tenant_id_site_url_period_key_key" UNIQUE ("tenant_id", "site_url", "period_key");
ALTER TABLE ONLY "public"."grok_dispatches"
    ADD CONSTRAINT "grok_dispatches_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."grok_sticky_agents"
    ADD CONSTRAINT "grok_sticky_agents_pkey" PRIMARY KEY ("tenant_id");
ALTER TABLE ONLY "public"."carmen_mcp_dispatches"
    ADD CONSTRAINT "carmen_mcp_dispatches_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."agent_credentials"
    ADD CONSTRAINT "agent_credentials_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."agent_credentials"
    ADD CONSTRAINT "agent_credentials_tenant_id_credential_type_credential_name_key" UNIQUE ("tenant_id", "credential_type", "credential_name");

-- Primary key that the seo_geo_* foreign keys reference (prod data checked: ids unique, none null)
ALTER TABLE ONLY "public"."marketing_work_items"
    ADD CONSTRAINT "marketing_work_items_pkey" PRIMARY KEY ("id");

-- Primary key that marketing_video_scenes' asset foreign keys reference (prod data checked: 226 rows, ids unique, none null; Staging already has it)
ALTER TABLE ONLY "public"."marketing_assets"
    ADD CONSTRAINT "marketing_assets_pkey" PRIMARY KEY ("id");

-- Foreign keys on the new tables
ALTER TABLE ONLY "public"."report_schedules"
    ADD CONSTRAINT "report_schedules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."report_schedules"
    ADD CONSTRAINT "report_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."report_schedules"
    ADD CONSTRAINT "report_schedules_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "public"."crm_dashboards"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."report_schedules"
    ADD CONSTRAINT "report_schedules_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."crm_tables"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."report_schedules"
    ADD CONSTRAINT "report_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."report_schedules"
    ADD CONSTRAINT "report_schedules_whatsapp_group_id_fkey" FOREIGN KEY ("whatsapp_group_id") REFERENCES "public"."whatsapp_groups"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."report_deliveries"
    ADD CONSTRAINT "report_deliveries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."report_deliveries"
    ADD CONSTRAINT "report_deliveries_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."report_schedules"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."report_deliveries"
    ADD CONSTRAINT "report_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."seo_geo_programs"
    ADD CONSTRAINT "seo_geo_programs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."seo_geo_programs"
    ADD CONSTRAINT "seo_geo_programs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."seo_geo_programs"
    ADD CONSTRAINT "seo_geo_programs_wordpress_site_id_fkey" FOREIGN KEY ("wordpress_site_id") REFERENCES "public"."social_media_wordpress_sites"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."seo_geo_programs"
    ADD CONSTRAINT "seo_geo_programs_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "public"."marketing_work_items"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."seo_geo_keywords"
    ADD CONSTRAINT "seo_geo_keywords_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."seo_geo_keywords"
    ADD CONSTRAINT "seo_geo_keywords_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."seo_geo_keywords"
    ADD CONSTRAINT "seo_geo_keywords_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "public"."marketing_work_items"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."seo_geo_calendar_entries"
    ADD CONSTRAINT "seo_geo_calendar_entries_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."seo_geo_calendar_entries"
    ADD CONSTRAINT "seo_geo_calendar_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."seo_geo_calendar_entries"
    ADD CONSTRAINT "seo_geo_calendar_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."seo_geo_calendar_entries"
    ADD CONSTRAINT "seo_geo_calendar_entries_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "public"."marketing_work_items"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."agent_credentials"
    ADD CONSTRAINT "agent_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;

-- Unique constraints that upsert(onConflict) needs (prod data checked: no duplicates)
ALTER TABLE ONLY "public"."automation_shared_tenants"
    ADD CONSTRAINT "automation_shared_tenants_pkey" PRIMARY KEY ("automation_id", "tenant_id");
ALTER TABLE ONLY "public"."carmen_memory_pointers"
    ADD CONSTRAINT "carmen_memory_pointers_tenant_id_path_entity_type_entity_id_key" UNIQUE ("tenant_id", "path", "entity_type", "entity_id", "subcategory");
ALTER TABLE ONLY "public"."marketing_stage_templates"
    ADD CONSTRAINT "marketing_stage_templates_tenant_id_track_stage_type_key" UNIQUE ("tenant_id", "track", "stage_type");
ALTER TABLE ONLY "public"."social_comments"
    ADD CONSTRAINT "social_comments_platform_external_comment_id_key" UNIQUE ("platform", "external_comment_id");
ALTER TABLE ONLY "public"."social_pages"
    ADD CONSTRAINT "social_pages_tenant_id_platform_page_id_key" UNIQUE ("tenant_id", "platform", "page_id");
ALTER TABLE ONLY "public"."telegram_messages"
    ADD CONSTRAINT "telegram_messages_tenant_id_update_id_key" UNIQUE ("tenant_id", "update_id");
ALTER TABLE ONLY "public"."user_workspace_layout"
    ADD CONSTRAINT "user_workspace_layout_user_id_tenant_id_module_id_key" UNIQUE ("user_id", "tenant_id", "module_id");
ALTER TABLE ONLY "public"."maskyoo_settings"
    ADD CONSTRAINT "maskyoo_settings_tenant_id_key" UNIQUE ("tenant_id");
ALTER TABLE ONLY "public"."seo_monthly_updates"
    ADD CONSTRAINT "seo_monthly_updates_client_id_month_key" UNIQUE ("client_id", "month");
-- New on both environments: ChatMultiSelectToolbar upserts on (user_id, client_id).
ALTER TABLE ONLY "public"."manually_read_contacts"
    ADD CONSTRAINT "manually_read_contacts_user_id_client_id_key" UNIQUE ("user_id", "client_id");

-- Foreign keys that PostgREST embeds need (prod data checked: no orphans)
ALTER TABLE ONLY "public"."agent_approval_queue"
    ADD CONSTRAINT "agent_approval_queue_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id");
ALTER TABLE ONLY "public"."agent_supervisors"
    ADD CONSTRAINT "agent_supervisors_child_agent_id_fkey" FOREIGN KEY ("child_agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."agent_supervisors"
    ADD CONSTRAINT "agent_supervisors_supervisor_agent_id_fkey" FOREIGN KEY ("supervisor_agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."agent_tasks"
    ADD CONSTRAINT "agent_tasks_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."marketing_work_items"
    ADD CONSTRAINT "marketing_work_items_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "public"."marketing_pipeline_stages"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."social_comments"
    ADD CONSTRAINT "social_comments_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."social_pages"("id") ON DELETE CASCADE;

-- Indexes
CREATE INDEX "report_schedules_due" ON "public"."report_schedules" USING "btree" ("next_run_at") WHERE (("enabled" = true) AND ("locked_at" IS NULL));
CREATE UNIQUE INDEX "report_schedules_unique_dashboard" ON "public"."report_schedules" USING "btree" ("client_id", "dashboard_id") WHERE ("dashboard_id" IS NOT NULL);
CREATE UNIQUE INDEX "report_schedules_unique_table" ON "public"."report_schedules" USING "btree" ("client_id", "table_id") WHERE ("table_id" IS NOT NULL);
CREATE INDEX "report_deliveries_client_created" ON "public"."report_deliveries" USING "btree" ("client_id", "created_at" DESC);
CREATE INDEX "seo_geo_programs_tenant_client_idx" ON "public"."seo_geo_programs" USING "btree" ("tenant_id", "client_id");
CREATE INDEX "seo_geo_keywords_work_item_idx" ON "public"."seo_geo_keywords" USING "btree" ("work_item_id", "promoted", "sort_order");
CREATE INDEX "seo_geo_calendar_publish_idx" ON "public"."seo_geo_calendar_entries" USING "btree" ("tenant_id", "scheduled_date", "approval_status", "generation_status");
CREATE INDEX "seo_geo_calendar_work_item_date_idx" ON "public"."seo_geo_calendar_entries" USING "btree" ("work_item_id", "scheduled_date");
CREATE INDEX "idx_seo_share_response_cache_expires" ON "public"."seo_share_response_cache" USING "btree" ("expires_at");
CREATE INDEX "idx_gsc_keyword_snapshots_client" ON "public"."gsc_keyword_snapshots" USING "btree" ("tenant_id", "client_id", "period_key");
CREATE INDEX "idx_gsc_keyword_snapshots_synced" ON "public"."gsc_keyword_snapshots" USING "btree" ("synced_at" DESC);
CREATE INDEX "idx_grok_dispatches_tenant_time" ON "public"."grok_dispatches" USING "btree" ("tenant_id", "created_at" DESC);
CREATE INDEX "idx_carmen_mcp_dispatches_tenant_time" ON "public"."carmen_mcp_dispatches" USING "btree" ("tenant_id", "created_at" DESC);
CREATE INDEX "idx_agent_credentials_tenant" ON "public"."agent_credentials" USING "btree" ("tenant_id");
CREATE INDEX "idx_clients_follow_up_date" ON "public"."clients" USING "btree" ("follow_up_date") WHERE ("follow_up_date" IS NOT NULL);

-- Triggers
CREATE OR REPLACE TRIGGER "trg_set_report_schedule_next_run" BEFORE INSERT OR UPDATE OF "enabled", "frequency", "day_of_week", "day_of_month", "send_time", "timezone", "last_run_at" ON "public"."report_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_report_schedule_next_run"();
CREATE OR REPLACE TRIGGER "deactivate_reports_for_inactive_client" AFTER UPDATE OF "status" ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."deactivate_reports_for_inactive_client"();
CREATE OR REPLACE TRIGGER "gsc_keyword_snapshots_updated_at" BEFORE UPDATE ON "public"."gsc_keyword_snapshots" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "seo_share_response_cache_updated_at" BEFORE UPDATE ON "public"."seo_share_response_cache" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "leads_sync_sales_person_link" AFTER INSERT OR UPDATE OF "sales_person_id" ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."leads_sync_sales_person_link"();

-- Backfill from the Oct 6 lead fix (3259a8735): link existing assignees so they can read their leads
INSERT INTO public.lead_sales_people (lead_id, sales_person_id, tenant_id)
SELECT id, sales_person_id, tenant_id
FROM public.leads
WHERE sales_person_id IS NOT NULL
  AND tenant_id IS NOT NULL
ON CONFLICT (lead_id, sales_person_id) DO NOTHING;

-- Row level security and policies on the new tables
ALTER TABLE "public"."report_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."seo_geo_programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."seo_geo_keywords" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."seo_geo_calendar_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."seo_share_response_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."gsc_keyword_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."grok_dispatches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."grok_sticky_agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."carmen_mcp_dispatches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_credentials" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members manage report schedules" ON "public"."report_schedules" TO "authenticated" USING ("public"."user_is_tenant_member"("tenant_id")) WITH CHECK ("public"."user_is_tenant_member"("tenant_id"));
CREATE POLICY "Tenant members log report deliveries" ON "public"."report_deliveries" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_is_tenant_member"("tenant_id"));
CREATE POLICY "Tenant members view report deliveries" ON "public"."report_deliveries" FOR SELECT TO "authenticated" USING ("public"."user_is_tenant_member"("tenant_id"));
CREATE POLICY "seo_geo_programs_tenant" ON "public"."seo_geo_programs" TO "authenticated" USING ((("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR "public"."is_super_admin"(( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR "public"."is_super_admin"(( SELECT "auth"."uid"() AS "uid"))));
CREATE POLICY "seo_geo_keywords_tenant" ON "public"."seo_geo_keywords" TO "authenticated" USING ((("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR "public"."is_super_admin"(( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR "public"."is_super_admin"(( SELECT "auth"."uid"() AS "uid"))));
CREATE POLICY "seo_geo_calendar_tenant" ON "public"."seo_geo_calendar_entries" TO "authenticated" USING ((("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR "public"."is_super_admin"(( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR "public"."is_super_admin"(( SELECT "auth"."uid"() AS "uid"))));
CREATE POLICY "seo_share_response_cache_deny_authenticated" ON "public"."seo_share_response_cache" TO "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "gsc_keyword_snapshots_tenant_access" ON "public"."gsc_keyword_snapshots" TO "authenticated" USING ((("tenant_id" IN ( SELECT "tu"."tenant_id"
   FROM "public"."tenant_users" "tu"
  WHERE ("tu"."user_id" = "auth"."uid"()))) OR "public"."is_super_admin"("auth"."uid"()) OR (("client_id" IS NOT NULL) AND "public"."user_has_cross_tenant_client_access"("auth"."uid"(), "client_id")))) WITH CHECK ((("tenant_id" IN ( SELECT "tu"."tenant_id"
   FROM "public"."tenant_users" "tu"
  WHERE ("tu"."user_id" = "auth"."uid"()))) OR "public"."is_super_admin"("auth"."uid"()) OR (("client_id" IS NOT NULL) AND "public"."user_has_cross_tenant_client_access"("auth"."uid"(), "client_id"))));
CREATE POLICY "agent_credentials_delete" ON "public"."agent_credentials" FOR DELETE USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));
CREATE POLICY "agent_credentials_insert" ON "public"."agent_credentials" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));
CREATE POLICY "agent_credentials_select" ON "public"."agent_credentials" FOR SELECT USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));
CREATE POLICY "agent_credentials_update" ON "public"."agent_credentials" FOR UPDATE USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));

-- Lead policies from the Oct 6 lead fix (3259a8735)
DROP POLICY IF EXISTS "Sales people view assigned leads" ON "public"."leads";
CREATE POLICY "Sales people view assigned leads" ON "public"."leads" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'sales_person'::"public"."app_role") AND ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) AND (("sales_person_id" = "public"."get_user_sales_person_id"("auth"."uid"())) OR (EXISTS ( SELECT 1
   FROM "public"."lead_sales_people" "lsp"
  WHERE (("lsp"."lead_id" = "leads"."id") AND ("lsp"."tenant_id" = "leads"."tenant_id") AND ("lsp"."sales_person_id" = "public"."get_user_sales_person_id"("auth"."uid"()))))))) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id"))));
DROP POLICY IF EXISTS "Users can update leads in their tenants" ON "public"."leads";
CREATE POLICY "Users can update leads in their tenants" ON "public"."leads" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"("auth"."uid"()) OR ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id")) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'sales_person'::"public"."app_role"))))) WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR ((("tenant_id" = "public"."get_user_tenant_id"("auth"."uid"())) OR "public"."user_has_cross_tenant_agency_access"("auth"."uid"(), "agency_id")) AND ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'team_manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'campaigner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'sales_person'::"public"."app_role")))));

-- Lead insert policy: prod compares ur.tenant_id with itself, so any role holder can insert leads into any tenant.
-- The fix shipped in 20260306122915 but never reached prod.
DROP POLICY IF EXISTS "Users can create leads in their tenants" ON "public"."leads";
CREATE POLICY "Users can create leads in their tenants" ON "public"."leads" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."tenant_id" = "leads"."tenant_id") AND ("ur"."role" = ANY (ARRAY['owner'::"public"."app_role", 'team_manager'::"public"."app_role", 'campaigner'::"public"."app_role", 'sales_person'::"public"."app_role"]))))) OR "public"."is_super_admin"("auth"."uid"())));

-- Realtime: AgentTasksPage subscribes to agent_tasks
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."agent_tasks";

-- Grants
-- New objects first lose the grants Supabase adds by default, then get exactly Staging's.
REVOKE ALL ON TABLE "public"."report_schedules" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."report_deliveries" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."seo_geo_programs" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."seo_geo_keywords" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."seo_geo_calendar_entries" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."seo_share_response_cache" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."gsc_keyword_snapshots" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."grok_dispatches" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."grok_sticky_agents" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."carmen_mcp_dispatches" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."agent_credentials" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."deactivate_reports_for_inactive_client"() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."graphify_group_subgraph"("p_group" "text", "p_limit" integer) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."graphify_is_admin"() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."graphify_node_group"("p_community_name" "text", "p_source_file" "text") FROM "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."graphify_overview"() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."graphify_search"("p_query" "text", "p_depth" integer, "p_limit" integer) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."leads_sync_sales_person_link"() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON FUNCTION "public"."set_report_schedule_next_run"() FROM "anon", "authenticated", "service_role";
GRANT ALL ON FUNCTION "public"."deactivate_reports_for_inactive_client"() TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_reports_for_inactive_client"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_reports_for_inactive_client"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."graphify_group_subgraph"("p_group" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."graphify_group_subgraph"("p_group" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."graphify_group_subgraph"("p_group" "text", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."graphify_is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."graphify_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."graphify_is_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."graphify_node_group"("p_community_name" "text", "p_source_file" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."graphify_node_group"("p_community_name" "text", "p_source_file" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."graphify_node_group"("p_community_name" "text", "p_source_file" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."graphify_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."graphify_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."graphify_overview"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."graphify_search"("p_query" "text", "p_depth" integer, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."graphify_search"("p_query" "text", "p_depth" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."graphify_search"("p_query" "text", "p_depth" integer, "p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."leads_sync_sales_person_link"() TO "anon";
GRANT ALL ON FUNCTION "public"."leads_sync_sales_person_link"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."leads_sync_sales_person_link"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_report_schedule_next_run"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_report_schedule_next_run"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_report_schedule_next_run"() TO "service_role";
GRANT ALL ON TABLE "public"."agent_credentials" TO "anon";
GRANT ALL ON TABLE "public"."agent_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_credentials" TO "service_role";
GRANT ALL ON TABLE "public"."carmen_mcp_dispatches" TO "anon";
GRANT ALL ON TABLE "public"."carmen_mcp_dispatches" TO "authenticated";
GRANT ALL ON TABLE "public"."carmen_mcp_dispatches" TO "service_role";
GRANT ALL ON TABLE "public"."grok_dispatches" TO "anon";
GRANT ALL ON TABLE "public"."grok_dispatches" TO "authenticated";
GRANT ALL ON TABLE "public"."grok_dispatches" TO "service_role";
GRANT ALL ON TABLE "public"."grok_sticky_agents" TO "anon";
GRANT ALL ON TABLE "public"."grok_sticky_agents" TO "authenticated";
GRANT ALL ON TABLE "public"."grok_sticky_agents" TO "service_role";
GRANT ALL ON TABLE "public"."gsc_keyword_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."gsc_keyword_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."gsc_keyword_snapshots" TO "service_role";
GRANT ALL ON TABLE "public"."report_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."report_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."report_deliveries" TO "service_role";
GRANT ALL ON TABLE "public"."report_schedules" TO "anon";
GRANT ALL ON TABLE "public"."report_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."report_schedules" TO "service_role";
GRANT ALL ON TABLE "public"."seo_geo_calendar_entries" TO "anon";
GRANT ALL ON TABLE "public"."seo_geo_calendar_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_geo_calendar_entries" TO "service_role";
GRANT ALL ON TABLE "public"."seo_geo_keywords" TO "anon";
GRANT ALL ON TABLE "public"."seo_geo_keywords" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_geo_keywords" TO "service_role";
GRANT ALL ON TABLE "public"."seo_geo_programs" TO "anon";
GRANT ALL ON TABLE "public"."seo_geo_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_geo_programs" TO "service_role";
GRANT ALL ON TABLE "public"."seo_share_response_cache" TO "anon";
GRANT ALL ON TABLE "public"."seo_share_response_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_share_response_cache" TO "service_role";

-- Storage: buckets the code uses that prod lacks (all served through signed URLs, so private)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('invoices', 'invoices', false),
  ('command-center-files', 'command-center-files', false),
  ('carmen-media', 'carmen-media', false)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "tenant members view invoice files" ON "storage"."objects" FOR SELECT USING ((("bucket_id" = 'invoices'::"text") AND ((("storage"."foldername"("name"))[1] = ("public"."get_user_tenant_id"("auth"."uid"()))::"text") OR "public"."is_super_admin"("auth"."uid"()))));
CREATE POLICY "tenant members upload invoice files" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'invoices'::"text") AND ((("storage"."foldername"("name"))[1] = ("public"."get_user_tenant_id"("auth"."uid"()))::"text") OR "public"."is_super_admin"("auth"."uid"()))));
CREATE POLICY "tenant members delete invoice files" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'invoices'::"text") AND ((("storage"."foldername"("name"))[1] = ("public"."get_user_tenant_id"("auth"."uid"()))::"text") OR "public"."is_super_admin"("auth"."uid"()))));
CREATE POLICY "carmen_media_select" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'carmen-media'::"text") AND (("storage"."foldername"("name"))[1] = ("public"."get_effective_tenant_id"())::"text")));
CREATE POLICY "carmen_media_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'carmen-media'::"text") AND (("storage"."foldername"("name"))[1] = ("public"."get_effective_tenant_id"())::"text")));
CREATE POLICY "carmen_media_update" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'carmen-media'::"text") AND (("storage"."foldername"("name"))[1] = ("public"."get_effective_tenant_id"())::"text")));
CREATE POLICY "carmen_media_delete" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'carmen-media'::"text") AND (("storage"."foldername"("name"))[1] = ("public"."get_effective_tenant_id"())::"text")));
CREATE POLICY "Users delete own command center files" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'command-center-files'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
CREATE POLICY "Authenticated users can view supplier invoices" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'supplier-invoices'::"text"));
-- Written fresh: Staging lets anyone read and any user upload anywhere in this bucket.
-- uploadCommandCenterAttachments stores files under <user id>/ and signs them right after upload.
CREATE POLICY "Users upload own command center files" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'command-center-files'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
CREATE POLICY "Users read own command center files" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'command-center-files'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
