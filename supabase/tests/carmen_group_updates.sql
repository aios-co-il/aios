-- Group updates to the client card (20261027103000_carmen_group_updates):
-- synthetic groups, messages and findings inside one transaction that is
-- rolled back. Run on a Preview branch or Staging (needs a client with a
-- tenant and a person with a role in that tenant).
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_client uuid;
  v_client2 uuid;
  v_person uuid;
  v_group uuid;
  v_shared uuid;
  v_dm uuid;
  v_round uuid := gen_random_uuid();
  v_finding uuid;
  v_entry uuid;
  v_row record;
  v_count integer;
  v_ok boolean;
  v_failed boolean;
BEGIN
  SELECT c.tenant_id, c.id INTO v_tenant, v_client
  FROM public.clients AS c WHERE c.tenant_id IS NOT NULL ORDER BY c.id LIMIT 1;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Requires a client with a tenant'; END IF;
  SELECT c.id INTO v_client2 FROM public.clients AS c
  WHERE c.tenant_id = v_tenant AND c.id <> v_client ORDER BY c.id LIMIT 1;
  SELECT ur.user_id INTO v_person FROM public.user_roles AS ur
  JOIN public.profiles AS p ON p.id = ur.user_id
  WHERE ur.tenant_id = v_tenant LIMIT 1;
  IF v_person IS NULL THEN RAISE EXCEPTION 'Requires a person with a role in the tenant'; END IF;

  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-r6-linked@g.us', 'QA R6 linked') RETURNING id INTO v_group;
  INSERT INTO public.carmen_client_group_access (tenant_id, client_id, whatsapp_group_id)
  VALUES (v_tenant, v_client, v_group);
  INSERT INTO public.wa_lid_map (lid, phone) VALUES ('77712345678901', '972501234567');

  INSERT INTO public.chat_messages
    (tenant_id, group_id, direction, provider, sender_phone, message_text, created_at)
  VALUES
    (v_tenant, v_group, 'inbound', 'green_api', '972521111111@c.us', 'QA first', now() - interval '3 hours'),
    (v_tenant, v_group, 'inbound', 'green_api', '77712345678901@lid', 'QA lid', now() - interval '2 hours'),
    (v_tenant, v_group, 'outbound', 'green_api', NULL, 'QA reply', now() - interval '1 hour'),
    (v_tenant, v_group, 'inbound', 'green_api', '972521111111@c.us', 'QA old', now() - interval '9 days');
  -- A direct chat of the same client never leaves the function.
  INSERT INTO public.chat_messages
    (tenant_id, client_id, direction, provider, sender_phone, message_text)
  VALUES (v_tenant, v_client, 'inbound', 'green_api', '972521111111@c.us', 'QA DM')
  RETURNING id INTO v_dm;

  -- One row per linked group, oldest first, groups only, senders as match keys.
  SELECT * INTO v_row
  FROM public.get_client_group_digest_messages(v_tenant, now() - interval '1 day')
  WHERE group_id = v_group;
  IF v_row.client_id IS DISTINCT FROM v_client THEN
    RAISE EXCEPTION 'digest: the linked group must belong to its client';
  END IF;
  IF jsonb_array_length(v_row.messages) <> 3
     OR v_row.messages -> 0 ->> 'text' <> 'QA first'
     OR v_row.messages -> 2 ->> 'out' <> 'true' THEN
    RAISE EXCEPTION 'digest: expected the 3 window messages oldest first, got %', v_row.messages;
  END IF;
  IF v_row.messages -> 1 ->> 'key' <> '501234567'
     OR v_row.messages -> 0 ->> 'key' <> '521111111' THEN
    RAISE EXCEPTION 'digest: senders must be match keys, an @lid one mapped';
  END IF;
  IF v_row.messages::text LIKE '%QA DM%' OR v_row.messages::text LIKE '%972%' THEN
    RAISE EXCEPTION 'digest: no direct chat and no raw phone may leave the function';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.get_client_group_digest_messages(v_tenant, now() - interval '1 day', ARRAY[gen_random_uuid()]);
  IF v_count <> 0 THEN RAISE EXCEPTION 'digest: p_client_ids must scope the groups'; END IF;

  -- A group linked to two clients is ambiguous and skipped.
  IF v_client2 IS NOT NULL THEN
    INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
    VALUES (v_tenant, 'qa-r6-shared@g.us', 'QA R6 shared') RETURNING id INTO v_shared;
    INSERT INTO public.carmen_client_group_access (tenant_id, client_id, whatsapp_group_id)
    VALUES (v_tenant, v_client, v_shared), (v_tenant, v_client2, v_shared);
    INSERT INTO public.chat_messages (tenant_id, group_id, direction, provider, message_text)
    VALUES (v_tenant, v_shared, 'inbound', 'green_api', 'QA shared');
    SELECT count(*) INTO v_count
    FROM public.get_client_group_digest_messages(v_tenant, now() - interval '1 day')
    WHERE group_id = v_shared;
    IF v_count <> 0 THEN RAISE EXCEPTION 'digest: an ambiguous group must be skipped'; END IF;
  ELSE
    RAISE NOTICE 'skipped the ambiguous-group check: the tenant has one client';
  END IF;

  -- Closing a finding needs its entry on the finding's client.
  SELECT u.finding_id INTO v_finding
  FROM public.carmen_finding_upsert(v_tenant, v_round, 'group_updates', '1',
    jsonb_build_array(jsonb_build_object('kind', 'card_stale_group',
      'fingerprint', 'qa-r6-fp', 'severity', 'info', 'client_id', v_client,
      'summary_he', 'QA ROLLBACK', 'source_event_at', now(),
      'evidence', '{}'::jsonb))) AS u;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, update_type, source, source_ref)
  VALUES (v_client, v_tenant, v_person, 'QA ROLLBACK', 'group_summary', 'group_digest', 'qa-r6')
  RETURNING id INTO v_entry;

  v_failed := false;
  BEGIN
    PERFORM public.carmen_finding_resolve_card_written(v_tenant, v_finding, gen_random_uuid(), NULL);
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'resolve: an entry of another client must be refused'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.carmen_finding_resolve_card_written(v_tenant, v_finding, v_entry, gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'resolve: an actor outside the tenant must be refused'; END IF;

  v_ok := public.carmen_finding_resolve_card_written(v_tenant, v_finding, v_entry, v_person);
  IF NOT v_ok OR (SELECT status FROM public.carmen_findings WHERE id = v_finding) <> 'resolved'
     OR (SELECT resolution FROM public.carmen_findings WHERE id = v_finding) <> 'fixed' THEN
    RAISE EXCEPTION 'resolve: the approved finding must be resolved as fixed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.carmen_finding_events
    WHERE finding_id = v_finding AND event = 'resolved'
      AND details ->> 'via' = 'card_approved' AND details ->> 'entry_id' = v_entry::text
  ) THEN
    RAISE EXCEPTION 'resolve: the event must name the entry and the approval';
  END IF;
  IF public.carmen_finding_resolve_card_written(v_tenant, v_finding, v_entry, NULL) THEN
    RAISE EXCEPTION 'resolve: a finding no longer live must answer false';
  END IF;

  -- The LLM allowance reads the month and the round's own day.
  INSERT INTO public.ai_usage_log (tenant_id, source, cost_usd, created_at) VALUES
    (v_tenant, 'manager_round:group_updates', 0.25, now()),
    (v_tenant, 'aiChat', 1.00, now()),
    (v_tenant, 'manager_round:group_updates', 9.00, now() - interval '40 days');
  SELECT * INTO v_row FROM public.carmen_round_llm_spend(
    v_tenant, now() - interval '1 hour', now() - interval '1 hour', 'manager_round:');
  IF v_row.month_usd < 1.25 OR v_row.month_usd >= 9 OR v_row.day_usd < 0.25 OR v_row.day_usd >= 1 THEN
    RAISE EXCEPTION 'llm spend: unexpected month % / day %', v_row.month_usd, v_row.day_usd;
  END IF;

  -- Service role only.
  IF has_function_privilege('anon', 'public.get_client_group_digest_messages(uuid, timestamptz, uuid[], integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_client_group_digest_messages(uuid, timestamptz, uuid[], integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_finding_resolve_card_written(uuid, uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_round_llm_spend(uuid, timestamptz, timestamptz, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_client_group_digest_messages(uuid, timestamptz, uuid[], integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: the group digest functions must be service role only';
  END IF;

  RAISE NOTICE 'carmen_group_updates: all checks passed';
END;
$test$;
ROLLBACK;
