-- Client card provenance (20261026126000_client_card_provenance): Staging
-- only. Synthetic rows on an existing client inside one transaction that is
-- rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_other_tenant uuid;
  v_other_owner uuid;
  v_client uuid;
  v_agency uuid;
  v_owner uuid;
  v_member uuid;
  v_campaigner uuid;
  v_carmen_row uuid;
  v_shared_row uuid;
  v_ref text := 'qa-rollback-' || gen_random_uuid();
  v_counted_at timestamptz := now() + interval '1 day';
  v_last timestamptz;
  r1 record;
  r2 record;
  affected integer;
BEGIN
  -- An owner (not a super admin) whose home tenant has a client with no team,
  -- so attribution starts at the owner fallback. The client has an agency, so
  -- it can be shared with another org.
  SELECT ur.user_id, ur.tenant_id INTO v_owner, v_tenant
  FROM public.user_roles AS ur
  JOIN public.profiles AS p ON p.id = ur.user_id
  WHERE ur.role = 'owner'::public.app_role
    AND public.get_user_tenant_id(ur.user_id) = ur.tenant_id
    AND NOT public.is_super_admin(ur.user_id)
    AND EXISTS (
      SELECT 1
      FROM public.clients AS c
      WHERE c.tenant_id = ur.tenant_id
        AND c.agency_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.client_team AS ct WHERE ct.client_id = c.id)
    )
  LIMIT 1;

  SELECT c.id, c.agency_id INTO v_client, v_agency
  FROM public.clients AS c
  WHERE c.tenant_id = v_tenant
    AND c.agency_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.client_team AS ct WHERE ct.client_id = c.id)
  LIMIT 1;

  -- A member of the same tenant with no owner rights (a campaigner's view).
  SELECT tu.user_id INTO v_member
  FROM public.tenant_users AS tu
  WHERE tu.tenant_id = v_tenant
    AND tu.role NOT IN ('owner', 'agency_owner')
    AND public.get_user_tenant_id(tu.user_id) = v_tenant
    AND NOT public.is_super_admin(tu.user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles AS ur
      WHERE ur.user_id = tu.user_id
        AND ur.tenant_id = v_tenant
        AND ur.role IN ('owner'::public.app_role, 'agency_owner'::public.app_role)
    )
  LIMIT 1;

  -- A second tenant with no agency access to the first one, and its owner
  -- (not a super admin) whose home tenant it is. The first tenant's owner has
  -- no role there, so owner rights never cross between the two.
  SELECT ur.tenant_id, ur.user_id INTO v_other_tenant, v_other_owner
  FROM public.user_roles AS ur
  WHERE ur.role = 'owner'::public.app_role
    AND ur.tenant_id <> v_tenant
    AND public.get_user_tenant_id(ur.user_id) = ur.tenant_id
    AND NOT public.is_super_admin(ur.user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.agency_tenant_access AS ata
      WHERE ata.accessing_tenant_id = ur.tenant_id
        AND ata.source_tenant_id = v_tenant
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles AS own
      WHERE own.user_id = v_owner
        AND own.tenant_id = ur.tenant_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_users AS own
      WHERE own.user_id = v_owner
        AND own.tenant_id = ur.tenant_id
    )
  LIMIT 1;

  -- An active campaigner with an active profile, assigned to the client later;
  -- not the second tenant's owner, who must not see the client through it.
  SELECT cp.id INTO v_campaigner
  FROM public.campaigners AS cp
  JOIN public.profiles AS p ON p.campaigner_id = cp.id
  WHERE cp.active
    AND p.status <> 'inactive'
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles AS other
      WHERE other.id = v_other_owner
        AND other.campaigner_id = cp.id
    )
  LIMIT 1;

  IF v_owner IS NULL OR v_client IS NULL OR v_member IS NULL
    OR v_other_tenant IS NULL OR v_other_owner IS NULL OR v_campaigner IS NULL THEN
    RAISE EXCEPTION 'Requires an owner tenant with an unassigned agency client, a non-owner member, a second tenant with its own owner and an active campaigner';
  END IF;

  -- Grants: only the service role may call the writer.
  IF has_function_privilege('authenticated', 'public.record_client_card_entry(uuid, uuid, text, text, text, text, uuid, boolean, jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.record_client_card_entry(uuid, uuid, text, text, text, text, uuid, boolean, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'record_client_card_entry is executable by anon or authenticated';
  END IF;

  -- Tenant check: a client outside p_tenant is refused with 42501 ...
  BEGIN
    PERFORM public.record_client_card_entry(
      v_other_tenant, v_client, 'QA ROLLBACK foreign tenant',
      p_source => 'automation', p_attributed_user => v_owner);
    RAISE EXCEPTION 'A client outside p_tenant was written';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- ... and allowed once that tenant has agency read_write access.
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (v_tenant, v_agency, v_other_tenant, 'read_write');
  SELECT * INTO r1 FROM public.record_client_card_entry(
    v_other_tenant, v_client, 'QA ROLLBACK agency tenant',
    p_source => 'automation', p_attributed_user => v_owner);
  IF NOT r1.inserted OR r1.attribution <> 'attributed' THEN
    RAISE EXCEPTION 'An agency read_write tenant could not write the card: %', r1;
  END IF;
  v_shared_row := r1.entry_id;

  -- Attribution: with no campaigner on the client, the tenant owner.
  SELECT * INTO r1 FROM public.record_client_card_entry(
    v_tenant, v_client, 'QA ROLLBACK owner fallback',
    p_source => 'carmen', p_source_ref => v_ref);
  IF r1.attribution <> 'owner' OR NOT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = r1.attributed_user_id
      AND ur.tenant_id = v_tenant
      AND ur.role = 'owner'::public.app_role
    UNION ALL
    SELECT 1 FROM public.tenant_users AS tu
    WHERE tu.user_id = r1.attributed_user_id
      AND tu.tenant_id = v_tenant
      AND tu.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'The owner fallback attributed the entry to %', r1;
  END IF;
  v_carmen_row := r1.entry_id;

  -- Dedupe: the same (client, source, source_ref) returns the first row.
  SELECT * INTO r2 FROM public.record_client_card_entry(
    v_tenant, v_client, 'QA ROLLBACK owner fallback, retried',
    p_source => 'carmen', p_source_ref => v_ref);
  IF r2.inserted OR r2.entry_id <> r1.entry_id OR r2.attribution <> 'existing' THEN
    RAISE EXCEPTION 'A repeated source_ref wrote a second row: %', r2;
  END IF;

  -- Attribution: an active campaigner on the client comes before the owner.
  INSERT INTO public.client_team (client_id, campaigner_id)
  VALUES (v_client, v_campaigner);
  SELECT * INTO r1 FROM public.record_client_card_entry(
    v_tenant, v_client, 'QA ROLLBACK campaigner', p_source => 'automation');
  IF r1.attribution <> 'campaigner' OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = r1.attributed_user_id
      AND p.campaigner_id = v_campaigner
  ) THEN
    RAISE EXCEPTION 'The campaigner fallback attributed the entry to %', r1;
  END IF;

  -- carmen_confirmed needs the person who confirmed it.
  BEGIN
    PERFORM public.record_client_card_entry(
      v_tenant, v_client, 'QA ROLLBACK unconfirmed', p_source => 'carmen_confirmed');
    RAISE EXCEPTION 'carmen_confirmed without a person was written';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- Pulse: carmen and system_send rows never count; a human counts_as_contact
  -- row does. All three are newer than any real row on the client.
  INSERT INTO public.client_updates
    (client_id, tenant_id, user_id, content, update_type, source, counts_as_contact, created_at)
  VALUES
    (v_client, v_tenant, v_owner, 'QA ROLLBACK counted note', 'note', 'human', true, v_counted_at),
    (v_client, v_tenant, v_owner, 'QA ROLLBACK carmen call', 'call', 'carmen', NULL, v_counted_at + interval '1 hour'),
    (v_client, v_tenant, v_owner, 'דיברתי עם הלקוח בטלפון', 'weekly_update', 'system_send', NULL, v_counted_at + interval '2 hours');
  SELECT u.last_client_call_at INTO v_last
  FROM public.get_latest_client_call_updates(ARRAY[v_client]) AS u;
  IF v_last IS DISTINCT FROM v_counted_at THEN
    RAISE EXCEPTION 'The pulse counted % instead of the human counts_as_contact row', v_last;
  END IF;

  -- RLS as a member without owner rights: human rows only, no edits to
  -- entries no person wrote.
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source)
  VALUES (v_client, v_tenant, v_member, 'QA ROLLBACK browser human', 'human');
  BEGIN
    INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, source)
    VALUES (v_client, v_tenant, v_member, 'QA ROLLBACK browser carmen', 'carmen');
    RAISE EXCEPTION 'The browser inserted a carmen row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.client_updates SET content = 'Must be denied' WHERE id = v_carmen_row;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'A member without owner rights edited a carmen row';
  END IF;
  RESET ROLE;

  -- RLS as the tenant owner: entries no person wrote are editable.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.client_updates SET content = 'QA ROLLBACK owner edit' WHERE id = v_carmen_row;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'The tenant owner could not edit a carmen row';
  END IF;

  -- One shared card: the client's org sees the entry the sharing org wrote ...
  IF NOT EXISTS (SELECT 1 FROM public.client_updates WHERE id = v_shared_row) THEN
    RAISE EXCEPTION 'The client''s org cannot see the entry the sharing org wrote';
  END IF;

  -- ... but cannot edit or delete it: owner rights follow the writer's tenant.
  UPDATE public.client_updates SET content = 'Must be denied' WHERE id = v_shared_row;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'The client''s org edited an automatic entry the sharing org wrote';
  END IF;
  DELETE FROM public.client_updates WHERE id = v_shared_row;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'The client''s org deleted an automatic entry the sharing org wrote';
  END IF;
  RESET ROLE;

  -- One shared card, the other way: the sharing org sees the client's entries.
  PERFORM set_config('request.jwt.claim.sub', v_other_owner::text, true);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (SELECT 1 FROM public.client_updates WHERE id = v_carmen_row) THEN
    RAISE EXCEPTION 'The sharing org cannot see the entry the client''s org wrote';
  END IF;
  RESET ROLE;

  -- Without access to the client, its entries are hidden.
  DELETE FROM public.agency_tenant_access
  WHERE source_tenant_id = v_tenant
    AND agency_id = v_agency
    AND accessing_tenant_id = v_other_tenant;
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.clients WHERE id = v_client) THEN
    RAISE EXCEPTION 'Setup: the second tenant''s owner still sees the client after its access was revoked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_updates WHERE id = v_carmen_row) THEN
    RAISE EXCEPTION 'A user who cannot see the client sees its entries';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$test$;
SELECT 'Tenant check, dedupe, attribution, refusals, pulse filter, RLS, shared card and grants passed' AS result;
ROLLBACK;
