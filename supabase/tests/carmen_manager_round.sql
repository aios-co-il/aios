-- Carmen manager round (20261101100000_carmen_manager_round): synthetic
-- findings inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_client uuid;
  v_other_client uuid;
  v_other_agency uuid;
  v_other_tenant uuid;
  v_member uuid;
  v_planned uuid;
  v_stranger uuid := gen_random_uuid();
  v_round uuid := gen_random_uuid();
  v_finding uuid;
  v_code integer;
  v_outcome text;
  v_delivery uuid;
  v_rules jsonb;
  v_stamp text;
  v_message text;
  v_outcomes text;
  v_codes integer[];
  cand jsonb;
BEGIN
  SELECT c.tenant_id, c.id INTO v_tenant, v_client
  FROM public.clients AS c WHERE c.tenant_id IS NOT NULL ORDER BY c.id LIMIT 1;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Requires a client with a tenant'; END IF;
  SELECT c.id INTO v_other_client FROM public.clients AS c
  WHERE c.tenant_id IS DISTINCT FROM v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.agency_tenant_access AS ata
      WHERE ata.agency_id = c.agency_id AND ata.accessing_tenant_id = v_tenant)
  LIMIT 1;

  cand := jsonb_build_object('kind', 'data_gap', 'fingerprint', 'qa-rollback-fp',
    'severity', 'warning', 'client_id', v_client, 'summary_he', 'QA ROLLBACK',
    'source_event_at', now(), 'evidence', '{}'::jsonb);

  -- Dedupe: the same condition is one live row; severity only rises.
  SELECT u.finding_id, u.short_code, u.outcome INTO v_finding, v_code, v_outcome
  FROM public.carmen_finding_upsert(v_tenant, v_round, 'qa', '1', jsonb_build_array(cand)) AS u;
  IF v_outcome <> 'inserted' OR v_code IS NULL THEN RAISE EXCEPTION 'upsert: first candidate must insert'; END IF;
  SELECT u.outcome INTO v_outcome
  FROM public.carmen_finding_upsert(v_tenant, v_round, 'qa', '1', jsonb_build_array(cand)) AS u;
  IF v_outcome <> 'seen' THEN RAISE EXCEPTION 'upsert: same fingerprint must only be bumped'; END IF;
  SELECT u.outcome INTO v_outcome
  FROM public.carmen_finding_upsert(v_tenant, v_round, 'qa', '1',
    jsonb_build_array(cand || '{"severity": "critical"}')) AS u;
  IF v_outcome <> 'worsened'
     OR (SELECT next_action_at FROM public.carmen_findings WHERE id = v_finding) IS NULL THEN
    RAISE EXCEPTION 'upsert: a worse severity must re-route the finding';
  END IF;
  IF (SELECT occurrence_count FROM public.carmen_findings WHERE id = v_finding) <> 3 THEN
    RAISE EXCEPTION 'upsert: occurrences must be counted';
  END IF;

  -- One call stores a whole batch: new findings take consecutive codes and
  -- a 'detected' event each; a repeat in the batch, a summary or fingerprint
  -- over the table's limits and a bad severity are reported, not stored.
  SELECT string_agg(u.outcome, ',' ORDER BY u.ord),
         array_agg(u.short_code ORDER BY u.ord) FILTER (WHERE u.outcome = 'inserted')
    INTO v_outcomes, v_codes
  FROM public.carmen_finding_upsert(v_tenant, v_round, 'qa', '1', jsonb_build_array(
    cand || '{"fingerprint": "qa-batch-1"}',
    cand || '{"fingerprint": "qa-batch-2"}',
    cand || '{"fingerprint": "qa-batch-1"}',
    cand || jsonb_build_object('fingerprint', 'qa-batch-3', 'summary_he', repeat('x', 501)),
    cand || jsonb_build_object('fingerprint', repeat('f', 301)),
    cand || '{"fingerprint": "qa-batch-4", "severity": "urgent"}',
    cand || '{"fingerprint": "qa-rollback-fp"}'
  )) WITH ORDINALITY AS u(finding_id, kind, fingerprint, short_code, outcome, ord);
  IF v_outcomes IS DISTINCT FROM 'inserted,inserted,duplicate,invalid,invalid,invalid,seen'
     OR v_codes[2] <> v_codes[1] + 1 THEN
    RAISE EXCEPTION 'upsert batch: got % with codes %', v_outcomes, v_codes;
  END IF;
  IF (SELECT count(*) FROM public.carmen_finding_events AS e
      JOIN public.carmen_findings AS f ON f.id = e.finding_id
      WHERE f.fingerprint IN ('qa-batch-1', 'qa-batch-2') AND e.event = 'detected') <> 2 THEN
    RAISE EXCEPTION 'upsert batch: one detected event per new finding expected';
  END IF;

  -- Another tenant's client is never written into this tenant.
  IF v_other_client IS NOT NULL THEN
    SELECT u.outcome INTO v_outcome
    FROM public.carmen_finding_upsert(v_tenant, v_round, 'qa', '1',
      jsonb_build_array(cand || jsonb_build_object('client_id', v_other_client, 'fingerprint', 'qa-x'))) AS u;
    IF v_outcome <> 'rejected_client' THEN RAISE EXCEPTION 'upsert: foreign client must be rejected'; END IF;
  END IF;

  -- Nor another tenant's agency, when the candidate names no client.
  SELECT a.id INTO v_other_agency FROM public.agencies AS a
  WHERE a.tenant_id IS DISTINCT FROM v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.agency_tenant_access AS ata
      WHERE ata.agency_id = a.id AND ata.accessing_tenant_id = v_tenant)
  LIMIT 1;
  IF v_other_agency IS NOT NULL THEN
    SELECT u.outcome INTO v_outcome
    FROM public.carmen_finding_upsert(v_tenant, v_round, 'qa', '1',
      jsonb_build_array(cand || jsonb_build_object('client_id', NULL,
        'agency_id', v_other_agency, 'fingerprint', 'qa-agency'))) AS u;
    IF v_outcome <> 'rejected_agency' THEN RAISE EXCEPTION 'upsert: foreign agency must be rejected'; END IF;
  END IF;

  -- A stranger cannot see, probe or change the finding.
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  BEGIN
    PERFORM public.carmen_finding_set_status(v_finding, 'acknowledged', NULL, NULL);
    RAISE EXCEPTION 'Expected rejection';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'finding_not_found' THEN RAISE EXCEPTION 'set_status: stranger got %', v_message; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- Routing: first plan per (finding, level, recipient) wins; claims are
  -- single; a first routing is not an escalation, moving up a level is.
  PERFORM public.carmen_finding_apply_route(v_tenant, v_round, jsonb_build_array(
    jsonb_build_object('finding_id', v_finding, 'status', 'notified', 'escalation_level', 0,
      'deliveries', jsonb_build_array(jsonb_build_object('level', 0, 'recipient_key', 'qa:one',
        'channel', 'manus_wa', 'slot', 'now', 'status', 'planned', 'not_before', now() - interval '1 minute')))));
  PERFORM public.carmen_finding_apply_route(v_tenant, v_round, jsonb_build_array(
    jsonb_build_object('finding_id', v_finding, 'status', 'notified', 'escalation_level', 1,
      'deliveries', jsonb_build_array(jsonb_build_object('level', 0, 'recipient_key', 'qa:one',
        'channel', 'manus_wa', 'slot', 'now', 'status', 'planned')))));
  IF (SELECT count(*) FROM public.carmen_finding_deliveries WHERE finding_id = v_finding) <> 1
     OR (SELECT count(*) FROM public.carmen_finding_events WHERE finding_id = v_finding AND event = 'escalated') <> 1 THEN
    RAISE EXCEPTION 'apply_route: one delivery row and one escalation event expected';
  END IF;
  SELECT d.id INTO v_delivery FROM public.carmen_finding_claim_deliveries(v_tenant, 500) AS d
  WHERE d.finding_id = v_finding;
  IF v_delivery IS NULL OR EXISTS (
    SELECT 1 FROM public.carmen_finding_claim_deliveries(v_tenant, 500) AS d WHERE d.finding_id = v_finding) THEN
    RAISE EXCEPTION 'claim: a due row is claimed exactly once';
  END IF;
  PERFORM public.carmen_finding_record_send(v_tenant, ARRAY[v_delivery], 'sent', gen_random_uuid(), 'qa-msg', NULL, NULL);
  IF (SELECT status FROM public.carmen_finding_deliveries WHERE id = v_delivery) <> 'sent'
     OR NOT EXISTS (SELECT 1 FROM public.carmen_finding_events WHERE finding_id = v_finding AND event = 'notified') THEN
    RAISE EXCEPTION 'record_send: outcome and notified event expected';
  END IF;

  -- Delivery keys carry the tenant, and a delivery or event can only point at
  -- a finding of its own tenant, so no writer can plan into or rewrite
  -- another tenant's row. A throwaway tenant keeps this check running on a
  -- database with one tenant.
  IF EXISTS (
    SELECT 1 FROM pg_index AS i
    WHERE i.indrelid = 'public.carmen_finding_deliveries'::regclass
      AND i.indisunique AND NOT i.indisprimary
      AND NOT EXISTS (
        SELECT 1 FROM pg_attribute AS a
        WHERE a.attrelid = i.indrelid AND a.attname = 'tenant_id'
          AND a.attnum = ANY (i.indkey::smallint[]))) THEN
    RAISE EXCEPTION 'deliveries: every unique key must include tenant_id';
  END IF;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA rollback tenant', 'qa-rollback-' || gen_random_uuid())
  RETURNING id INTO v_other_tenant;
  BEGIN
    INSERT INTO public.carmen_finding_deliveries (tenant_id, finding_id, level,
      recipient_key, channel, slot, status)
    VALUES (v_other_tenant, v_finding, 0, 'qa:one', 'manus_wa', 'now', 'planned');
    RAISE EXCEPTION 'deliveries: a row of another tenant must not reference this finding';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.carmen_finding_events (tenant_id, finding_id, event)
    VALUES (v_other_tenant, v_finding, 'feedback');
    RAISE EXCEPTION 'events: a row of another tenant must not reference this finding';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  -- Auto-clear after two runs without the fingerprint.
  PERFORM public.carmen_finding_mark_missing(v_tenant, 'data_gap', '{}'::text[], ARRAY[v_client], NULL, 2, v_round);
  IF (SELECT status FROM public.carmen_findings WHERE id = v_finding) <> 'notified' THEN
    RAISE EXCEPTION 'mark_missing: one miss must not clear';
  END IF;
  PERFORM public.carmen_finding_mark_missing(v_tenant, 'data_gap', '{}'::text[], ARRAY[v_client], NULL, 2, v_round);
  IF (SELECT resolution FROM public.carmen_findings WHERE id = v_finding) IS DISTINCT FROM 'auto_cleared' THEN
    RAISE EXCEPTION 'mark_missing: two misses must auto-clear';
  END IF;

  -- Lease and slots are single-holder.
  IF NOT public.carmen_round_try_lease(v_tenant, 60) OR public.carmen_round_try_lease(v_tenant, 60) THEN
    RAISE EXCEPTION 'lease: second holder must be refused';
  END IF;
  IF NOT public.carmen_round_claim_slot(v_tenant, 'qa-slot', now())
     OR public.carmen_round_claim_slot(v_tenant, 'qa-slot', now() - interval '1 minute') THEN
    RAISE EXCEPTION 'slot: an earlier or equal slot must be refused';
  END IF;

  -- notify_since is stamped by the database, never by the writer.
  IF NOT EXISTS (SELECT 1 FROM public.tenant_heartbeat_settings WHERE tenant_id = v_tenant) THEN
    INSERT INTO public.tenant_heartbeat_settings (tenant_id) VALUES (v_tenant);
  END IF;
  UPDATE public.tenant_heartbeat_settings
  SET pulse_alert_rules = pulse_alert_rules || jsonb_build_object('manager',
    '{"mode": "david_only", "notify_since": "2000-01-01T00:00:00Z"}'::jsonb)
  WHERE tenant_id = v_tenant;
  SELECT pulse_alert_rules INTO v_rules FROM public.tenant_heartbeat_settings WHERE tenant_id = v_tenant;
  v_stamp := v_rules #>> '{manager,notify_since}';
  IF v_stamp IS NULL OR v_stamp LIKE '2000%' THEN RAISE EXCEPTION 'guard: notify_since must be stamped now'; END IF;
  UPDATE public.tenant_heartbeat_settings SET pulse_alert_rules = '{"instant_wa_enabled": true}'
  WHERE tenant_id = v_tenant;
  SELECT pulse_alert_rules INTO v_rules FROM public.tenant_heartbeat_settings WHERE tenant_id = v_tenant;
  IF v_rules #>> '{manager,notify_since}' IS DISTINCT FROM v_stamp THEN
    RAISE EXCEPTION 'guard: a save without manager must keep the stored settings';
  END IF;

  -- The manager block is owner-only from the browser: a member who is not an
  -- owner may save other settings and the cost thresholds, never caps or hours.
  SELECT ur.user_id INTO v_member FROM public.user_roles AS ur
  WHERE ur.tenant_id = v_tenant AND ur.role::text NOT IN ('owner', 'agency_owner', 'super_admin')
  LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_member, v_stranger)::text, true);
  IF public.carmen_manager_is_owner(v_tenant) THEN
    PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  END IF;
  UPDATE public.tenant_heartbeat_settings
  SET pulse_alert_rules = pulse_alert_rules || '{"cpl_spike_pct": 61}'
  WHERE tenant_id = v_tenant;
  UPDATE public.tenant_heartbeat_settings
  SET pulse_alert_rules = jsonb_set(pulse_alert_rules, '{manager,cost}', '{"trend_pct": 45}')
  WHERE tenant_id = v_tenant;
  IF (SELECT pulse_alert_rules #>> '{manager,cost,trend_pct}' FROM public.tenant_heartbeat_settings
      WHERE tenant_id = v_tenant) IS DISTINCT FROM '45' THEN
    RAISE EXCEPTION 'guard: a member must be able to save the cost thresholds';
  END IF;
  -- The same save the way the app writes it: an upsert on tenant_id, whose
  -- INSERT phase fires the trigger before the conflict is known. The
  -- migrations never gave tenant_heartbeat_settings that key, so add it inside
  -- this rolled-back transaction (it fails loudly if a tenant has two rows).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tenant_heartbeat_settings'::regclass AND contype IN ('p', 'u')
  ) THEN
    ALTER TABLE public.tenant_heartbeat_settings ADD PRIMARY KEY (tenant_id);
  END IF;
  INSERT INTO public.tenant_heartbeat_settings (tenant_id, pulse_alert_rules)
  SELECT v_tenant, jsonb_set(s.pulse_alert_rules, '{manager,cost}', '{"trend_pct": 47}')
  FROM public.tenant_heartbeat_settings AS s WHERE s.tenant_id = v_tenant
  ON CONFLICT (tenant_id) DO UPDATE SET pulse_alert_rules = EXCLUDED.pulse_alert_rules;
  IF (SELECT pulse_alert_rules #>> '{manager,cost,trend_pct}' FROM public.tenant_heartbeat_settings
      WHERE tenant_id = v_tenant) IS DISTINCT FROM '47' THEN
    RAISE EXCEPTION 'guard: a member''s upsert of the cost thresholds must be saved';
  END IF;
  BEGIN
    INSERT INTO public.tenant_heartbeat_settings (tenant_id, pulse_alert_rules)
    SELECT v_tenant, jsonb_set(s.pulse_alert_rules, '{manager,max_alerts_per_recipient_per_day}', '501')
    FROM public.tenant_heartbeat_settings AS s WHERE s.tenant_id = v_tenant
    ON CONFLICT (tenant_id) DO UPDATE SET pulse_alert_rules = EXCLUDED.pulse_alert_rules;
    RAISE EXCEPTION 'Expected rejection';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'carmen_manager_settings_owner_only' THEN
      RAISE EXCEPTION 'guard: a non-owner''s upsert changed the manager block (%)', v_message;
    END IF;
  END;
  BEGIN
    UPDATE public.tenant_heartbeat_settings
    SET pulse_alert_rules = jsonb_set(pulse_alert_rules, '{manager,max_alerts_per_recipient_per_day}', '500')
    WHERE tenant_id = v_tenant;
    RAISE EXCEPTION 'Expected rejection';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'carmen_manager_settings_owner_only' THEN
      RAISE EXCEPTION 'guard: a non-owner changed the manager block (%)', v_message;
    END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- A mode change cancels the messages planned under the old mode.
  SELECT u.finding_id INTO v_planned
  FROM public.carmen_finding_upsert(v_tenant, v_round, 'qa', '1',
    jsonb_build_array(cand || '{"fingerprint": "qa-rollback-planned"}')) AS u;
  PERFORM public.carmen_finding_apply_route(v_tenant, v_round, jsonb_build_array(
    jsonb_build_object('finding_id', v_planned, 'status', 'notified', 'escalation_level', 0,
      'deliveries', jsonb_build_array(jsonb_build_object('level', 0, 'recipient_key', 'qa:two',
        'channel', 'manus_wa', 'slot', 'list', 'status', 'planned', 'not_before', now() + interval '1 hour')))));
  UPDATE public.tenant_heartbeat_settings
  SET pulse_alert_rules = jsonb_set(pulse_alert_rules, '{manager,mode}', '"observe"')
  WHERE tenant_id = v_tenant;
  IF (SELECT pulse_alert_rules #> '{manager,notify_since}' FROM public.tenant_heartbeat_settings
      WHERE tenant_id = v_tenant) IS NOT NULL THEN
    RAISE EXCEPTION 'guard: observe must drop notify_since';
  END IF;
  IF (SELECT status FROM public.carmen_finding_deliveries WHERE finding_id = v_planned) <> 'cancelled' THEN
    RAISE EXCEPTION 'guard: a mode change must cancel planned messages';
  END IF;

  -- ...and its ladder starts again, so nobody above hears of an item the
  -- first person never got; the router may plan the cancelled row again.
  IF (SELECT escalation_level IS NOT NULL OR next_action_at > now()
      FROM public.carmen_findings WHERE id = v_planned) THEN
    RAISE EXCEPTION 'guard: a mode change must reset a ladder nobody heard';
  END IF;
  PERFORM public.carmen_finding_apply_route(v_tenant, v_round, jsonb_build_array(
    jsonb_build_object('finding_id', v_planned, 'status', 'notified', 'escalation_level', 0,
      'deliveries', jsonb_build_array(jsonb_build_object('level', 0, 'recipient_key', 'qa:two',
        'channel', 'manus_wa', 'slot', 'list', 'status', 'planned', 'not_before', now() + interval '2 hours')))));
  IF (SELECT status FROM public.carmen_finding_deliveries WHERE finding_id = v_planned) <> 'planned' THEN
    RAISE EXCEPTION 'apply_route: a row cancelled by a rollout change must be planned again';
  END IF;

  -- A claim cut off for 10 minutes: a row whose send started may have left
  -- (delivery_unknown), a row never tried goes back to planned.
  INSERT INTO public.carmen_finding_deliveries (tenant_id, finding_id, level,
    recipient_key, channel, slot, status, not_before, attempted_at, updated_at)
  VALUES
    (v_tenant, v_planned, 1, 'qa:tried', 'manus_wa', 'now', 'claimed',
      now() + interval '1 day', now() - interval '11 minutes', now() - interval '11 minutes'),
    (v_tenant, v_planned, 1, 'qa:untried', 'manus_wa', 'now', 'claimed',
      now() + interval '1 day', NULL, now() - interval '11 minutes');
  PERFORM public.carmen_finding_claim_deliveries(v_tenant, 500);
  IF (SELECT string_agg(recipient_key || ':' || status, ',' ORDER BY recipient_key)
      FROM public.carmen_finding_deliveries WHERE finding_id = v_planned AND level = 1)
     IS DISTINCT FROM 'qa:tried:delivery_unknown,qa:untried:planned' THEN
    RAISE EXCEPTION 'claim: a cut-off claim must keep tried rows and release untried ones';
  END IF;

  -- Browsers read through RLS and write only through carmen_finding_set_status.
  IF has_table_privilege('authenticated', 'public.carmen_findings', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.carmen_finding_deliveries', 'INSERT')
     OR has_table_privilege('authenticated', 'public.carmen_round_state', 'SELECT')
     OR has_table_privilege('anon', 'public.carmen_findings', 'SELECT')
     OR has_function_privilege('authenticated', 'public.carmen_finding_upsert(uuid, uuid, text, text, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_finding_claim_deliveries(uuid, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.carmen_finding_set_status(uuid, text, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.carmen_finding_set_status(uuid, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: round RPCs are service role only, set_status is for signed-in users';
  END IF;
END
$test$;
ROLLBACK;
