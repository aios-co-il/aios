-- Group updates to the client card (20261101103000_carmen_group_updates):
-- carmen_finding_role_of, carmen_finding_resolve_card_written and
-- carmen_round_llm_spend inside one transaction that is rolled back. Run on a
-- Preview branch or Staging (needs a client whose tenant has an owner).
-- carmen_group_updates.sql covers get_client_group_digest_messages.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_client uuid;
  v_person uuid;
  v_member uuid;
  v_round uuid := gen_random_uuid();
  v_finding uuid;
  v_entry uuid;
  v_row record;
  v_ok boolean;
  v_failed boolean;
BEGIN
  SELECT c.tenant_id, c.id, ur.user_id INTO v_tenant, v_client, v_person
  FROM public.clients AS c
  JOIN public.user_roles AS ur
    ON ur.tenant_id = c.tenant_id AND ur.role IN ('owner', 'agency_owner')
  JOIN public.profiles AS p ON p.id = ur.user_id
  ORDER BY c.id LIMIT 1;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Requires a client whose tenant has an owner';
  END IF;

  -- One rule: the feed's caller rule is carmen_finding_role_of for auth.uid().
  IF public.carmen_finding_role_of(v_person, v_tenant, v_client, NULL) IS DISTINCT FROM 'owner'
     OR public.carmen_finding_role_of(gen_random_uuid(), v_tenant, v_client, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'role: an owner is owner and a stranger has no role';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_person::text, true);
  IF public.carmen_finding_viewer_role(v_tenant, v_client, NULL) IS DISTINCT FROM 'owner'
     OR NOT public.carmen_manager_is_owner(v_tenant) THEN
    RAISE EXCEPTION 'role: the feed must read the same rule for the caller';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF public.carmen_manager_is_owner(v_tenant) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'role: no caller is no owner (false, not NULL)';
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

  -- A member of the tenant who cannot see the finding may not approve it.
  SELECT ur.user_id INTO v_member FROM public.user_roles AS ur
  WHERE ur.tenant_id = v_tenant
    AND public.carmen_finding_role_of(ur.user_id, v_tenant, v_client, NULL) IS NULL
  LIMIT 1;
  IF v_member IS NULL THEN
    RAISE NOTICE 'resolve: member-without-access case skipped (every member sees the client)';
  ELSE
    v_failed := false;
    BEGIN
      PERFORM public.carmen_finding_resolve_card_written(v_tenant, v_finding, v_entry, v_member);
    EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
    END;
    IF NOT v_failed THEN RAISE EXCEPTION 'resolve: a member who cannot see the finding must be refused'; END IF;
  END IF;

  INSERT INTO public.carmen_finding_deliveries (tenant_id, finding_id, level,
    recipient_key, channel, slot, status)
  VALUES (v_tenant, v_finding, 0, 'qa:r6', 'manus_wa', 'now', 'planned');

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
  IF EXISTS (
    SELECT 1 FROM public.carmen_finding_deliveries
    WHERE tenant_id = v_tenant AND finding_id = v_finding AND status = 'planned'
  ) THEN
    RAISE EXCEPTION 'resolve: the finding''s planned messages must be cancelled';
  END IF;
  IF public.carmen_finding_resolve_card_written(v_tenant, v_finding, v_entry, NULL) THEN
    RAISE EXCEPTION 'resolve: a finding no longer live must answer false';
  END IF;

  -- The card is shared: an entry another tenant wrote on the client closes it.
  SELECT u.finding_id INTO v_finding
  FROM public.carmen_finding_upsert(v_tenant, v_round, 'group_updates', '1',
    jsonb_build_array(jsonb_build_object('kind', 'card_stale_group',
      'fingerprint', 'qa-r6-fp-shared', 'severity', 'info', 'client_id', v_client,
      'summary_he', 'QA ROLLBACK', 'source_event_at', now(),
      'evidence', '{}'::jsonb))) AS u;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, update_type, source, source_ref)
  SELECT v_client, t.id, v_person, 'QA ROLLBACK', 'group_summary', 'group_digest', 'qa-r6-shared'
  FROM public.tenants AS t WHERE t.id <> v_tenant ORDER BY t.id LIMIT 1
  RETURNING id INTO v_entry;
  IF v_entry IS NULL THEN
    RAISE NOTICE 'resolve: shared-card case skipped (needs a second tenant)';
  ELSIF NOT public.carmen_finding_resolve_card_written(v_tenant, v_finding, v_entry, NULL) THEN
    RAISE EXCEPTION 'resolve: an entry on the shared card must close the finding';
  END IF;

  -- The LLM allowance reads the project's month and the tenant round's day.
  INSERT INTO public.ai_usage_log (tenant_id, source, cost_usd, created_at) VALUES
    (v_tenant, 'manager_round:group_updates', 0.25, now()),
    (v_tenant, 'aiChat', 1.00, now()),
    (v_tenant, 'manager_round:group_updates', 9.00, now() - interval '40 days');
  SELECT * INTO v_row FROM public.carmen_round_llm_spend(
    v_tenant, now() - interval '1 hour', now() - interval '1 hour', 'manager_round:');
  IF v_row.project_month_usd < 1.25 OR v_row.day_usd < 0.25 OR v_row.day_usd >= 1 THEN
    RAISE EXCEPTION 'llm spend: unexpected month % / day %', v_row.project_month_usd, v_row.day_usd;
  END IF;

  -- Service role only.
  IF has_function_privilege('authenticated', 'public.carmen_finding_resolve_card_written(uuid, uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.carmen_finding_resolve_card_written(uuid, uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_round_llm_spend(uuid, timestamptz, timestamptz, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_finding_role_of(uuid, uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_manager_is_owner_of(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.carmen_finding_viewer_role(uuid, uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.carmen_finding_role_of(uuid, uuid, uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.carmen_finding_resolve_card_written(uuid, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: the new functions are service role only, the feed rule stays callable';
  END IF;

  RAISE NOTICE 'carmen_group_updates_resolve: all checks passed';
END;
$test$;
ROLLBACK;
