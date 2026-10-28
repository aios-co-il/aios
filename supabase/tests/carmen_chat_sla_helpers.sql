-- Carmen chat SLA (20261027101000_carmen_chat_sla): get_unlinked_client_groups,
-- carmen_round_llm_spend, carmen_finding_resolve (with the cancel of planned
-- deliveries) and the grants, over a synthetic tenant inside one transaction
-- that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_tenant uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_short uuid := gen_random_uuid();
  v_line uuid := gen_random_uuid();
  v_named uuid;
  v_lookalike uuid;
  v_linked uuid;
  v_round uuid := gen_random_uuid();
  v_finding uuid;
  v_month numeric;
  v_day numeric;
  v_n integer;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES (v_tenant, 'QA', 'qa-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_tenant, 'QA');
  INSERT INTO public.clients (id, tenant_id, agency_id, name, status) VALUES
    (v_client, v_tenant, v_agency, 'QA' || v_tag, 'active'),
    (v_short, v_tenant, v_agency, 'אור', 'active');

  -- Unlinked groups: a whole-word name match is suggested once; a name that
  -- only appears inside a longer word, or a linked group, never is.
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-n-' || v_tag || '@g.us', 'QA' || v_tag || ' - שיווק') RETURNING id INTO v_named;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-l-' || v_tag || '@g.us', 'משפחת אורית') RETURNING id INTO v_lookalike;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-k-' || v_tag || '@g.us', 'QA' || v_tag) RETURNING id INTO v_linked;
  INSERT INTO public.carmen_client_group_access (tenant_id, client_id, whatsapp_group_id)
  VALUES (v_tenant, v_client, v_linked);
  INSERT INTO public.chat_messages (tenant_id, provider, connection_user_id, direction, message_text, group_id)
  SELECT v_tenant, 'green_api', v_line, 'inbound', 'QA ' || n, g
  FROM generate_series(1, 3) AS n, unnest(ARRAY[v_named, v_lookalike, v_linked]) AS g;

  SELECT count(*) INTO v_n
  FROM public.get_unlinked_client_groups(v_tenant, ARRAY[v_line], now() - interval '1 day') AS u
  WHERE u.group_id = v_named AND u.client_id = v_client AND u.message_count = 3;
  IF v_n <> 1 THEN RAISE EXCEPTION 'unlinked: the named group must be suggested once'; END IF;
  IF EXISTS (SELECT 1 FROM public.get_unlinked_client_groups(v_tenant, ARRAY[v_line], now() - interval '1 day') AS u
             WHERE u.group_id IN (v_lookalike, v_linked)) THEN
    RAISE EXCEPTION 'unlinked: a part-word match and a linked group are never suggested';
  END IF;

  -- LLM spend: the month counts every tenant's LLM tables, the day only this
  -- tenant's round sources.
  SELECT s.project_month_usd, s.day_usd INTO v_month, v_day
  FROM public.carmen_round_llm_spend(v_tenant, now() - interval '1 day', now() - interval '1 hour', 'manager_round:') AS s;
  INSERT INTO public.ai_usage_log (tenant_id, source, cost_usd) VALUES
    (v_tenant, 'manager_round:chat', 0.25), (v_tenant, 'aiChat', 0.5), (NULL, 'aiChat', 1),
    (gen_random_uuid(), 'manager_round:chat', 2);
  INSERT INTO public.agent_action_log (tenant_id, cost_usd) VALUES (v_tenant, 4);
  INSERT INTO public.marketing_runs (tenant_id, cost_usd) VALUES (v_tenant, 8);
  SELECT s.project_month_usd - v_month, s.day_usd - v_day INTO v_month, v_day
  FROM public.carmen_round_llm_spend(v_tenant, now() - interval '1 day', now() - interval '1 hour', 'manager_round:') AS s;
  IF v_month <> 15.75 OR v_day <> 0.25 THEN
    RAISE EXCEPTION 'spend: project month % and tenant round day %', v_month, v_day;
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
    jsonb_build_array(jsonb_build_object('kind', 'unanswered_request', 'fingerprint', 'qa-chat-' || v_tag, 'resolution', 'dismissed')));
  IF v_n <> 0 THEN RAISE EXCEPTION 'resolve: a resolution other than answered is skipped'; END IF;
  -- Closing cancels the finding's planned messages; a sent one stays sent.
  SELECT f.id INTO v_finding FROM public.carmen_findings AS f
  WHERE f.tenant_id = v_tenant AND f.fingerprint = 'qa-chat-' || v_tag;
  INSERT INTO public.carmen_finding_deliveries (tenant_id, finding_id, level, recipient_key, channel, slot, status)
  VALUES (v_tenant, v_finding, 0, 'qa-planned', 'in_app', 'now', 'planned'),
    (v_tenant, v_finding, 1, 'qa-sent', 'in_app', 'now', 'sent');
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
  IF (SELECT string_agg(d.recipient_key || '=' || d.status, ',' ORDER BY d.recipient_key)
      FROM public.carmen_finding_deliveries AS d
      WHERE d.tenant_id = v_tenant AND d.finding_id = v_finding)
     IS DISTINCT FROM 'qa-planned=cancelled,qa-sent=sent' THEN
    RAISE EXCEPTION 'resolve: the planned delivery must be cancelled, the sent one kept';
  END IF;

  -- Grants: service role only, the review cache included (plan C6).
  IF has_function_privilege('authenticated', 'public.get_unlinked_client_groups(uuid, uuid[], timestamptz, public.chat_provider, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_round_llm_spend(uuid, timestamptz, timestamptz, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_finding_resolve(uuid, uuid, text, jsonb)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.carmen_chat_thread_reviews', 'SELECT')
     OR has_table_privilege('authenticated', 'public.carmen_chat_thread_reviews', 'SELECT')
     OR has_table_privilege('authenticated', 'public.carmen_chat_thread_reviews', 'INSERT') THEN
    RAISE EXCEPTION 'grants: chat SLA objects must be service-role only';
  END IF;

  RAISE NOTICE 'carmen_chat_sla_helpers: all checks passed';
END;
$test$;
ROLLBACK;
