-- Client card system-send log (20261026136000_client_card_system_send_log):
-- Staging only. Synthetic chat_messages and report_deliveries rows on
-- existing clients inside one transaction that is rolled back. Nothing is
-- sent to anyone: the rows only exercise the triggers that write client card
-- entries.
BEGIN;

-- Turns a tenant's card logging switch on or off for this transaction.
CREATE FUNCTION pg_temp.qa_card_log(p_tenant uuid, p_on boolean)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  UPDATE public.tenant_heartbeat_settings AS s
  SET pulse_alert_rules = coalesce(s.pulse_alert_rules, '{}'::jsonb)
    || jsonb_build_object('manager', jsonb_build_object('card_log_system_sends', p_on))
  WHERE s.tenant_id = p_tenant;
  IF NOT FOUND THEN
    INSERT INTO public.tenant_heartbeat_settings (tenant_id, pulse_alert_rules)
    VALUES (p_tenant, jsonb_build_object('manager', jsonb_build_object('card_log_system_sends', p_on)));
  END IF;
END;
$fn$;

-- The system_send card entries with one source_ref.
CREATE FUNCTION pg_temp.qa_entries(p_ref text)
RETURNS SETOF public.client_updates
LANGUAGE sql
AS $fn$
  SELECT * FROM public.client_updates AS u
  WHERE u.source = 'system_send' AND u.source_ref = p_ref
$fn$;

DO $test$
DECLARE
  v_tenant uuid;
  v_other_tenant uuid;
  v_other_owner uuid;
  v_owner uuid;
  v_member uuid;
  v_super uuid;
  v_client uuid;
  v_client_b uuid;
  v_agency uuid;
  v_group uuid;
  v_shared_group uuid;
  v_delivery uuid;
  v_msg uuid;
  v_echo uuid;
  v_broadcast uuid := gen_random_uuid();
  v_target uuid := gen_random_uuid();
  v_day timestamptz := '2031-03-04 10:00:00+02';
  v_day_ref text := '2031-03-04';
  v_tag text := 'QA ROLLBACK ' || gen_random_uuid();
  v_id_message text;
  v_fn text;
  v_kind text;
  v_entry public.client_updates%ROWTYPE;
  v_count integer;
BEGIN
  -- An owner (not a super admin) whose home tenant has an agency client and a
  -- second client.
  SELECT ur.user_id, ur.tenant_id INTO v_owner, v_tenant
  FROM public.user_roles AS ur
  JOIN public.profiles AS p ON p.id = ur.user_id
  WHERE ur.role = 'owner'::public.app_role
    AND public.get_user_tenant_id(ur.user_id) = ur.tenant_id
    AND NOT public.is_super_admin(ur.user_id)
    AND EXISTS (
      SELECT 1 FROM public.clients AS c
      WHERE c.tenant_id = ur.tenant_id AND c.agency_id IS NOT NULL
    )
    AND (SELECT count(*) FROM public.clients AS c WHERE c.tenant_id = ur.tenant_id) >= 2
  LIMIT 1;

  SELECT c.id, c.agency_id INTO v_client, v_agency
  FROM public.clients AS c
  WHERE c.tenant_id = v_tenant AND c.agency_id IS NOT NULL
  ORDER BY c.created_at, c.id
  LIMIT 1;

  SELECT c.id INTO v_client_b
  FROM public.clients AS c
  WHERE c.tenant_id = v_tenant AND c.id <> v_client
  ORDER BY c.created_at, c.id
  LIMIT 1;

  -- Another member of the same tenant, with a profile.
  SELECT tu.user_id INTO v_member
  FROM public.tenant_users AS tu
  JOIN public.profiles AS p ON p.id = tu.user_id
  WHERE tu.tenant_id = v_tenant
    AND tu.user_id <> v_owner
    AND public.get_user_tenant_id(tu.user_id) = v_tenant
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;

  SELECT ur.user_id INTO v_super
  FROM public.user_roles AS ur
  JOIN public.profiles AS p ON p.id = ur.user_id
  WHERE ur.role = 'super_admin'::public.app_role
    AND ur.tenant_id IS NULL
  LIMIT 1;

  -- A second tenant, with an owner (not a super admin) at home in it, and no
  -- agency access to or from the first one.
  SELECT ur.tenant_id, ur.user_id INTO v_other_tenant, v_other_owner
  FROM public.user_roles AS ur
  JOIN public.profiles AS p ON p.id = ur.user_id
  WHERE ur.role = 'owner'::public.app_role
    AND ur.tenant_id <> v_tenant
    AND public.get_user_tenant_id(ur.user_id) = ur.tenant_id
    AND NOT public.is_super_admin(ur.user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.agency_tenant_access AS ata
      WHERE (ata.accessing_tenant_id = ur.tenant_id AND ata.source_tenant_id = v_tenant)
        OR (ata.accessing_tenant_id = v_tenant AND ata.source_tenant_id = ur.tenant_id)
    )
  LIMIT 1;

  IF v_owner IS NULL OR v_client_b IS NULL OR v_member IS NULL
    OR v_super IS NULL OR v_other_owner IS NULL THEN
    RAISE EXCEPTION 'Requires an owner tenant with an agency client and a second client, another member, a super admin and a second tenant with its own owner';
  END IF;

  -- Grants: none of the new functions is callable through the API.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.whatsapp_group_link_tenant_ok(uuid, uuid)',
    'public.whatsapp_group_client_ids(uuid)',
    'public.resolve_whatsapp_group_client(uuid)',
    'public.client_card_logs_system_sends(uuid)',
    'public.client_card_profile_or_null(uuid)',
    'public.log_report_delivery_on_client_card()',
    'public.log_system_send_on_client_card()',
    'public.merge_green_api_send_echo()',
    'public.client_updates_keep_owner()'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
      OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon or authenticated', v_fn;
    END IF;
  END LOOP;

  -- Groups: one linked to a single client, one shared by two (ambiguous).
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-' || gen_random_uuid() || '@g.us', v_tag || ' group')
  RETURNING id INTO v_group;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-' || gen_random_uuid() || '@g.us', v_tag || ' shared')
  RETURNING id INTO v_shared_group;
  INSERT INTO public.carmen_client_group_access (tenant_id, client_id, whatsapp_group_id)
  VALUES
    (v_tenant, v_client, v_group),
    (v_tenant, v_client, v_shared_group),
    (v_tenant, v_client_b, v_shared_group);
  IF public.resolve_whatsapp_group_client(v_group) IS DISTINCT FROM v_client
    OR public.resolve_whatsapp_group_client(v_shared_group) IS NOT NULL THEN
    RAISE EXCEPTION 'A group of one client must resolve and a shared group must not';
  END IF;

  -- Switch off (the default): a report delivery and a chat send write nothing.
  PERFORM pg_temp.qa_card_log(v_tenant, false);
  INSERT INTO public.report_deliveries (tenant_id, client_id, target_type, target_id, channels, status, details)
  VALUES (v_tenant, v_client, 'table', gen_random_uuid(), ARRAY['whatsapp'], 'sent', jsonb_build_object('title', v_tag))
  RETURNING id INTO v_delivery;
  INSERT INTO public.chat_messages (tenant_id, client_id, direction, message_text, sent_by_user_id, send_kind, created_at)
  VALUES (v_tenant, v_client, 'outbound', v_tag, v_owner, 'chat', v_day);
  IF EXISTS (SELECT 1 FROM pg_temp.qa_entries(v_delivery::text))
    OR EXISTS (SELECT 1 FROM pg_temp.qa_entries('chat:' || v_tenant || ':' || v_client || ':dm:' || v_day_ref)) THEN
    RAISE EXCEPTION 'The switch is off but a card entry was written';
  END IF;

  PERFORM pg_temp.qa_card_log(v_tenant, true);

  -- report_deliveries 'sent': one report_sent entry listing both channels,
  -- with the table id and without the public share link.
  INSERT INTO public.report_deliveries (tenant_id, client_id, target_type, target_id, channels, status, details)
  VALUES (v_tenant, v_client, 'table', v_target, ARRAY['whatsapp', 'email'], 'sent',
    jsonb_build_object('title', v_tag || ' report', 'share_url', 'https://aios.co.il/shared/table/qa'))
  RETURNING id INTO v_delivery;
  SELECT * INTO v_entry FROM pg_temp.qa_entries(v_delivery::text);
  IF NOT FOUND OR v_entry.update_type <> 'report_sent' OR v_entry.tenant_id <> v_tenant
    OR v_entry.content <> 'דוח "' || v_tag || ' report" נשלח ללקוח בוואטסאפ ובאימייל'
    OR v_entry.counts_as_contact IS TRUE THEN
    RAISE EXCEPTION 'A sent report was not logged as one report_sent entry: %', v_entry;
  END IF;
  IF v_entry.metadata ? 'share_url'
    OR v_entry.metadata::text LIKE '%shared/table/qa%'
    OR v_entry.metadata ->> 'target_type' IS DISTINCT FROM 'table'
    OR v_entry.metadata ->> 'target_id' IS DISTINCT FROM v_target::text THEN
    RAISE EXCEPTION 'A report entry kept the share link or lost its table id: %', v_entry.metadata;
  END IF;

  -- 'partial': only the channel that went out, and says some failed.
  INSERT INTO public.report_deliveries (tenant_id, client_id, target_type, target_id, channels, status, details)
  VALUES (v_tenant, v_client, 'table', gen_random_uuid(), ARRAY['whatsapp'], 'partial', jsonb_build_object('title', v_tag))
  RETURNING id INTO v_delivery;
  SELECT * INTO v_entry FROM pg_temp.qa_entries(v_delivery::text);
  IF NOT FOUND OR v_entry.content NOT LIKE '%נשלח ללקוח בוואטסאפ. חלק מהערוצים נכשלו%' THEN
    RAISE EXCEPTION 'A partial report was not logged as partial: %', v_entry;
  END IF;

  -- 'failed': nothing.
  INSERT INTO public.report_deliveries (tenant_id, client_id, target_type, target_id, channels, status, details)
  VALUES (v_tenant, v_client, 'table', gen_random_uuid(), ARRAY['whatsapp'], 'failed', jsonb_build_object('title', v_tag))
  RETURNING id INTO v_delivery;
  IF EXISTS (SELECT 1 FROM pg_temp.qa_entries(v_delivery::text)) THEN
    RAISE EXCEPTION 'A failed delivery was logged';
  END IF;

  -- A meeting summary: its date follows the quoted title; no share link.
  INSERT INTO public.report_deliveries (tenant_id, client_id, target_type, target_id, channels, status, details)
  VALUES (v_tenant, v_client, 'meeting_summary', gen_random_uuid(), ARRAY['email'], 'sent',
    jsonb_build_object('title', v_tag, 'meeting_date', '26.10.2026',
      'share_url', 'https://aios.co.il/shared/summary/qa'))
  RETURNING id INTO v_delivery;
  SELECT * INTO v_entry FROM pg_temp.qa_entries(v_delivery::text);
  IF NOT FOUND OR v_entry.update_type <> 'meeting_summary_sent'
    OR v_entry.content <> 'סיכום הפגישה "' || v_tag || '" (26.10.2026) נשלח ללקוח באימייל'
    OR v_entry.metadata ? 'share_url' THEN
    RAISE EXCEPTION 'A meeting summary was not logged with its date and without its link: %', v_entry;
  END IF;

  -- Broadcast: one entry per broadcast per client, however many messages.
  INSERT INTO public.chat_messages (tenant_id, client_id, direction, message_text, sent_by_user_id, send_kind, send_ref)
  VALUES
    (v_tenant, v_client, 'outbound', v_tag, v_owner, 'broadcast', v_broadcast::text),
    (v_tenant, v_client, 'outbound', v_tag, v_owner, 'broadcast', v_broadcast::text),
    (v_tenant, v_client_b, 'outbound', v_tag, v_owner, 'broadcast', v_broadcast::text);
  IF (SELECT count(*) FROM pg_temp.qa_entries('broadcast:' || v_broadcast || ':' || v_client)) <> 1
    OR (SELECT count(*) FROM pg_temp.qa_entries('broadcast:' || v_broadcast || ':' || v_client_b)) <> 1 THEN
    RAISE EXCEPTION 'A broadcast left other than one entry per client';
  END IF;

  -- Chat: three sends on one Israel day leave one counted entry, no text.
  INSERT INTO public.chat_messages (tenant_id, client_id, direction, message_text, sent_by_user_id, send_kind, created_at)
  VALUES
    (v_tenant, v_client, 'outbound', v_tag, v_owner, 'chat', v_day),
    (v_tenant, v_client, 'outbound', v_tag, v_owner, 'chat', v_day + interval '1 hour'),
    (v_tenant, v_client, 'outbound', v_tag, v_owner, 'chat', v_day + interval '2 hours');
  SELECT * INTO v_entry
  FROM pg_temp.qa_entries('chat:' || v_tenant || ':' || v_client || ':dm:' || v_day_ref);
  IF NOT FOUND OR v_entry.update_type <> 'whatsapp_sent'
    OR (v_entry.metadata ->> 'count')::integer <> 3
    OR v_entry.content LIKE '%' || v_tag || '%' THEN
    RAISE EXCEPTION 'Three chat sends did not leave one counted entry without text: %', v_entry;
  END IF;

  -- Chat per sending tenant: a tenant without access to the client writes
  -- nothing; with agency read_write access it counts on its own entry.
  PERFORM pg_temp.qa_card_log(v_other_tenant, true);
  INSERT INTO public.chat_messages (tenant_id, client_id, direction, message_text, sent_by_user_id, send_kind, created_at)
  VALUES (v_other_tenant, v_client, 'outbound', v_tag, v_owner, 'chat', v_day);
  IF EXISTS (SELECT 1 FROM pg_temp.qa_entries('chat:' || v_other_tenant || ':' || v_client || ':dm:' || v_day_ref)) THEN
    RAISE EXCEPTION 'A tenant without access to the client wrote its card';
  END IF;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (v_tenant, v_agency, v_other_tenant, 'read_write');
  INSERT INTO public.chat_messages (tenant_id, client_id, direction, message_text, sent_by_user_id, send_kind, created_at)
  VALUES (v_other_tenant, v_client, 'outbound', v_tag, v_owner, 'chat', v_day + interval '3 hours');
  SELECT * INTO v_entry
  FROM pg_temp.qa_entries('chat:' || v_other_tenant || ':' || v_client || ':dm:' || v_day_ref);
  IF NOT FOUND OR v_entry.tenant_id <> v_other_tenant
    OR (v_entry.metadata ->> 'count')::integer <> 1 THEN
    RAISE EXCEPTION 'The agency tenant did not count its send on its own entry: %', v_entry;
  END IF;
  SELECT (u.metadata ->> 'count')::integer INTO v_count
  FROM pg_temp.qa_entries('chat:' || v_tenant || ':' || v_client || ':dm:' || v_day_ref) AS u;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'The agency send changed the client tenant''s count to %', v_count;
  END IF;

  -- Groups: a group shared by two clients writes nothing; a group of one
  -- client logs Carmen's message, cut at 300 characters.
  INSERT INTO public.chat_messages (tenant_id, group_id, direction, message_text, sent_by_user_id, send_kind)
  VALUES (v_tenant, v_shared_group, 'outbound', v_tag, v_owner, 'automation')
  RETURNING id INTO v_msg;
  IF EXISTS (SELECT 1 FROM pg_temp.qa_entries('automation:' || v_msg)) THEN
    RAISE EXCEPTION 'A send to an ambiguous group was logged';
  END IF;
  INSERT INTO public.chat_messages (tenant_id, group_id, direction, message_text, sent_by_user_id, send_kind)
  VALUES (v_tenant, v_group, 'outbound', v_tag || ' ' || repeat('א', 400), v_owner, 'carmen')
  RETURNING id INTO v_msg;
  SELECT * INTO v_entry FROM pg_temp.qa_entries('carmen:' || v_msg);
  IF NOT FOUND OR v_entry.client_id <> v_client OR v_entry.update_type <> 'carmen_message'
    OR v_entry.content NOT LIKE 'כרמן שלחה ללקוח הודעת וואטסאפ בקבוצה "' || v_tag || ' group"%…' THEN
    RAISE EXCEPTION 'Carmen''s group message was not logged on the group''s client: %', v_entry;
  END IF;

  -- A signed-in token logs only chat, as the token's person: broadcast,
  -- carmen and automation rows it writes are never logged.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  FOREACH v_kind IN ARRAY ARRAY['broadcast', 'carmen', 'automation'] LOOP
    INSERT INTO public.chat_messages (tenant_id, client_id, direction, message_text, sent_by_user_id, send_kind, send_ref)
    VALUES (v_tenant, v_client, 'outbound', v_tag, v_owner, v_kind, gen_random_uuid()::text)
    RETURNING id INTO v_msg;
    IF EXISTS (
      SELECT 1 FROM public.client_updates AS u
      WHERE u.client_id = v_client
        AND u.source = 'system_send'
        AND u.metadata ->> 'chat_message_id' = v_msg::text
    ) THEN
      RAISE EXCEPTION 'A signed-in token logged a % entry', v_kind;
    END IF;
  END LOOP;
  INSERT INTO public.chat_messages (tenant_id, client_id, direction, message_text, sent_by_user_id, send_kind, created_at)
  VALUES (v_tenant, v_client_b, 'outbound', v_tag, v_owner, 'chat', v_day);
  SELECT * INTO v_entry
  FROM pg_temp.qa_entries('chat:' || v_tenant || ':' || v_client_b || ':dm:' || v_day_ref);
  IF NOT FOUND OR v_entry.user_id <> v_member THEN
    RAISE EXCEPTION 'A browser chat send was not attributed to the signed-in person: %', v_entry;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Green API, send first: the echo is dropped and the send is logged once.
  v_id_message := 'QA' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.chat_messages
    (tenant_id, client_id, direction, message_text, sent_by_user_id, connection_user_id, provider, send_kind, raw_provider_data)
  VALUES (v_tenant, v_client, 'outbound', v_tag, v_owner, v_owner, 'green_api', 'automation',
    jsonb_build_object('idMessage', v_id_message, 'automation', true, 'team_forward', 'pending'))
  RETURNING id INTO v_msg;
  INSERT INTO public.chat_messages (tenant_id, direction, message_text, connection_user_id, provider, raw_provider_data)
  VALUES (v_tenant, 'outbound', v_tag, v_owner, 'green_api',
    jsonb_build_object('typeWebhook', 'outgoingAPIMessageReceived', 'idMessage', v_id_message))
  RETURNING id INTO v_echo;
  SELECT count(*) INTO v_count
  FROM public.chat_messages AS m
  WHERE m.tenant_id = v_tenant AND m.raw_provider_data ->> 'idMessage' = v_id_message;
  IF v_echo IS NOT NULL OR v_count <> 1
    OR (SELECT count(*) FROM pg_temp.qa_entries('automation:' || v_msg)) <> 1 THEN
    RAISE EXCEPTION 'Send then echo left % rows', v_count;
  END IF;

  -- Green API, echo first: the send's kind is stamped on the echo's row,
  -- which gains the client and is logged once.
  v_id_message := 'QA' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.chat_messages (tenant_id, direction, message_text, connection_user_id, provider, raw_provider_data)
  VALUES (v_tenant, 'outbound', v_tag, v_owner, 'green_api',
    jsonb_build_object('typeWebhook', 'outgoingAPIMessageReceived', 'idMessage', v_id_message))
  RETURNING id INTO v_echo;
  INSERT INTO public.chat_messages
    (tenant_id, client_id, direction, message_text, sent_by_user_id, connection_user_id, provider, send_kind, raw_provider_data)
  VALUES (v_tenant, v_client, 'outbound', v_tag, v_owner, v_owner, 'green_api', 'automation',
    jsonb_build_object('idMessage', v_id_message, 'automation', true, 'team_forward', 'pending'))
  RETURNING id INTO v_msg;
  SELECT count(*) INTO v_count
  FROM public.chat_messages AS m
  WHERE m.tenant_id = v_tenant AND m.raw_provider_data ->> 'idMessage' = v_id_message;
  IF v_msg IS NOT NULL OR v_count <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public.chat_messages AS m
      WHERE m.id = v_echo AND m.send_kind = 'automation' AND m.client_id = v_client
    )
    OR (SELECT count(*) FROM pg_temp.qa_entries('automation:' || v_echo)) <> 1 THEN
    RAISE EXCEPTION 'Echo then send left % rows or no single logged entry', v_count;
  END IF;

  -- RLS: the browser inserts human rows only, super admins included, and
  -- anyone else only as themselves. An author edits the text of an entry but
  -- never moves it to another client or org (both targets are writable, so
  -- only client_updates_keep_owner stops the move).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source)
  VALUES (v_client, v_tenant, v_owner, v_tag || ' owner human', 'human');
  UPDATE public.client_updates AS u
  SET content = v_tag || ' owner human edited'
  WHERE u.content = v_tag || ' owner human';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'An author could not edit their own entry';
  END IF;
  BEGIN
    UPDATE public.client_updates AS u
    SET client_id = v_client_b
    WHERE u.content = v_tag || ' owner human edited';
    RAISE EXCEPTION 'An author moved an entry to another client';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.client_updates AS u
    SET tenant_id = v_other_tenant
    WHERE u.content = v_tag || ' owner human edited';
    RAISE EXCEPTION 'An author moved an entry to another org';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source)
    VALUES (v_client, v_tenant, v_owner, v_tag || ' owner system', 'system_send');
    RAISE EXCEPTION 'An owner inserted a system_send row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source)
    VALUES (v_client, v_tenant, v_member, v_tag || ' owner as member', 'human');
    RAISE EXCEPTION 'An owner inserted a row attributed to another person';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source)
  VALUES (v_client, v_tenant, v_super, v_tag || ' super admin human', 'human');
  BEGIN
    INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source)
    VALUES (v_client, v_tenant, v_super, v_tag || ' super admin system', 'system_send');
    RAISE EXCEPTION 'A super admin inserted a system_send row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- RLS on the shared card: another org writes or edits a human row on the
  -- client only with read_write agency access, never with read_only access
  -- or after the access is revoked (the chat section above granted
  -- read_write).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source, update_type)
  VALUES (v_client, v_other_tenant, v_other_owner, v_tag || ' read_write partner', 'human', 'call');
  UPDATE public.client_updates AS u
  SET content = v_tag || ' read_write partner edited'
  WHERE u.content = v_tag || ' read_write partner';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'A read_write agency partner could not edit its own entry';
  END IF;
  BEGIN
    INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source, update_type)
    VALUES (v_client, v_other_tenant, v_owner, v_tag || ' partner as owner', 'human', 'call');
    RAISE EXCEPTION 'A partner inserted a row attributed to the client org''s person';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  UPDATE public.agency_tenant_access AS ata
  SET access_level = 'read_only'
  WHERE ata.accessing_tenant_id = v_other_tenant
    AND ata.source_tenant_id = v_tenant
    AND ata.agency_id = v_agency;
  -- Its later chat send no longer counts on the entry it wrote while it had
  -- read_write access.
  INSERT INTO public.chat_messages (tenant_id, client_id, direction, message_text, sent_by_user_id, send_kind, created_at)
  VALUES (v_other_tenant, v_client, 'outbound', v_tag, v_other_owner, 'chat', v_day + interval '4 hours');
  SELECT (u.metadata ->> 'count')::integer INTO v_count
  FROM pg_temp.qa_entries('chat:' || v_other_tenant || ':' || v_client || ':dm:' || v_day_ref) AS u;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'A read_only partner''s chat send counted on the shared card (count %)', v_count;
  END IF;
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source, update_type)
    VALUES (v_client, v_other_tenant, v_other_owner, v_tag || ' read_only partner', 'human', 'call');
    RAISE EXCEPTION 'A read_only agency partner inserted a row on the shared card';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.client_updates AS u
    SET content = v_tag || ' read_only edit'
    WHERE u.content = v_tag || ' read_write partner edited';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE EXCEPTION 'A read_only agency partner changed % entries on the shared card', v_count;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  DELETE FROM public.agency_tenant_access AS ata
  WHERE ata.accessing_tenant_id = v_other_tenant
    AND ata.source_tenant_id = v_tenant
    AND ata.agency_id = v_agency;
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source, update_type)
    VALUES (v_client, v_other_tenant, v_other_owner, v_tag || ' revoked partner', 'human', 'call');
    RAISE EXCEPTION 'A tenant whose access was revoked inserted a row on the client''s card';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '', true);
END;
$test$;
SELECT 'Grants, switch, report deliveries without share links, broadcast, chat counts, groups, browser tokens, Green API echo merge, insert and update RLS (author, read_write, read_only, revoked) and no entry moves passed' AS result;
ROLLBACK;
