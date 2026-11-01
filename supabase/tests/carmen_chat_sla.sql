-- Carmen chat SLA (20261101101000_carmen_chat_sla): get_client_thread_activity
-- over synthetic tenants, lines and chat rows, inside one transaction that is
-- rolled back. Tenants: the reader, an owner tenant whose agency is shared
-- with the reader, and an unrelated tenant.
BEGIN;
DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_reader uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_reader_agency uuid := gen_random_uuid();
  v_owner_agency uuid := gen_random_uuid();
  v_other_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_shared_client uuid := gen_random_uuid();
  v_other_client uuid := gen_random_uuid();
  v_line uuid;
  v_org_line uuid;
  v_owner_line uuid;
  v_group uuid;
  v_shared uuid;
  v_owner_shared uuid;
  v_unrelated uuid;
  v_blocked_group uuid;
  v_table uuid := gen_random_uuid();
  v_schedule uuid := gen_random_uuid();
  v_kinds text[] := ARRAY['chat', 'report', 'dashboard_share', 'meeting_summary'];
  v_phone text := '05' || lpad((floor(random() * 1e8))::bigint::text, 8, '0');
  v_contact text := '05' || lpad((floor(random() * 1e8))::bigint::text, 8, '0');
  v_lid text := '9' || lpad((floor(random() * 1e14))::bigint::text, 14, '0');
  v_texts text;
  v_rows integer;
BEGIN
  -- chat_messages.connection_user_id references auth.users, so the lines are
  -- existing users; every read is keyed by the new tenants below.
  SELECT u.id INTO v_line FROM auth.users AS u ORDER BY u.id LIMIT 1;
  SELECT u.id INTO v_org_line FROM auth.users AS u ORDER BY u.id OFFSET 1 LIMIT 1;
  SELECT u.id INTO v_owner_line FROM auth.users AS u ORDER BY u.id OFFSET 2 LIMIT 1;
  IF v_owner_line IS NULL THEN
    RAISE EXCEPTION 'Requires three auth users';
  END IF;

  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_reader, 'QA reader', 'qa-reader-' || v_tag),
    (v_owner, 'QA owner', 'qa-owner-' || v_tag),
    (v_other, 'QA other', 'qa-other-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES
    (v_reader_agency, v_reader, 'QA'), (v_owner_agency, v_owner, 'QA'), (v_other_agency, v_other, 'QA');
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id)
  VALUES (v_owner, v_owner_agency, v_reader);
  INSERT INTO public.clients (id, tenant_id, agency_id, name, phone, status) VALUES
    (v_client, v_reader, v_reader_agency, 'QA client', v_phone, 'active'),
    (v_shared_client, v_owner, v_owner_agency, 'QA shared', NULL, 'active'),
    (v_other_client, v_other, v_other_agency, 'QA other', NULL, 'active');
  INSERT INTO public.client_contacts (tenant_id, client_id, contact_name, phone)
  VALUES (v_reader, v_client, 'QA contact', v_contact);
  INSERT INTO public.wa_lid_map (lid, phone, source) VALUES (v_lid, v_phone, 'qa');
  INSERT INTO public.crm_tables (id, tenant_id, name, slug) VALUES (v_table, v_reader, 'QA', 'qa-' || v_tag);
  INSERT INTO public.report_schedules (id, tenant_id, client_id, target_type, table_id)
  VALUES (v_schedule, v_reader, v_client, 'table', v_table);

  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_reader, 'qa-g-' || v_tag || '@g.us', 'QA group') RETURNING id INTO v_group;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_reader, 'qa-s-' || v_tag || '@g.us', 'QA shared') RETURNING id INTO v_shared;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_owner, 'qa-s-' || v_tag || '@g.us', 'QA shared') RETURNING id INTO v_owner_shared;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_reader, 'qa-u-' || v_tag || '@g.us', 'QA unrelated') RETURNING id INTO v_unrelated;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_reader, 'qa-b-' || v_tag || '@g.us', 'QA blocked') RETURNING id INTO v_blocked_group;
  INSERT INTO public.carmen_client_group_access (tenant_id, client_id, whatsapp_group_id) VALUES
    (v_reader, v_client, v_group), (v_reader, v_shared_client, v_shared),
    (v_owner, v_shared_client, v_owner_shared), (v_other, v_other_client, v_unrelated),
    (v_reader, v_client, v_blocked_group);
  INSERT INTO public.blocked_contacts (tenant_id, connection_user_id, group_id)
  VALUES (v_reader, v_line, v_blocked_group);
  INSERT INTO public.blocked_contacts (tenant_id, connection_user_id, sender_phone)
  VALUES (v_reader, v_line, '972' || substr(v_contact, 2));

  INSERT INTO public.chat_messages (tenant_id, provider, connection_user_id, direction,
    message_text, sender_phone, group_id, created_at, send_kind, raw_provider_data)
  VALUES
    -- Group: the client asks, the org line answers (stored on both lines).
    (v_reader, 'green_api', v_line, 'inbound', 'QA ask?', '972' || substr(v_phone, 2), v_group,
      now() - interval '5 hours', NULL, jsonb_build_object('idMessage', 'qa1-' || v_tag)),
    (v_reader, 'green_api', v_line, 'inbound', 'QA org reply (copy)', '972509990000', v_group,
      now() - interval '4 hours', NULL, jsonb_build_object('idMessage', 'qa2-' || v_tag)),
    (v_reader, 'green_api', v_org_line, 'outbound', 'QA org reply', '972509990000', v_group,
      now() - interval '4 hours', NULL, jsonb_build_object('idMessage', 'qa2-' || v_tag)),
    -- Direct chat: the client writes, the line answers from WhatsApp (status row, @lid chat).
    (v_reader, 'green_api', v_line, 'inbound', 'QA dm', '972' || substr(v_phone, 2), NULL,
      now() - interval '5 hours', NULL, '{}'::jsonb),
    (v_reader, 'green_api', v_line, 'outbound', 'QA lid reply', v_lid, NULL,
      now() - interval '4 hours', NULL, jsonb_build_object('idMessage', 'qa5-' || v_tag, 'chatId', v_lid || '@lid')),
    -- Never returned: blocked contact, blocked group, lead, unrelated tenant's group, too old.
    (v_reader, 'green_api', v_line, 'inbound', 'QA BLOCKED DM', '972' || substr(v_contact, 2), NULL,
      now() - interval '3 hours', NULL, '{}'::jsonb),
    (v_reader, 'green_api', v_line, 'inbound', 'QA BLOCKED GROUP', '972501110001', v_blocked_group,
      now() - interval '3 hours', NULL, '{}'::jsonb),
    (v_reader, 'green_api', v_line, 'inbound', 'QA LEAD DM', '972501110003', NULL,
      now() - interval '3 hours', NULL, '{}'::jsonb),
    (v_reader, 'green_api', v_line, 'inbound', 'QA UNRELATED', '972501110004', v_unrelated,
      now() - interval '3 hours', NULL, '{}'::jsonb),
    (v_reader, 'green_api', v_line, 'inbound', 'QA TOO OLD', '972' || substr(v_phone, 2), NULL,
      now() - interval '9 days', NULL, '{}'::jsonb),
    -- The shared group, seen by the reader's line and by the owner tenant's line.
    (v_reader, 'green_api', v_line, 'inbound', 'QA shared', '972501110005', v_shared,
      now() - interval '1 hour', NULL, '{}'::jsonb),
    (v_owner, 'green_api', v_owner_line, 'inbound', 'QA shared (owner)', '972501110005', v_owner_shared,
      now() - interval '1 hour', NULL, '{}'::jsonb);
  -- In the group: a report a person sends from AIOS and a chat send are
  -- replies; a scheduled report and a broadcast are neither a reply nor the
  -- client's.
  INSERT INTO public.chat_messages (tenant_id, provider, connection_user_id, direction,
    message_text, group_id, created_at, send_kind, send_ref, raw_provider_data)
  VALUES
    (v_reader, 'green_api', v_line, 'outbound', 'QA SCHEDULED REPORT', v_group,
      now() - interval '3 hours', 'report', v_schedule::text, jsonb_build_object('idMessage', 'qa3-' || v_tag)),
    (v_reader, 'green_api', v_line, 'outbound', 'QA BROADCAST', v_group,
      now() - interval '170 minutes', 'broadcast', gen_random_uuid()::text, jsonb_build_object('idMessage', 'qa6-' || v_tag)),
    (v_reader, 'green_api', v_line, 'outbound', 'QA report', v_group,
      now() - interval '150 minutes', 'report', v_table::text, jsonb_build_object('idMessage', 'qa7-' || v_tag)),
    (v_reader, 'green_api', v_line, 'outbound', 'QA chat send', v_group,
      now() - interval '2 hours', 'chat', NULL, jsonb_build_object('idMessage', 'qa4-' || v_tag));

  SELECT string_agg(a.message_text || '/' || a.direction, ',' ORDER BY a.thread_key, a.created_at)
  INTO v_texts
  FROM public.get_client_thread_activity(v_reader, ARRAY[v_line, v_org_line], now() - interval '7 days', 'qa_chat', v_kinds) AS a;
  IF v_texts IS DISTINCT FROM 'QA dm/inbound,QA lid reply/outbound,QA ask?/inbound,QA org reply/outbound,QA report/outbound,QA chat send/outbound,QA shared/inbound' THEN
    RAISE EXCEPTION 'activity: client threads only, one copy per message (the sender''s), got %', v_texts;
  END IF;

  -- The owner tenant reads the shared group itself: the reader skips it.
  INSERT INTO public.carmen_round_state (tenant_id, collector, last_run_at, watermark)
  VALUES (v_owner, 'qa_chat', now() - interval '1 hour', jsonb_build_object('read_lines', jsonb_build_array(v_owner_line)));
  SELECT count(*) INTO v_rows
  FROM public.get_client_thread_activity(v_reader, ARRAY[v_line], now() - interval '1 day', 'qa_chat', v_kinds) AS a
  WHERE a.group_id = v_shared;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'shared group: the owner tenant reads it, the reader must not'; END IF;

  -- A stale owner run, or one that read another line, leaves the group to the reader.
  UPDATE public.carmen_round_state SET last_run_at = now() - interval '3 days'
  WHERE tenant_id = v_owner AND collector = 'qa_chat';
  SELECT count(*) INTO v_rows
  FROM public.get_client_thread_activity(v_reader, ARRAY[v_line], now() - interval '1 day', 'qa_chat', v_kinds) AS a
  WHERE a.group_id = v_shared;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'shared group: a stale owner run must not hide it'; END IF;
  UPDATE public.carmen_round_state
  SET last_run_at = now(), watermark = jsonb_build_object('read_lines', jsonb_build_array(gen_random_uuid()))
  WHERE tenant_id = v_owner AND collector = 'qa_chat';
  SELECT count(*) INTO v_rows
  FROM public.get_client_thread_activity(v_reader, ARRAY[v_line], now() - interval '1 day', 'qa_chat', v_kinds) AS a
  WHERE a.group_id = v_shared;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'shared group: an owner that does not read its line there must not hide it'; END IF;

  -- The owner tenant never sees the reader's own client.
  IF EXISTS (SELECT 1 FROM public.get_client_thread_activity(v_owner, ARRAY[v_owner_line, v_line], now() - interval '1 day', 'qa_chat', v_kinds) AS a
             WHERE a.client_id = v_client) THEN
    RAISE EXCEPTION 'isolation: another tenant''s client leaked';
  END IF;

  -- Keyset paging returns whole threads after the given key; another line reads nothing.
  SELECT count(DISTINCT a.thread_key) INTO v_rows
  FROM public.get_client_thread_activity(v_reader, ARRAY[v_line, v_org_line], now() - interval '1 day', 'qa_chat', v_kinds,
    'green_api', NULL, 15, 'dm:' || v_line || ':' || public.phone_match_key(v_phone)) AS a;
  IF v_rows <> 2 THEN RAISE EXCEPTION 'paging: the two group threads come after the direct chat'; END IF;
  IF EXISTS (SELECT 1 FROM public.get_client_thread_activity(v_reader, ARRAY[gen_random_uuid()], now() - interval '1 day', 'qa_chat', v_kinds)) THEN
    RAISE EXCEPTION 'activity: another line must read nothing';
  END IF;

  IF has_function_privilege('anon', 'public.get_client_thread_activity(uuid, uuid[], timestamptz, text, text[], public.chat_provider, uuid[], integer, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_client_thread_activity(uuid, uuid[], timestamptz, text, text[], public.chat_provider, uuid[], integer, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: get_client_thread_activity is service-role only';
  END IF;

  RAISE NOTICE 'carmen_chat_sla: all checks passed';
END;
$test$;
ROLLBACK;
