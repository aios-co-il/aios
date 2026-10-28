-- Staging or a Preview branch only: it rewrites a real user's roles inside
-- the rolled-back transaction.
-- "תעדי <code>" (20261027102000_contact_accountability): who may log a
-- finding's contact, and that the card entry and the resolution happen
-- together or not at all. Synthetic rows inside one transaction that is
-- rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_agency uuid;
  v_user uuid;
  v_client uuid;
  v_campaigner uuid;
  v_finding uuid;
  v_other_tenant uuid;
  v_other_agency uuid;
  v_moved_agency uuid;
  v_result record;
  v_round uuid := gen_random_uuid();
BEGIN
  SELECT c.tenant_id, c.agency_id INTO v_tenant, v_agency
  FROM public.clients AS c
  WHERE c.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.tenant_users AS tu
      WHERE tu.tenant_id = c.tenant_id AND NOT public.is_super_admin(tu.user_id))
  ORDER BY c.id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant with an active client and a user'; END IF;
  SELECT tu.user_id INTO v_user FROM public.tenant_users AS tu
  WHERE tu.tenant_id = v_tenant AND NOT public.is_super_admin(tu.user_id)
  ORDER BY tu.created_at LIMIT 1;

  INSERT INTO public.clients (tenant_id, agency_id, name, status)
  VALUES (v_tenant, v_agency, 'QA ROLLBACK confirm', 'active') RETURNING id INTO v_client;
  INSERT INTO public.campaigners (tenant_id, full_name, active)
  VALUES (v_tenant, 'QA ROLLBACK', true) RETURNING id INTO v_campaigner;
  INSERT INTO public.client_team (client_id, campaigner_id) VALUES (v_client, v_campaigner);
  UPDATE public.profiles SET campaigner_id = v_campaigner WHERE id = v_user;
  -- The user is only a campaigner in this tenant.
  DELETE FROM public.user_roles WHERE user_id = v_user AND tenant_id = v_tenant;
  UPDATE public.tenant_users SET role = 'member' WHERE user_id = v_user AND tenant_id = v_tenant;
  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (v_user, v_tenant, 'campaigner');

  -- An office-line call nobody was named for.
  SELECT u.finding_id INTO v_finding
  FROM public.carmen_finding_upsert(v_tenant, v_round, 'contact', '1',
    jsonb_build_array(jsonb_build_object('kind', 'contact_not_logged',
      'fingerprint', 'qa-rollback-call', 'severity', 'warning', 'client_id', v_client,
      'summary_he', 'QA ROLLBACK', 'source_event_at', now(),
      'evidence', jsonb_build_object('attributed', false)))) AS u;

  -- Campaigners: any assigned one for an unattributed call; only its person for an attributed one.
  IF NOT public.carmen_finding_may_confirm(v_tenant, v_client, v_agency, NULL, false, v_user)
     OR public.carmen_finding_may_confirm(v_tenant, v_client, v_agency, gen_random_uuid(), true, v_user)
     OR NOT public.carmen_finding_may_confirm(v_tenant, v_client, v_agency, v_user, true, v_user)
     OR public.carmen_finding_may_confirm(v_tenant, v_client, v_agency, NULL, false, gen_random_uuid()) THEN
    RAISE EXCEPTION 'may_confirm: an assigned campaigner logs an unattributed call or their own, a stranger nothing';
  END IF;
  UPDATE public.client_team SET end_date = current_date - 30 WHERE client_id = v_client;
  IF public.carmen_finding_may_confirm(v_tenant, v_client, v_agency, NULL, false, v_user) THEN
    RAISE EXCEPTION 'may_confirm: a campaigner no longer on the client may not';
  END IF;

  -- Managers: a team manager of the finding's agency, not of another one.
  DELETE FROM public.user_roles WHERE user_id = v_user AND tenant_id = v_tenant;
  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (v_user, v_tenant, 'team_manager');
  INSERT INTO public.user_managed_agencies (user_id, agency_id) VALUES (v_user, v_agency);
  IF NOT public.carmen_finding_may_confirm(v_tenant, v_client, v_agency, NULL, false, v_user)
     OR public.carmen_finding_may_confirm(v_tenant, v_client, gen_random_uuid(), NULL, false, v_user) THEN
    RAISE EXCEPTION 'may_confirm: a team manager only for the agencies they manage';
  END IF;

  -- Owner level counts in its own tenant only.
  DELETE FROM public.user_roles WHERE user_id = v_user AND tenant_id = v_tenant;
  DELETE FROM public.user_managed_agencies WHERE user_id = v_user;
  UPDATE public.tenant_users SET role = 'owner' WHERE user_id = v_user AND tenant_id = v_tenant;
  IF NOT public.carmen_finding_may_confirm(v_tenant, v_client, v_agency, NULL, true, v_user)
     OR public.carmen_finding_may_confirm(gen_random_uuid(), v_client, v_agency, NULL, true, v_user) THEN
    RAISE EXCEPTION 'may_confirm: an owner of one tenant is nobody in another';
  END IF;

  -- A refusal writes nothing; a confirmation writes the entry and resolves together, once.
  SELECT * INTO v_result
  FROM public.carmen_finding_confirm_contact(v_tenant, v_finding, gen_random_uuid(), 'call', 'QA ROLLBACK');
  IF v_result.outcome <> 'not_found'
     OR EXISTS (SELECT 1 FROM public.client_updates AS u WHERE u.source_ref = 'finding:' || v_finding)
     OR (SELECT f.status FROM public.carmen_findings AS f WHERE f.id = v_finding) <> 'open' THEN
    RAISE EXCEPTION 'confirm: a refusal must leave the card and the finding as they were';
  END IF;
  INSERT INTO public.carmen_finding_deliveries (tenant_id, finding_id, level,
    recipient_key, channel, slot, status)
  VALUES (v_tenant, v_finding, 0, 'user:qa', 'manus_wa', 'list', 'planned');
  SELECT * INTO v_result
  FROM public.carmen_finding_confirm_contact(v_tenant, v_finding, v_user, 'call', 'QA ROLLBACK שיחה');
  IF v_result.outcome <> 'logged' OR NOT v_result.inserted
     OR NOT EXISTS (
       SELECT 1 FROM public.client_updates AS u
       WHERE u.id = v_result.entry_id AND u.client_id = v_client AND u.user_id = v_user
         AND u.source = 'carmen_confirmed' AND u.counts_as_contact AND u.update_type = 'call')
     OR (SELECT f.status || ':' || f.resolution || ':' || f.resolved_by
         FROM public.carmen_findings AS f WHERE f.id = v_finding) <> 'resolved:fixed:' || v_user
     OR EXISTS (SELECT 1 FROM public.carmen_finding_deliveries AS d
                WHERE d.finding_id = v_finding AND d.status <> 'cancelled')
     OR NOT EXISTS (SELECT 1 FROM public.carmen_finding_events AS e
                    WHERE e.finding_id = v_finding AND e.event = 'resolved' AND e.actor_user_id = v_user) THEN
    RAISE EXCEPTION 'confirm: the entry, the resolution, the cancelled plans and the event go together';
  END IF;
  IF (SELECT r.outcome FROM public.carmen_finding_confirm_contact(
        v_tenant, v_finding, v_user, 'call', 'QA') AS r) <> 'not_found' THEN
    RAISE EXCEPTION 'confirm: a resolved finding is not logged twice';
  END IF;

  -- A client of an agency shared read-only: nothing is written, the finding stays.
  SELECT a.tenant_id, a.id INTO v_other_tenant, v_other_agency
  FROM public.agencies AS a WHERE a.tenant_id IS DISTINCT FROM v_tenant ORDER BY a.id LIMIT 1;
  IF v_other_agency IS NULL THEN
    RAISE NOTICE 'skipped the read-only share check: no second tenant with an agency';
  ELSE
    -- A finding's deliveries carry its tenant (composite FK), so the confirm's
    -- tenant-keyed cancel reaches every one of them.
    BEGIN
      INSERT INTO public.carmen_finding_deliveries (tenant_id, finding_id, level,
        recipient_key, channel, slot, status)
      VALUES (v_other_tenant, v_finding, 0, 'user:qa', 'manus_wa', 'list', 'planned');
      RAISE EXCEPTION 'deliveries: another tenant''s delivery of a finding must be refused';
    EXCEPTION WHEN foreign_key_violation THEN
      NULL;
    END;

    INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
    VALUES (v_other_tenant, v_other_agency, v_tenant, 'read_only')
    ON CONFLICT (source_tenant_id, agency_id, accessing_tenant_id)
      DO UPDATE SET access_level = 'read_only';
    INSERT INTO public.clients (tenant_id, agency_id, name, status)
    VALUES (v_other_tenant, v_other_agency, 'QA ROLLBACK shared', 'active')
    RETURNING id INTO v_client;
    SELECT u.finding_id INTO v_finding
    FROM public.carmen_finding_upsert(v_tenant, v_round, 'contact', '1',
      jsonb_build_array(jsonb_build_object('kind', 'contact_not_logged',
        'fingerprint', 'qa-rollback-shared', 'severity', 'warning', 'client_id', v_client,
        'summary_he', 'QA ROLLBACK', 'source_event_at', now(), 'evidence', '{}'::jsonb))) AS u;
    IF (SELECT r.outcome FROM public.carmen_finding_confirm_contact(
          v_tenant, v_finding, v_user, 'call', 'QA') AS r) <> 'read_only'
       OR EXISTS (SELECT 1 FROM public.client_updates AS u WHERE u.source_ref = 'finding:' || v_finding)
       OR (SELECT f.status FROM public.carmen_findings AS f WHERE f.id = v_finding) <> 'open' THEN
      RAISE EXCEPTION 'confirm: a read-only share writes nothing and keeps the finding';
    END IF;

    -- The client's current agency decides, not the one the finding recorded.
    INSERT INTO public.agencies (tenant_id, name)
    VALUES (v_other_tenant, 'QA ROLLBACK moved') RETURNING id INTO v_moved_agency;
    INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
    VALUES (v_other_tenant, v_moved_agency, v_tenant, 'read_write');
    UPDATE public.clients SET agency_id = v_moved_agency WHERE id = v_client;
    IF (SELECT r.outcome FROM public.carmen_finding_confirm_contact(
          v_tenant, v_finding, v_user, 'call', 'QA') AS r) <> 'logged' THEN
      RAISE EXCEPTION 'confirm: a client moved to an agency shared read_write is logged';
    END IF;
  END IF;

  -- Service role only.
  IF has_function_privilege('authenticated', 'public.carmen_finding_confirm_contact(uuid, uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.carmen_finding_confirm_contact(uuid, uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_finding_may_confirm(uuid, uuid, uuid, uuid, boolean, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.carmen_finding_confirm_contact(uuid, uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: confirming contact is service role only';
  END IF;
END
$test$;
ROLLBACK;
