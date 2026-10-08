import json, sys

SP = sys.argv[1]
d = json.load(open(f'{SP}/objs.json'))
p, s, sr = d['prod'], d['staging'], d['staging_raw']
das = json.load(open(f'{SP}/objs_as.json'))
asr = das['staging_raw']

NEW_TABLES = ['report_schedules', 'report_deliveries', 'seo_geo_programs', 'seo_geo_keywords',
              'seo_geo_calendar_entries', 'seo_share_response_cache', 'gsc_keyword_snapshots',
              'grok_dispatches', 'grok_sticky_agents', 'carmen_mcp_dispatches', 'agent_credentials']

out = []
used = set()


def emit(key, raw=None):
    stmt = (raw if raw is not None else sr[key]).rstrip().rstrip(';')
    out.append(stmt + ';\n')
    used.add(key)


def section(title):
    out.append(f'\n-- {title}\n')


def table_keys(prefix):
    return [k for k in s if k.startswith(prefix) and k not in p]


out.append('''-- Catch-up: schema that shipped code on origin/main uses but the production baseline lacks.
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
''')

section('Enum values used by the automation builder')
for t, vals in [('automation_action', ['send_telegram']),
                ('automation_trigger', ['telegram_message_received', 'account_stopped_spending',
                                        'ad_account_billing_issue', 'ad_account_blocked',
                                        'integration_disconnected'])]:
    for v in vals:
        out.append(f'ALTER TYPE "public"."{t}" ADD VALUE IF NOT EXISTS \'{v}\';\n')

section('Columns on existing tables')
for t, cs in {'clients': ['follow_up_date', 'follow_up_manager_notified_at', 'follow_up_campaigner_notified_at'],
              'ai_agents': ['active_modes', 'active_skills'],
              'social_media_wordpress_sites': ['woo_consumer_key', 'woo_consumer_secret'],
              'woocommerce_sync_log': ['sync_type', 'created_at']}.items():
    for c in cs:
        k = f'COLUMN public.{t}.{c}'
        assert k not in p, k
        out.append(f'ALTER TABLE "public"."{t}" ADD COLUMN IF NOT EXISTS "{c}" {s[k]};\n')
        used.add(k)

section('New tables')
for t in NEW_TABLES:
    emit(f'TABLE public.{t}')
    k = f'COMMENT TABLE public.{t}'
    if k in s:
        emit(k)

section('Functions')
for k in s:
    if k.startswith('FUNCTION') and any(n in k for n in ['graphify_', 'set_report_schedule_next_run',
                                                           'deactivate_reports_for_inactive_client',
                                                           'leads_sync_sales_person_link',
                                                           'get_leads_by_stages', 'user_can_annotate_lead']):
        assert k not in p or p[k] != s[k], k
        emit(k)

section('Primary keys, unique and check constraints on the new tables')
fks = []
for t in NEW_TABLES:
    for k in table_keys(f'CONSTRAINT public.{t}.'):
        if k in sr and sr[k].upper().startswith('ALTER TABLE'):
            if 'FOREIGN KEY' in s[k]:
                fks.append(k)
            else:
                emit(k)
section('Primary key that the seo_geo_* foreign keys reference (prod data checked: ids unique, none null)')
emit('CONSTRAINT public.marketing_work_items.marketing_work_items_pkey')
section('Foreign keys on the new tables')
for k in fks:
    emit(k)

section('Unique constraints that upsert(onConflict) needs (prod data checked: no duplicates)')
for k in ['CONSTRAINT public.automation_shared_tenants.automation_shared_tenants_pkey',
          'CONSTRAINT public.carmen_memory_pointers.carmen_memory_pointers_tenant_id_path_entity_type_entity_id_key',
          'CONSTRAINT public.marketing_stage_templates.marketing_stage_templates_tenant_id_track_stage_type_key',
          'CONSTRAINT public.social_comments.social_comments_platform_external_comment_id_key',
          'CONSTRAINT public.social_pages.social_pages_tenant_id_platform_page_id_key',
          'CONSTRAINT public.telegram_messages.telegram_messages_tenant_id_update_id_key',
          'CONSTRAINT public.user_workspace_layout.user_workspace_layout_user_id_tenant_id_module_id_key',
          'CONSTRAINT public.maskyoo_settings.maskyoo_settings_tenant_id_key',
          'CONSTRAINT public.seo_monthly_updates.seo_monthly_updates_client_id_month_key']:
    assert k not in p, k
    emit(k)
out.append('-- New on both environments: ChatMultiSelectToolbar upserts on (user_id, client_id).\n')
out.append('ALTER TABLE ONLY "public"."manually_read_contacts"\n    ADD CONSTRAINT "manually_read_contacts_user_id_client_id_key" UNIQUE ("user_id", "client_id");\n')

section('Foreign keys that PostgREST embeds need (prod data checked: no orphans)')
for k in ['CONSTRAINT public.agent_approval_queue.agent_approval_queue_agent_id_fkey',
          'CONSTRAINT public.agent_supervisors.agent_supervisors_child_agent_id_fkey',
          'CONSTRAINT public.agent_supervisors.agent_supervisors_supervisor_agent_id_fkey',
          'CONSTRAINT public.agent_tasks.agent_tasks_agent_id_fkey',
          'CONSTRAINT public.marketing_work_items.marketing_work_items_current_stage_id_fkey',
          'CONSTRAINT public.social_comments.social_comments_page_id_fkey']:
    assert k not in p, k
    emit(k)

section('Indexes')
for t in NEW_TABLES:
    for k in table_keys(f'INDEX public.{t} '):
        emit(k)
emit('INDEX public.clients :: idx_clients_follow_up_date')

section('Triggers')
for k in ['TRIGGER public.report_schedules :: trg_set_report_schedule_next_run',
          'TRIGGER public.clients :: deactivate_reports_for_inactive_client',
          'TRIGGER public.gsc_keyword_snapshots :: gsc_keyword_snapshots_updated_at',
          'TRIGGER public.seo_share_response_cache :: seo_share_response_cache_updated_at',
          'TRIGGER public.leads :: leads_sync_sales_person_link']:
    emit(k)

section('Backfill from the Oct 6 lead fix (3259a8735): link existing assignees so they can read their leads')
out.append('''INSERT INTO public.lead_sales_people (lead_id, sales_person_id, tenant_id)
SELECT id, sales_person_id, tenant_id
FROM public.leads
WHERE sales_person_id IS NOT NULL
  AND tenant_id IS NOT NULL
ON CONFLICT (lead_id, sales_person_id) DO NOTHING;
''')

section('Row level security and policies on the new tables')
for t in NEW_TABLES:
    out.append(f'ALTER TABLE "public"."{t}" ENABLE ROW LEVEL SECURITY;\n')
for t in NEW_TABLES:
    for k in table_keys(f'POLICY public.{t} '):
        emit(k)

section('Lead policies from the Oct 6 lead fix (3259a8735)')
for name in ['Sales people view assigned leads', 'Users can update leads in their tenants']:
    out.append(f'DROP POLICY IF EXISTS "{name}" ON "public"."leads";\n')
    emit(f'POLICY public.leads :: {name.lower()}')

section('Lead insert policy: prod compares ur.tenant_id with itself, so any role holder can insert leads into any tenant.\n'
        '-- The fix shipped in 20260306122915 but never reached prod.')
out.append('DROP POLICY IF EXISTS "Users can create leads in their tenants" ON "public"."leads";\n')
emit('POLICY public.leads :: users can create leads in their tenants')

section('Realtime: AgentTasksPage subscribes to agent_tasks')
out.append('ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."agent_tasks";\n')

section('Grants')
out.append('-- New objects first lose the grants Supabase adds by default, then get exactly Staging\'s.\n')
for t in NEW_TABLES:
    out.append(f'REVOKE ALL ON TABLE "public"."{t}" FROM "anon", "authenticated", "service_role";\n')
for k in s:
    if k.startswith('FUNCTION') and k not in p and any(n in k for n in ['graphify_', 'set_report_schedule_next_run',
                                                                      'deactivate_reports_for_inactive_client',
                                                                      'leads_sync_sales_person_link']):
        sig = k.split(' ', 1)[1]
        name, args = sig.split('(', 1)
        args = ', '.join(a.split(' default ')[0] for a in args[:-1].split(', ')) if args != ')' else ''
        schema, fn = name.split('.')
        out.append(f'REVOKE ALL ON FUNCTION "{schema}"."{fn}"({args}) FROM "anon", "authenticated", "service_role";\n')
names = NEW_TABLES + ['graphify_', 'set_report_schedule_next_run', 'deactivate_reports_for_inactive_client',
                      'leads_sync_sales_person_link']
for k in s:
    if k.startswith('ACL') and k not in p and any(f'"public"."{n}' in k for n in names):
        emit(k)

section('Storage: buckets the code uses that prod lacks (all served through signed URLs, so private)')
out.append('''INSERT INTO storage.buckets (id, name, public)
VALUES
  ('invoices', 'invoices', false),
  ('command-center-files', 'command-center-files', false),
  ('carmen-media', 'carmen-media', false)
ON CONFLICT (id) DO NOTHING;
''')
for n in ['tenant members view invoice files', 'tenant members upload invoice files',
          'tenant members delete invoice files', 'carmen_media_select', 'carmen_media_insert',
          'carmen_media_update', 'carmen_media_delete', 'Users delete own command center files',
          'Authenticated users can view supplier invoices']:
    k = f'POLICY storage.objects :: {n.lower()}'
    out.append(asr[k].rstrip(';') + ';\n')
out.append('''-- Written fresh: Staging lets anyone read and any user upload anywhere in this bucket.
-- uploadCommandCenterAttachments stores files under <user id>/ and signs them right after upload.
CREATE POLICY "Users upload own command center files" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'command-center-files'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
CREATE POLICY "Users read own command center files" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'command-center-files'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
''')

sys.stdout.write(''.join(out))
