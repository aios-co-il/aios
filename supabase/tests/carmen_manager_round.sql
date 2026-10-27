-- Carmen manager round (20261027100000_carmen_manager_round): synthetic
-- findings inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_client uuid;
  v_other_client uuid;
  v_other_agency uuid;
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

  -- The whole manager block is owner-only from the browser: a member who is
  -- not an owner may save other settings, never caps or hours.
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
