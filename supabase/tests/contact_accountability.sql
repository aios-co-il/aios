-- Contact accountability (20261027102000_contact_accountability): synthetic
-- calls, card entries and a finding inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_client uuid;
  v_member uuid;
  v_call uuid;
  v_since timestamptz := now() - interval '14 days';
  v_call_at timestamptz := now() - interval '2 hours';
  v_row record;
  v_finding uuid;
  v_outcome text;
  v_resolved boolean;
  v_message text;
  v_logged_before timestamptz;
BEGIN
  SELECT c.tenant_id INTO v_tenant
  FROM public.clients AS c
  WHERE c.status = 'active'
    AND EXISTS (SELECT 1 FROM public.tenant_users AS tu WHERE tu.tenant_id = c.tenant_id)
  ORDER BY c.id LIMIT 1;
  SELECT e.client_id INTO v_client
  FROM public.get_client_contact_evidence(v_tenant, v_since) AS e LIMIT 1;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Requires a client the tenant follows up'; END IF;
  SELECT tu.user_id INTO v_member FROM public.tenant_users AS tu
  WHERE tu.tenant_id = v_tenant ORDER BY tu.created_at LIMIT 1;

  -- Only clients the tenant reaches: its own, or of an agency shared with it.
  IF EXISTS (
    SELECT 1
    FROM public.get_client_contact_evidence(v_tenant, v_since) AS e
    JOIN public.clients AS c ON c.id = e.client_id
    WHERE c.tenant_id IS DISTINCT FROM v_tenant
      AND NOT EXISTS (
        SELECT 1 FROM public.agency_tenant_access AS ata
        WHERE ata.agency_id = c.agency_id AND ata.accessing_tenant_id = v_tenant)
  ) THEN
    RAISE EXCEPTION 'scope: another tenant''s client must never be returned';
  END IF;

  -- Everything before 3 hours ago is logged.
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content,
    update_type, source, created_at)
  VALUES (v_client, v_tenant, v_member, 'QA ROLLBACK', 'call', 'human',
    now() - interval '3 hours');

  -- A call the PBX could not attribute waits to be logged and names nobody.
  INSERT INTO public.call_logs (tenant_id, client_id, caller_user_id, to_number,
    status, duration, provider, caller_resolution, created_at)
  VALUES (v_tenant, v_client, v_member, '0500000000', 'completed', 120, 'pbx',
    'fallback', v_call_at)
  RETURNING id INTO v_call;
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client]);
  IF v_row.unlogged_call_id IS DISTINCT FROM v_call
     OR v_row.unlogged_call_user_id IS NOT NULL
     OR v_row.unlogged_call_user_name IS NOT NULL THEN
    RAISE EXCEPTION 'evidence: a fallback call must not name the fallback user';
  END IF;

  -- A mapped extension names the caller. Later calls (real or too short)
  -- move the last contact but not the oldest call waiting to be logged.
  UPDATE public.call_logs SET caller_resolution = 'extension' WHERE id = v_call;
  INSERT INTO public.call_logs (tenant_id, client_id, caller_user_id, to_number,
    status, duration, provider, created_at)
  VALUES
    (v_tenant, v_client, v_member, '0500000000', 'completed', 20, 'pbx', now() - interval '1 hour'),
    (v_tenant, v_client, v_member, '0500000000', 'no-answer', 300, 'pbx', now() - interval '1 hour'),
    (v_tenant, v_client, v_member, '0500000000', 'completed', 90, 'pbx', now() - interval '30 minutes');
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client]);
  IF v_row.unlogged_call_id IS DISTINCT FROM v_call
     OR v_row.unlogged_call_user_id IS DISTINCT FROM v_member
     OR v_row.last_contact_at < now() - interval '30 minutes' THEN
    RAISE EXCEPTION 'evidence: the oldest unlogged call and its mapped caller must stay';
  END IF;

  -- A system send never logs the call; a call Carmen logged at a person's request does.
  v_logged_before := v_row.last_log_at;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content,
    update_type, source, created_at)
  VALUES (v_client, v_tenant, v_member, 'QA ROLLBACK', 'call', 'system_send', now());
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client]);
  IF v_row.last_log_at IS DISTINCT FROM v_logged_before
     OR v_row.unlogged_call_id IS DISTINCT FROM v_call THEN
    RAISE EXCEPTION 'evidence: a system_send entry must not count as a log';
  END IF;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content,
    update_type, source, source_ref, counts_as_contact, created_at)
  VALUES (v_client, v_tenant, v_member, 'QA ROLLBACK', 'call', 'carmen_confirmed',
    'qa-rollback', true, now());
  SELECT * INTO v_row
  FROM public.get_client_contact_evidence(v_tenant, v_since, 60, ARRAY[v_client]);
  IF v_row.last_log_at IS DISTINCT FROM now() OR v_row.unlogged_call_id IS NOT NULL THEN
    RAISE EXCEPTION 'evidence: a carmen_confirmed call must log every earlier call';
  END IF;

  -- Resolving through Carmen closes the finding and its planned messages once.
  SELECT u.finding_id, u.outcome INTO v_finding, v_outcome
  FROM public.carmen_finding_upsert(v_tenant, gen_random_uuid(), 'contact', '1',
    jsonb_build_array(jsonb_build_object('kind', 'contact_not_logged',
      'fingerprint', 'qa-rollback-call', 'severity', 'warning',
      'client_id', v_client, 'summary_he', 'QA ROLLBACK',
      'source_event_at', v_call_at, 'evidence', '{}'::jsonb))) AS u;
  IF v_outcome <> 'inserted' THEN RAISE EXCEPTION 'resolve: setup upsert failed'; END IF;
  INSERT INTO public.carmen_finding_deliveries (tenant_id, finding_id, level,
    recipient_key, channel, slot, status)
  VALUES (v_tenant, v_finding, 0, 'user:qa', 'manus_wa', 'list', 'planned');
  BEGIN
    PERFORM public.carmen_finding_resolve_confirmed(v_tenant, v_finding, gen_random_uuid());
    RAISE EXCEPTION 'resolve: a stranger must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'actor_not_in_tenant' THEN RAISE; END IF;
  END;
  v_resolved := public.carmen_finding_resolve_confirmed(v_tenant, v_finding, v_member, 'QA');
  IF NOT v_resolved
     OR (SELECT f.status || ':' || f.resolution FROM public.carmen_findings AS f
         WHERE f.id = v_finding) <> 'resolved:fixed'
     OR EXISTS (SELECT 1 FROM public.carmen_finding_deliveries AS d
                WHERE d.finding_id = v_finding AND d.status <> 'cancelled')
     OR NOT EXISTS (SELECT 1 FROM public.carmen_finding_events AS e
                    WHERE e.finding_id = v_finding AND e.event = 'resolved'
                      AND e.actor_user_id = v_member) THEN
    RAISE EXCEPTION 'resolve: the finding must be resolved, its plans cancelled and the actor recorded';
  END IF;
  IF public.carmen_finding_resolve_confirmed(v_tenant, v_finding, v_member) THEN
    RAISE EXCEPTION 'resolve: a resolved finding must not be resolved twice';
  END IF;

  -- Evidence and resolution are service-role only.
  IF has_function_privilege('authenticated', 'public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_finding_resolve_confirmed(uuid, uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.carmen_finding_resolve_confirmed(uuid, uuid, uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: contact evidence and resolution are service role only';
  END IF;
END
$test$;
ROLLBACK;
