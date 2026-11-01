-- Staging or a Preview branch only.
-- Contact evidence (20261101102000_contact_accountability): a new client with
-- synthetic messages, calls, meetings and card entries inside one transaction
-- that is rolled back, so real data never changes the answers.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_agency uuid;
  v_member uuid;
  v_client uuid;
  v_campaigner uuid;
  v_other_tenant uuid;
  v_other_agency uuid;
  v_shared uuid;
  v_group uuid;
  v_other_group uuid;
  v_call uuid;
  v_zoom uuid;
  v_row record;
  v_since timestamptz := now() - interval '14 days';
  v_contact_since timestamptz := now() - interval '28 days';
  v_chat text := 'qa-' || gen_random_uuid() || '@g.us';
  v_meeting text := 'qa-' || gen_random_uuid();
BEGIN
  SELECT c.tenant_id, c.agency_id INTO v_tenant, v_agency
  FROM public.clients AS c
  WHERE c.status = 'active'
    AND EXISTS (SELECT 1 FROM public.tenant_users AS tu WHERE tu.tenant_id = c.tenant_id)
  ORDER BY c.id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant with an active client and a user'; END IF;
  SELECT tu.user_id INTO v_member FROM public.tenant_users AS tu
  WHERE tu.tenant_id = v_tenant ORDER BY tu.created_at LIMIT 1;
  SELECT a.tenant_id, a.id INTO v_other_tenant, v_other_agency
  FROM public.agencies AS a WHERE a.tenant_id IS DISTINCT FROM v_tenant ORDER BY a.id LIMIT 1;

  INSERT INTO public.clients (tenant_id, agency_id, name, status, created_at)
  VALUES (v_tenant, v_agency, 'QA ROLLBACK contact', 'active', now() - interval '400 days')
  RETURNING id INTO v_client;
  INSERT INTO public.campaigners (tenant_id, full_name, phone, active)
  VALUES (v_tenant, 'QA ROLLBACK', '050-765-4321', true) RETURNING id INTO v_campaigner;
  INSERT INTO public.client_team (client_id, campaigner_id) VALUES (v_client, v_campaigner);
  UPDATE public.profiles SET campaigner_id = v_campaigner WHERE id = v_member;

  -- Only clients whose card the tenant may write: its own, or of an agency shared read_write.
  IF EXISTS (
    SELECT 1 FROM public.get_client_contact_evidence(v_tenant, v_since, 60) AS e
    JOIN public.clients AS c ON c.id = e.client_id
    WHERE c.tenant_id IS DISTINCT FROM v_tenant AND NOT EXISTS (
      SELECT 1 FROM public.agency_tenant_access AS ata
      WHERE ata.agency_id = c.agency_id AND ata.accessing_tenant_id = v_tenant
        AND ata.source_tenant_id = c.tenant_id AND ata.access_level = 'read_write')
  ) THEN
    RAISE EXCEPTION 'scope: another tenant''s client must never be returned';
  END IF;

  -- Messages. The client's group is the tenant's own copy of the group the client
  -- links to, even when the link is another tenant's row (an agency share).
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, v_chat, 'QA ROLLBACK') RETURNING id INTO v_group;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  SELECT v_other_tenant, v_chat, 'QA ROLLBACK' WHERE v_other_tenant IS NOT NULL
  RETURNING id INTO v_other_group;
  UPDATE public.clients SET whatsapp_group_id = coalesce(v_other_group, v_group) WHERE id = v_client;
  INSERT INTO public.wa_lid_map (lid, phone) VALUES ('99887766554433', '972507654321');
  INSERT INTO public.chat_messages (tenant_id, group_id, client_id, direction, message_text,
    provider, sender_phone, connection_user_id, raw_provider_data, created_at)
  VALUES
    (v_tenant, v_group, NULL, 'inbound', 'QA', 'green_api', '972521111111', NULL,
      '{"senderData": {"sender": "972521111111@c.us"}}', now() - interval '1 day'),
    (v_tenant, NULL, v_client, 'outbound', 'QA', 'green_api', '972521111111', v_member,
      '{"typeWebhook": "outgoingAPIMessageReceived"}', now() - interval '15 days'),
    (v_tenant, v_group, NULL, 'inbound', 'QA', 'green_api', '11223344556677', NULL,
      '{"senderData": {"sender": "11223344556677@lid"}}', now() - interval '16 days');
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client], v_contact_since);
  IF v_row.client_id IS DISTINCT FROM v_client OR v_row.last_contact_at IS NOT NULL THEN
    RAISE EXCEPTION 'messages: the client, an API echo and an unmapped @lid are not the campaigner';
  END IF;
  INSERT INTO public.chat_messages (tenant_id, group_id, direction, message_text,
    provider, sender_phone, raw_provider_data, created_at)
  VALUES (v_tenant, v_group, 'inbound', 'QA', 'green_api', '972507654321',
    '{"senderData": {"sender": "972507654321@c.us"}}', now() - interval '20 days');
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client], v_contact_since);
  IF v_row.last_contact_at IS DISTINCT FROM now() - interval '20 days' THEN
    RAISE EXCEPTION 'messages: a group reply from the campaigner''s phone is contact';
  END IF;
  IF (SELECT e.last_contact_at FROM public.get_client_contact_evidence(
        v_tenant, v_since, 60, ARRAY[v_client]) AS e) IS NOT NULL THEN
    RAISE EXCEPTION 'messages: without p_contact_since the window is p_since';
  END IF;
  INSERT INTO public.chat_messages (tenant_id, group_id, direction, message_text,
    provider, sender_phone, raw_provider_data, created_at)
  VALUES (v_tenant, v_group, 'inbound', 'QA', 'green_api', '99887766554433',
    '{"senderData": {"sender": "99887766554433@lid"}}', now() - interval '19 days');
  INSERT INTO public.chat_messages (tenant_id, group_id, direction, message_text,
    provider, sender_phone, raw_provider_data, created_at)
  SELECT v_other_tenant, v_other_group, 'inbound', 'QA', 'green_api'::public.chat_provider,
    '972507654321', '{"senderData": {"sender": "972507654321@c.us"}}'::jsonb, now() - interval '2 days'
  WHERE v_other_group IS NOT NULL;
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client], v_contact_since);
  IF v_row.last_contact_at IS DISTINCT FROM now() - interval '19 days' THEN
    RAISE EXCEPTION 'messages: a reply from an @lid mapped to the campaigner counts; another tenant''s copy does not';
  END IF;
  INSERT INTO public.chat_messages (tenant_id, client_id, direction, message_text,
    provider, sender_phone, connection_user_id, raw_provider_data, created_at)
  VALUES (v_tenant, v_client, 'outbound', 'QA', 'green_api', '972521111111', v_member,
    '{"typeWebhook": "outgoingMessageReceived"}', now() - interval '18 days');
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client], v_contact_since);
  IF v_row.last_contact_at IS DISTINCT FROM now() - interval '18 days' THEN
    RAISE EXCEPTION 'messages: a message typed on their own connected phone counts';
  END IF;

  -- Calls. A log covers a call written from 30 minutes before it started: a
  -- call logged while it ran (the PBX row lands when it ends) is not unlogged.
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content,
    update_type, source, created_at)
  VALUES (v_client, v_tenant, v_member, 'QA ROLLBACK', 'call', 'human', now() - interval '3 hours');
  INSERT INTO public.call_logs (tenant_id, client_id, caller_user_id, to_number,
    status, duration, provider, caller_resolution, created_at)
  VALUES (v_tenant, v_client, v_member, '0500000000', 'completed', 600, 'pbx',
    'extension', now() - interval '3 hours' + interval '4 minutes');
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client], v_contact_since);
  IF v_row.unlogged_call_id IS NOT NULL
     OR v_row.last_contact_at IS DISTINCT FROM now() - interval '3 hours' + interval '4 minutes' THEN
    RAISE EXCEPTION 'calls: a call logged while it ran is logged';
  END IF;

  -- A fallback call names nobody; an extension or click-to-call names a member only.
  INSERT INTO public.call_logs (tenant_id, client_id, caller_user_id, to_number,
    status, duration, provider, caller_resolution, created_at)
  VALUES (v_tenant, v_client, v_member, '0500000000', 'completed', 120, 'pbx',
    'fallback', now() - interval '2 hours')
  RETURNING id INTO v_call;
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client]);
  IF v_row.unlogged_call_id IS DISTINCT FROM v_call OR v_row.unlogged_call_user_id IS NOT NULL
     OR v_row.unlogged_call_user_name IS NOT NULL THEN
    RAISE EXCEPTION 'calls: a fallback call must not name the fallback user';
  END IF;
  UPDATE public.call_logs SET caller_resolution = 'click_to_call' WHERE id = v_call;
  IF (SELECT e.unlogged_call_user_id FROM public.get_client_contact_evidence(
        v_tenant, v_since, 60, ARRAY[v_client]) AS e) IS DISTINCT FROM v_member THEN
    RAISE EXCEPTION 'calls: a click-to-call names the person who started it';
  END IF;
  UPDATE public.call_logs
  SET caller_resolution = 'extension', caller_user_id = gen_random_uuid() WHERE id = v_call;
  IF (SELECT e.unlogged_call_user_id FROM public.get_client_contact_evidence(
        v_tenant, v_since, 60, ARRAY[v_client]) AS e) IS NOT NULL THEN
    RAISE EXCEPTION 'calls: a mapped user outside the tenant is not named';
  END IF;
  UPDATE public.call_logs SET caller_user_id = v_member WHERE id = v_call;

  -- Later calls (real or too short) move the last contact, not the oldest unlogged call.
  INSERT INTO public.call_logs (tenant_id, client_id, caller_user_id, to_number,
    status, duration, provider, created_at)
  VALUES
    (v_tenant, v_client, v_member, '0500000000', 'completed', 20, 'pbx', now() - interval '1 hour'),
    (v_tenant, v_client, v_member, '0500000000', 'no-answer', 300, 'pbx', now() - interval '1 hour'),
    (v_tenant, v_client, v_member, '0500000000', 'completed', 90, 'pbx', now() - interval '30 minutes');
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client]);
  IF v_row.unlogged_call_id IS DISTINCT FROM v_call OR v_row.unlogged_call_user_id IS DISTINCT FROM v_member
     OR v_row.last_contact_at IS DISTINCT FROM now() - interval '30 minutes' THEN
    RAISE EXCEPTION 'calls: the oldest unlogged call and its caller must stay';
  END IF;

  -- Meetings. One Zoom meeting is several recording files: one meeting, the
  -- file with the summary, the same key every run. A bot meeting is compared
  -- with when it started; an internal meeting is not client contact.
  INSERT INTO public.meeting_bot_sessions (tenant_id, client_id, meeting_url, platform,
    status, joined_at, ended_at)
  VALUES (v_tenant, v_client, 'https://qa.invalid', 'zoom', 'done',
    now() - interval '2 hours 40 minutes', now() - interval '2 hours 10 minutes');
  INSERT INTO public.zoom_recordings (tenant_id, client_id, meeting_id, recording_type,
    start_time, duration, summary_scope)
  VALUES (v_tenant, v_client, v_meeting || '-internal', 'audio_only',
    now() - interval '2 hours 20 minutes', 10, 'campaigner');
  INSERT INTO public.zoom_recordings (tenant_id, client_id, meeting_id, recording_type,
    start_time, duration, summary_md)
  VALUES
    (v_tenant, v_client, v_meeting, 'shared_screen', now() - interval '2 hours', 30, NULL),
    (v_tenant, v_client, v_meeting, 'audio_only', now() - interval '2 hours', 30, '## QA'),
    (v_tenant, v_client, v_meeting, 'chat_file', now() - interval '2 hours', 30, NULL);
  SELECT r.id INTO v_zoom FROM public.zoom_recordings AS r
  WHERE r.meeting_id = v_meeting AND r.summary_md IS NOT NULL;
  FOR i IN 1..2 LOOP
    SELECT * INTO v_row
    FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client]);
    IF v_row.unlogged_meeting_key IS DISTINCT FROM 'zoom:' || v_meeting
       OR v_row.unlogged_meeting_id IS DISTINCT FROM v_zoom
       OR v_row.unlogged_meeting_summary IS DISTINCT FROM '## QA'
       OR v_row.unlogged_meeting_at IS DISTINCT FROM now() - interval '90 minutes' THEN
      RAISE EXCEPTION 'meetings: one Zoom meeting, its summary file, dated when it ended';
    END IF;
  END LOOP;

  -- A system send never logs; a call Carmen logged at a person's request logs everything before it.
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content,
    update_type, source, created_at)
  VALUES (v_client, v_tenant, v_member, 'QA ROLLBACK', 'call', 'system_send', now());
  IF (SELECT e.unlogged_call_id FROM public.get_client_contact_evidence(
        v_tenant, v_since, 60, ARRAY[v_client]) AS e) IS DISTINCT FROM v_call THEN
    RAISE EXCEPTION 'logs: a system_send entry must not count as a log';
  END IF;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content,
    update_type, source, source_ref, counts_as_contact, created_at)
  VALUES (v_client, v_tenant, v_member, 'QA ROLLBACK', 'call', 'carmen_confirmed',
    'qa-rollback', true, now());
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client]);
  IF v_row.last_log_at IS DISTINCT FROM now() OR v_row.unlogged_call_id IS NOT NULL
     OR v_row.unlogged_meeting_id IS NOT NULL THEN
    RAISE EXCEPTION 'logs: a carmen_confirmed call must log every earlier contact';
  END IF;

  -- An agency shared read-only is not followed up: its card cannot be written.
  IF v_other_agency IS NULL THEN
    RAISE NOTICE 'skipped the shared-agency scope check: no second tenant with an agency';
  ELSE
    INSERT INTO public.clients (tenant_id, agency_id, name, status)
    VALUES (v_other_tenant, v_other_agency, 'QA ROLLBACK shared', 'active')
    RETURNING id INTO v_shared;
    INSERT INTO public.client_team (client_id, campaigner_id) VALUES (v_shared, v_campaigner);
    INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
    VALUES (v_other_tenant, v_other_agency, v_tenant, 'read_only')
    ON CONFLICT (source_tenant_id, agency_id, accessing_tenant_id)
      DO UPDATE SET access_level = 'read_only';
    IF EXISTS (SELECT 1 FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_shared])) THEN
      RAISE EXCEPTION 'scope: a read-only share is not followed up';
    END IF;
    UPDATE public.agency_tenant_access SET access_level = 'read_write'
    WHERE source_tenant_id = v_other_tenant AND agency_id = v_other_agency AND accessing_tenant_id = v_tenant;
    IF NOT EXISTS (SELECT 1 FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_shared])) THEN
      RAISE EXCEPTION 'scope: a read-write share staffed by the tenant is followed up';
    END IF;
  END IF;

  -- Service role only.
  IF has_function_privilege('authenticated', 'public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[], timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[], timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[], timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: contact evidence is service role only';
  END IF;
END
$test$;
ROLLBACK;
