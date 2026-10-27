-- Carmen chat SLA (20261027101000_carmen_chat_sla): synthetic chat rows on a
-- made-up line inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_client uuid;
  v_line uuid := gen_random_uuid();
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_linked uuid;
  v_personal uuid;
  v_unlinked uuid;
  v_named_client uuid;
  v_contact text := '05' || lpad((floor(random() * 1e8))::bigint::text, 8, '0');
  v_lid text := '9' || lpad((floor(random() * 1e14))::bigint::text, 14, '0');
  v_round uuid := gen_random_uuid();
  v_texts text;
  v_threads text[];
  v_month numeric;
  v_day numeric;
  v_n integer;
BEGIN
  SELECT c.tenant_id, c.id INTO v_tenant, v_client
  FROM public.clients AS c
  WHERE c.tenant_id IS NOT NULL AND c.status NOT IN ('ended', 'inactive')
  ORDER BY c.id LIMIT 1;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Requires an active client with a tenant'; END IF;

  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-linked-' || v_tag || '@g.us', 'QA linked') RETURNING id INTO v_linked;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-personal-' || v_tag || '@g.us', 'QA family') RETURNING id INTO v_personal;
  INSERT INTO public.carmen_client_group_access (tenant_id, client_id, whatsapp_group_id)
  VALUES (v_tenant, v_client, v_linked);
  INSERT INTO public.client_contacts (tenant_id, client_id, contact_name, phone)
  VALUES (v_tenant, v_client, 'QA contact', v_contact);
  INSERT INTO public.wa_lid_map (lid, phone, source)
  VALUES (v_lid, '0509999990', 'qa');

  INSERT INTO public.chat_messages (tenant_id, provider, connection_user_id, direction,
    message_text, sender_phone, group_id, created_at, raw_provider_data)
  VALUES
    (v_tenant, 'green_api', v_line, 'inbound', 'QA request?', '972501110001', v_linked,
      now() - interval '5 hours', jsonb_build_object('idMessage', 'qa1-' || v_tag)),
    (v_tenant, 'green_api', v_line, 'inbound', 'QA request?', '972501110001', v_linked,
      now() - interval '5 hours', jsonb_build_object('idMessage', 'qa1-' || v_tag)),
    (v_tenant, 'green_api', v_line, 'inbound', 'QA lid reply', v_lid, v_linked,
      now() - interval '4 hours', jsonb_build_object('idMessage', 'qa2-' || v_tag,
        'senderData', jsonb_build_object('sender', v_lid || '@lid'))),
    (v_tenant, 'green_api', v_line, 'inbound', 'QA PERSONAL GROUP', '972501110002', v_personal,
      now() - interval '3 hours', '{}'::jsonb),
    (v_tenant, 'green_api', v_line, 'inbound', 'QA contact dm', v_contact, NULL,
      now() - interval '3 hours', '{}'::jsonb),
    (v_tenant, 'green_api', v_line, 'inbound', 'QA PERSONAL DM', '972501110003', NULL,
      now() - interval '3 hours', '{}'::jsonb),
    (v_tenant, 'green_api', v_line, 'inbound', 'QA TOO OLD', v_contact, NULL,
      now() - interval '9 days', '{}'::jsonb);

  -- Only client threads leave: the linked group (once per idMessage, the
  -- @lid sender mapped) and the contact's direct chat.
  SELECT string_agg(a.message_text, ',' ORDER BY a.created_at),
         array_agg(DISTINCT a.thread_key)
  INTO v_texts, v_threads
  FROM public.get_client_thread_activity(v_tenant, ARRAY[v_line], now() - interval '30 days') AS a;
  IF v_texts IS DISTINCT FROM 'QA request?,QA lid reply,QA contact dm' THEN
    RAISE EXCEPTION 'activity: only client threads, got %', v_texts;
  END IF;
  IF NOT v_threads @> ARRAY['group:qa-linked-' || v_tag || '@g.us',
       'dm:' || v_line || ':' || public.phone_match_key(v_contact)] THEN
    RAISE EXCEPTION 'activity: thread keys %', v_threads;
  END IF;
  IF (SELECT a.sender_match_key FROM public.get_client_thread_activity(v_tenant, ARRAY[v_line], now() - interval '1 day') AS a
      WHERE a.message_text = 'QA lid reply') IS DISTINCT FROM '509999990' THEN
    RAISE EXCEPTION 'activity: an @lid sender must be mapped through wa_lid_map';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_client_thread_activity(v_tenant, ARRAY[gen_random_uuid()], now() - interval '1 day')) THEN
    RAISE EXCEPTION 'activity: another line must read nothing';
  END IF;

  -- Unlinked groups: a group named after exactly one client is suggested.
  SELECT c.id INTO v_named_client
  FROM public.clients AS c
  WHERE c.tenant_id = v_tenant AND c.status NOT IN ('ended', 'inactive')
    AND length(btrim(c.name)) >= 3
    AND NOT EXISTS (
      SELECT 1 FROM public.clients AS o
      WHERE o.id <> c.id AND o.status NOT IN ('ended', 'inactive')
        AND length(btrim(o.name)) >= 3
        AND (o.tenant_id = v_tenant OR EXISTS (
          SELECT 1 FROM public.agency_tenant_access AS ata
          WHERE ata.agency_id = o.agency_id AND ata.accessing_tenant_id = v_tenant))
        AND position(lower(btrim(o.name)) IN lower('QA ' || c.name)) > 0)
  LIMIT 1;
  IF v_named_client IS NOT NULL THEN
    INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
    SELECT v_tenant, 'qa-unlinked-' || v_tag || '@g.us', 'QA ' || c.name
    FROM public.clients AS c WHERE c.id = v_named_client
    RETURNING id INTO v_unlinked;
    INSERT INTO public.chat_messages (tenant_id, provider, connection_user_id, direction, message_text, group_id)
    SELECT v_tenant, 'green_api', v_line, 'inbound', 'QA unlinked ' || n, v_unlinked
    FROM generate_series(1, 3) AS n;
    SELECT count(*) INTO v_n
    FROM public.get_unlinked_client_groups(v_tenant, ARRAY[v_line], now() - interval '1 day') AS u
    WHERE u.group_id = v_unlinked AND u.client_id = v_named_client AND u.message_count = 3;
    IF v_n <> 1 THEN RAISE EXCEPTION 'unlinked: the named group must be suggested once'; END IF;
  ELSE
    RAISE NOTICE 'unlinked: no uniquely named client, check skipped';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_unlinked_client_groups(v_tenant, ARRAY[v_line], now() - interval '1 day') AS u
             WHERE u.group_id IN (v_linked, v_personal)) THEN
    RAISE EXCEPTION 'unlinked: linked and unmatched groups are never suggested';
  END IF;

  -- LLM spend: the month counts every source, the day only the round's.
  SELECT s.month_usd, s.day_usd INTO v_month, v_day
  FROM public.carmen_round_llm_spend(v_tenant, now() - interval '1 day', now() - interval '1 hour', 'manager_round:') AS s;
  INSERT INTO public.ai_usage_log (tenant_id, source, cost_usd)
  VALUES (v_tenant, 'manager_round:chat', 0.25), (v_tenant, 'aiChat', 0.5);
  IF (SELECT s.month_usd - v_month FROM public.carmen_round_llm_spend(v_tenant, now() - interval '1 day', now() - interval '1 hour', 'manager_round:') AS s) <> 0.75
     OR (SELECT s.day_usd - v_day FROM public.carmen_round_llm_spend(v_tenant, now() - interval '1 day', now() - interval '1 hour', 'manager_round:') AS s) <> 0.25 THEN
    RAISE EXCEPTION 'spend: month and day sums';
  END IF;

  -- Resolve: only the collector's own live findings, logged with the details.
  PERFORM public.carmen_finding_upsert(v_tenant, v_round, 'qa_chat', '1', jsonb_build_array(
    jsonb_build_object('kind', 'unanswered_request', 'fingerprint', 'qa-chat-' || v_tag,
      'severity', 'warning', 'client_id', v_client, 'summary_he', 'QA ROLLBACK',
      'source_event_at', now(), 'evidence', '{}'::jsonb)));
  SELECT count(*) INTO v_n FROM public.carmen_finding_resolve(v_tenant, v_round, 'other_collector',
    jsonb_build_array(jsonb_build_object('kind', 'unanswered_request', 'fingerprint', 'qa-chat-' || v_tag, 'resolution', 'answered')));
  IF v_n <> 0 THEN RAISE EXCEPTION 'resolve: another collector''s finding must stay open'; END IF;
  SELECT count(*) INTO v_n FROM public.carmen_finding_resolve(v_tenant, v_round, 'qa_chat',
    jsonb_build_array(jsonb_build_object('kind', 'unanswered_request', 'fingerprint', 'qa-chat-' || v_tag,
      'resolution', 'answered', 'details', jsonb_build_object('response_minutes', 42))));
  IF v_n <> 1 THEN RAISE EXCEPTION 'resolve: the finding must close'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.carmen_findings AS f
    JOIN public.carmen_finding_events AS e ON e.finding_id = f.id AND e.event = 'resolved'
    WHERE f.tenant_id = v_tenant AND f.fingerprint = 'qa-chat-' || v_tag
      AND f.status = 'resolved' AND f.resolution = 'answered'
      AND e.details = '{"response_minutes": 42, "resolution": "answered"}'::jsonb) THEN
    RAISE EXCEPTION 'resolve: status, resolution and event details';
  END IF;

  -- Grants: service role only, and the review cache is read-only for owners.
  IF has_function_privilege('anon', 'public.get_client_thread_activity(uuid, uuid[], timestamptz, public.chat_provider, uuid[], integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_client_thread_activity(uuid, uuid[], timestamptz, public.chat_provider, uuid[], integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_unlinked_client_groups(uuid, uuid[], timestamptz, public.chat_provider, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_round_llm_spend(uuid, timestamptz, timestamptz, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_finding_resolve(uuid, uuid, text, jsonb)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.carmen_chat_thread_reviews', 'SELECT')
     OR has_table_privilege('authenticated', 'public.carmen_chat_thread_reviews', 'INSERT') THEN
    RAISE EXCEPTION 'grants: chat SLA objects must be service-role only';
  END IF;

  RAISE NOTICE 'carmen_chat_sla: all checks passed';
END;
$test$;
ROLLBACK;
