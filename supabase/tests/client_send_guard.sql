-- Client send guard (20261027120000_client_send_guard): Staging only.
-- Synthetic tenants, clients, contacts, leads, groups, pulse settings,
-- broadcasts and Telegram rows in one transaction that is rolled back; five
-- existing users get roles in the synthetic tenants for the RLS checks.
-- Nothing is sent: HTTP calls that lead triggers queue are rolled back with
-- everything else.
BEGIN;

-- One resolver answer as kind:clients:lead:group:ambiguous:sender_staff
-- (NULL as empty), asked as the service role, the resolver's only grantee.
CREATE FUNCTION pg_temp.qa_resolve(
  p_tenant uuid,
  p_shape text,
  p_address text,
  p_group uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_answer text;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT concat(
    r.recipient_kind, ':',
    (SELECT string_agg(id::text, ',' ORDER BY id) FROM unnest(r.client_ids) AS id), ':',
    r.lead_id, ':',
    r.group_id, ':',
    r.ambiguous, ':',
    r.sender_staff)
  INTO v_answer
  FROM public.resolve_send_recipient(p_tenant, p_shape, p_address, p_group) AS r;
  RESET ROLE;
  RETURN v_answer;
END;
$fn$;

-- The expected answer in qa_resolve's format; sender_staff is false unless
-- the address is also staff of the sending tenant.
CREATE FUNCTION pg_temp.qa_want(
  p_kind text,
  p_clients uuid[],
  p_lead uuid,
  p_group uuid,
  p_ambiguous boolean,
  p_sender_staff boolean DEFAULT false
)
RETURNS text
LANGUAGE sql
AS $fn$
  SELECT concat(
    p_kind, ':',
    (SELECT string_agg(id::text, ',' ORDER BY id) FROM unnest(p_clients) AS id), ':',
    p_lead, ':',
    p_group, ':',
    p_ambiguous, ':',
    p_sender_staff)
$fn$;

-- Raises with both values when an answer differs from the expected one.
CREATE FUNCTION pg_temp.qa_expect(p_case text, p_got text, p_want text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION '%: expected %, got %', p_case, p_want, p_got;
  END IF;
END;
$fn$;

-- Acts as a signed-in user (the caller then switches to the authenticated
-- role) and makes the given tenant the user's active one.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid, p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  INSERT INTO public.user_active_tenant (user_id, tenant_id)
  VALUES (p_user, p_tenant)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
END;
$fn$;

DO $test$
DECLARE
  v_users uuid[];
  v_owner uuid;
  v_manager uuid;
  v_campaigner_user uuid;
  v_agency_owner uuid;
  v_child_owner uuid;
  v_super uuid;
  v_tenant uuid;
  v_child uuid;
  v_agency_tenant uuid;
  v_unrelated uuid;
  v_agency uuid;
  v_agency_b uuid;
  v_c1 uuid;
  v_c2 uuid;
  v_c3 uuid;
  v_cx uuid;
  v_c4 uuid;
  v_c5 uuid;
  v_cc uuid;
  v_contact_c2 uuid;
  v_contact_c5 uuid;
  v_contact_c4 uuid;
  v_campaigner uuid;
  v_lead uuid;
  v_broadcast uuid;
  v_other_broadcast uuid;
  v_channel uuid;
  v_g1 uuid;
  v_g2 uuid;
  v_g3 uuid;
  v_gx uuid;
  v_g4 uuid;
  v_g1_chat text := 'qa-g1-' || gen_random_uuid() || '@g.us';
  v_g2_chat text := 'qa-g2-' || gen_random_uuid() || '@g.us';
  v_g3_chat text := 'qa-g3-' || gen_random_uuid() || '@g.us';
  v_gx_chat text := 'qa-gx-' || gen_random_uuid() || '@g.us';
  v_link_chat text := 'qa-link-' || gen_random_uuid() || '@g.us';
  v_lead_chat text := 'qa-lead-' || gen_random_uuid() || '@g.us';
  v_camp_group text := 'qa-camp-' || gen_random_uuid();
  v_owner_email text;
  v_tag text := 'QA ROLLBACK ' || gen_random_uuid();
  v_fn text;
  v_count integer;
  v_row public.client_auto_send_opt_ins%ROWTYPE;
BEGIN
  -- ─── Personas ─────────────────────────────────────────────────────────────

  SELECT array_agg(u.id ORDER BY u.id) INTO v_users
  FROM (
    SELECT p.id
    FROM public.profiles AS p
    JOIN auth.users AS au ON au.id = p.id
    WHERE NOT public.is_super_admin(p.id)
    ORDER BY p.id
    LIMIT 5
  ) AS u;
  SELECT ur.user_id INTO v_super
  FROM public.user_roles AS ur
  WHERE ur.role = 'super_admin'::public.app_role
    AND ur.tenant_id IS NULL
  LIMIT 1;
  IF cardinality(v_users) IS DISTINCT FROM 5 OR v_super IS NULL THEN
    RAISE EXCEPTION 'Requires five users with profiles who are not super admins, and a super admin';
  END IF;
  v_owner := v_users[1];
  v_manager := v_users[2];
  v_campaigner_user := v_users[3];
  v_agency_owner := v_users[4];
  v_child_owner := v_users[5];
  UPDATE public.profiles SET phone = NULL WHERE id = ANY (v_users);
  SELECT p.email INTO v_owner_email FROM public.profiles AS p WHERE p.id = v_owner;

  -- ─── Tenants: home, its client org (V09), an agency tenant, a stranger ────

  INSERT INTO public.tenants (name, slug)
  VALUES (v_tag || ' home', 'qa-home-' || gen_random_uuid())
  RETURNING id INTO v_tenant;
  INSERT INTO public.tenants (name, slug, parent_tenant_id, org_type)
  VALUES (v_tag || ' client org', 'qa-child-' || gen_random_uuid(), v_tenant, 'sub_organization')
  RETURNING id INTO v_child;
  INSERT INTO public.tenants (name, slug)
  VALUES (v_tag || ' agency tenant', 'qa-agency-' || gen_random_uuid())
  RETURNING id INTO v_agency_tenant;
  INSERT INTO public.tenants (name, slug)
  VALUES (v_tag || ' unrelated', 'qa-unrelated-' || gen_random_uuid())
  RETURNING id INTO v_unrelated;

  INSERT INTO public.agencies (name, tenant_id) VALUES (v_tag || ' A', v_tenant)
  RETURNING id INTO v_agency;
  INSERT INTO public.agencies (name, tenant_id) VALUES (v_tag || ' B', v_tenant)
  RETURNING id INTO v_agency_b;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (v_tenant, v_agency, v_agency_tenant, 'read_write');

  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_tenant, v_owner, 'owner'),
    (v_tenant, v_manager, 'team_manager'),
    (v_tenant, v_campaigner_user, 'member'),
    (v_agency_tenant, v_agency_owner, 'owner'),
    (v_child, v_child_owner, 'owner');
  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES
    (v_owner, v_tenant, 'owner'),
    (v_manager, v_tenant, 'team_manager'),
    (v_campaigner_user, v_tenant, 'campaigner'),
    (v_agency_owner, v_agency_tenant, 'owner'),
    (v_child_owner, v_child, 'owner');
  INSERT INTO public.user_managed_agencies (user_id, agency_id) VALUES (v_manager, v_agency);

  -- ─── Cards, contacts, staff, leads ────────────────────────────────────────

  INSERT INTO public.clients (name, tenant_id, agency_id, phone, email)
  VALUES (v_tag || ' C1', v_tenant, v_agency, '050-9990001', 'QA-C1@example.invalid')
  RETURNING id INTO v_c1;
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES (v_tag || ' C2', v_tenant, v_agency)
  RETURNING id INTO v_c2;
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES (v_tag || ' C3', v_tenant, v_agency_b)
  RETURNING id INTO v_c3;
  INSERT INTO public.clients (name, tenant_id, agency_id, phone)
  VALUES (v_tag || ' CX', v_unrelated, v_agency_b, '0509990009')
  RETURNING id INTO v_cx;
  -- C4 has only an identity's phone and a Carmen group; C5 has nothing.
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES (v_tag || ' C4', v_tenant, v_agency)
  RETURNING id INTO v_c4;
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES (v_tag || ' C5', v_tenant, v_agency)
  RETURNING id INTO v_c5;
  -- The client org's own client, for the refusal log's tenant boundary.
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES (v_tag || ' client org''s client', v_child, v_agency_b)
  RETURNING id INTO v_cc;

  INSERT INTO public.client_contacts (client_id, tenant_id, contact_name, phone, email) VALUES
    (v_c1, v_tenant, 'QA contact', '+972 50-999-0002', 'qa-contact@example.invalid'),
    (v_c1, v_tenant, 'QA client org owner', '0509990007', NULL),
    (v_c2, v_tenant, 'QA staff as contact', '0509990005', NULL),
    (v_c3, v_tenant, 'QA campaigner as contact', '0509990006', upper(v_owner_email)),
    (v_c1, v_tenant, 'QA agency tenant campaigner', '0509990011', NULL),
    (v_c1, v_tenant, 'QA client org owner without a profile phone', '0509990013', NULL),
    (v_c1, v_tenant, 'QA client org owner''s preview phone', '0509990014', NULL),
    (v_c2, v_tenant, 'QA sales person as contact', '0509990015', NULL),
    (v_c3, v_tenant, 'QA home tenant''s pulse phone', '0509990019', NULL),
    (v_c3, v_tenant, 'QA home tenant''s pulse preview phone', '0509990018', NULL);
  INSERT INTO public.client_contacts (client_id, tenant_id, contact_name)
  VALUES (v_c2, v_tenant, 'QA identity contact')
  RETURNING id INTO v_contact_c2;
  INSERT INTO public.client_contacts (client_id, tenant_id, contact_name)
  VALUES (v_c4, v_tenant, 'QA identity only')
  RETURNING id INTO v_contact_c4;
  INSERT INTO public.client_contacts (client_id, tenant_id, contact_name)
  VALUES (v_c5, v_tenant, 'QA pending identity only')
  RETURNING id INTO v_contact_c5;
  INSERT INTO public.carmen_whatsapp_identities (tenant_id, phone, entity_type, entity_id, client_id, status) VALUES
    (v_tenant, '972509990003', 'client_contact', v_contact_c2, NULL, 'approved'),
    (v_tenant, '972509990004', 'client_contact', v_contact_c2, v_c2, 'pending'),
    (v_tenant, '972509990012', 'client_contact', v_contact_c4, NULL, 'approved'),
    (v_tenant, '972509990017', 'client_contact', v_contact_c5, NULL, 'pending');

  -- The home tenant's owner, a campaigner and a sales person use phones that
  -- are also on its own cards; the client org's owner and the agency
  -- tenant's campaigner are contacts of the home tenant's client. Pulse
  -- phones are no staff evidence: the client org's name a second owner with
  -- no profile phone, the home tenant's are on its own card, the agency
  -- tenant's on none.
  UPDATE public.profiles SET phone = '0509990005' WHERE id = v_owner;
  UPDATE public.profiles SET phone = '0509990007' WHERE id = v_child_owner;
  INSERT INTO public.sales_people (full_name, tenant_id, agency_id, phone)
  VALUES (v_tag || ' sales person', v_tenant, v_agency, '0509990015');
  INSERT INTO public.tenant_heartbeat_settings (tenant_id, campaign_pulse_phone, campaign_pulse_preview_phone) VALUES
    (v_child, '+972 50-999-0013', '0509990014'),
    (v_tenant, '0509990019', '0509990018'),
    (v_agency_tenant, '0509990016', NULL);
  INSERT INTO public.campaigners (full_name, tenant_id, phone, whatsapp_group_id)
  VALUES (v_tag || ' campaigner', v_tenant, '0509990006', v_camp_group)
  RETURNING id INTO v_campaigner;
  UPDATE public.profiles SET campaigner_id = v_campaigner WHERE id = v_campaigner_user;
  INSERT INTO public.client_team (client_id, campaigner_id) VALUES (v_c1, v_campaigner);
  INSERT INTO public.campaigners (full_name, tenant_id, phone)
  VALUES (v_tag || ' agency tenant campaigner', v_agency_tenant, '0509990011');

  INSERT INTO public.leads (company_name, tenant_id, agency_id, phone, email)
  VALUES (v_tag || ' lead', v_tenant, v_agency, '0509990008', 'qa-lead@example.invalid')
  RETURNING id INTO v_lead;
  INSERT INTO public.leads (company_name, tenant_id, agency_id, phone)
  VALUES (v_tag || ' staff lead', v_tenant, v_agency, '0509990005');

  -- ─── Groups and Telegram ──────────────────────────────────────────────────

  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, v_g1_chat, v_tag || ' G1') RETURNING id INTO v_g1;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, v_g2_chat, v_tag || ' G2') RETURNING id INTO v_g2;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, v_g3_chat, v_tag || ' G3') RETURNING id INTO v_g3;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_unrelated, v_gx_chat, v_tag || ' GX') RETURNING id INTO v_gx;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-g4-' || gen_random_uuid() || '@g.us', v_tag || ' G4') RETURNING id INTO v_g4;
  INSERT INTO public.carmen_client_group_access (tenant_id, client_id, whatsapp_group_id)
  VALUES (v_tenant, v_c4, v_g4);
  UPDATE public.clients SET whatsapp_group_id = v_g1 WHERE id = v_c1;
  UPDATE public.clients SET whatsapp_group_id = v_g2 WHERE id = v_c2;
  UPDATE public.clients SET whatsapp_group_id = v_gx WHERE id = v_cx;
  INSERT INTO public.team_channels (tenant_id, name, created_by)
  VALUES (v_tenant, v_tag || ' channel', v_owner) RETURNING id INTO v_channel;
  INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_chat_id, client_id, lead_id) VALUES
    (v_channel, v_tenant, v_g2_chat, v_c1, NULL),
    (v_channel, v_tenant, v_link_chat, v_c3, NULL),
    (v_channel, v_tenant, v_lead_chat, NULL, v_lead),
    (v_channel, v_tenant, '972509990099@c.us', v_c5, NULL);

  INSERT INTO public.telegram_messages (tenant_id, chat_id, client_id, lead_id, created_at) VALUES
    (v_tenant, -100999000111, NULL, v_lead, now() - interval '2 days'),
    (v_tenant, -100999000111, v_c1, NULL, now() - interval '1 day'),
    (v_tenant, -100999000111, NULL, NULL, now()),
    (v_tenant, -100999000222, NULL, v_lead, now()),
    (v_tenant, -100999000333, NULL, NULL, now());

  INSERT INTO public.broadcasts (tenant_id, provider, status)
  VALUES (v_tenant, 'green_api', 'sending') RETURNING id INTO v_broadcast;
  INSERT INTO public.broadcasts (tenant_id, provider, status)
  VALUES (v_tenant, 'green_api', 'sending') RETURNING id INTO v_other_broadcast;
  INSERT INTO public.broadcast_recipients (broadcast_id, tenant_id, entity_type, entity_id, phone, email) VALUES
    (v_broadcast, v_tenant, 'client', v_c1, '050-999-0001', 'QA-C1@example.invalid'),
    (v_broadcast, v_tenant, 'wa_group', v_g1, v_g1_chat, NULL),
    (v_other_broadcast, v_tenant, 'manual', NULL, '0509990008', NULL);

  -- ─── Grants ───────────────────────────────────────────────────────────────

  FOREACH v_fn IN ARRAY ARRAY[
    'public.send_scope_tenant_ids(uuid)',
    'public.resolve_send_recipient(uuid, text, text, uuid)',
    'public.client_auto_send_allowed(uuid, uuid, public.client_auto_send_kind, public.client_auto_send_target)',
    'public.broadcast_lists_recipient(uuid, uuid, text, text, uuid)',
    'public.client_auto_send_opt_in_stamp()'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
      OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon or authenticated', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.send_scope_tenant_ids(uuid)',
    'public.resolve_send_recipient(uuid, text, text, uuid)',
    'public.client_auto_send_allowed(uuid, uuid, public.client_auto_send_kind, public.client_auto_send_target)',
    'public.broadcast_lists_recipient(uuid, uuid, text, text, uuid)',
    'public.can_manage_client_auto_sends(uuid)',
    'public.client_auto_send_targets(uuid)',
    'public.user_can_view_client_send_refusal(uuid, uuid)'
  ] LOOP
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% is not executable by service_role', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.can_manage_client_auto_sends(uuid)',
    'public.client_auto_send_targets(uuid)',
    'public.user_can_view_client_send_refusal(uuid, uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
      OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% must be callable by authenticated, not anon', v_fn;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.client_auto_send_opt_ins', 'SELECT')
    OR has_table_privilege('anon', 'public.client_send_refusals', 'SELECT')
    OR has_table_privilege('authenticated', 'public.client_auto_send_opt_ins', 'DELETE')
    OR has_table_privilege('authenticated', 'public.client_send_refusals', 'INSERT')
    OR has_table_privilege('authenticated', 'public.client_send_refusals', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.client_send_refusals', 'INSERT') THEN
    RAISE EXCEPTION 'Table grants: anon nothing, authenticated no delete and read-only refusals, service_role writes';
  END IF;

  -- ─── Scope ────────────────────────────────────────────────────────────────

  IF NOT (public.send_scope_tenant_ids(v_tenant) @> ARRAY[v_tenant, v_child, v_agency_tenant]
      AND NOT public.send_scope_tenant_ids(v_tenant) @> ARRAY[v_unrelated])
    OR NOT public.send_scope_tenant_ids(v_child) @> ARRAY[v_child, v_tenant]
    OR NOT public.send_scope_tenant_ids(v_agency_tenant) @> ARRAY[v_agency_tenant, v_tenant] THEN
    RAISE EXCEPTION 'Scope: a tenant, its parent, its children and agency links either way';
  END IF;

  -- ─── Resolver: phones ─────────────────────────────────────────────────────

  PERFORM pg_temp.qa_expect('card phone',
    pg_temp.qa_resolve(v_tenant, 'phone', '972509990001'),
    pg_temp.qa_want('client', ARRAY[v_c1], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('contact phone, any format',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990002'),
    pg_temp.qa_want('client_contact', ARRAY[v_c1], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('approved identity, client through its contact',
    pg_temp.qa_resolve(v_tenant, 'phone', '+972-50-999-0003'),
    pg_temp.qa_want('client_contact', ARRAY[v_c2], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('pending identity is not a client',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990004'),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, NULL, false));
  -- Staff whose own number is on their own tenant's card (and a lead of
  -- it) stay staff, whoever sends: their staff alerts keep going out.
  PERFORM pg_temp.qa_expect('member profile phone on its tenant''s card is staff',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990005'),
    pg_temp.qa_want('staff', ARRAY[]::uuid[], NULL, NULL, false, true));
  PERFORM pg_temp.qa_expect('that member, sent from the client org',
    pg_temp.qa_resolve(v_child, 'phone', '0509990005'),
    pg_temp.qa_want('staff', ARRAY[]::uuid[], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('sales person phone on its tenant''s card is staff',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990015'),
    pg_temp.qa_want('staff', ARRAY[]::uuid[], NULL, NULL, false, true));
  -- Tenant B's sales person on B's card, sent from tenant A (a fallback
  -- line): staff, so the staff alert is allowed.
  PERFORM pg_temp.qa_expect('that sales person, sent from the agency tenant',
    pg_temp.qa_resolve(v_agency_tenant, 'phone', '0509990015'),
    pg_temp.qa_want('staff', ARRAY[]::uuid[], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('campaigner phone on its tenant''s card is staff',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990006'),
    pg_temp.qa_want('staff', ARRAY[]::uuid[], NULL, NULL, false, true));
  PERFORM pg_temp.qa_expect('client org owner (V09) is a client of the parent',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990007'),
    pg_temp.qa_want('client_contact', ARRAY[v_c1], NULL, NULL, false));
  -- The client org's own sends see a client who is also their own owner.
  PERFORM pg_temp.qa_expect('client org owner (V09), sent from the client org',
    pg_temp.qa_resolve(v_child, 'phone', '0509990007'),
    pg_temp.qa_want('client_contact', ARRAY[v_c1], NULL, NULL, false, true));
  -- Pulse phones are no staff evidence. A client org owner with no profile
  -- phone, named only by the client org's pulse settings, is the parent's
  -- client to the client org too.
  PERFORM pg_temp.qa_expect('client org pulse phone, sent from the client org',
    pg_temp.qa_resolve(v_child, 'phone', '0509990013'),
    pg_temp.qa_want('client_contact', ARRAY[v_c1], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('client org pulse preview phone, sent from the client org',
    pg_temp.qa_resolve(v_child, 'phone', '972509990014'),
    pg_temp.qa_want('client_contact', ARRAY[v_c1], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('client org pulse phone, sent from the parent',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990013'),
    pg_temp.qa_want('client_contact', ARRAY[v_c1], NULL, NULL, false));
  -- The sender's pulse phone that is its own client's phone is a client and
  -- not the sender's staff: the guard refuses it the sender's staff alerts.
  PERFORM pg_temp.qa_expect('the sender''s pulse phone on its own card is a client',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990019'),
    pg_temp.qa_want('client_contact', ARRAY[v_c3], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('the sender''s pulse preview phone on its own card is a client',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990018'),
    pg_temp.qa_want('client_contact', ARRAY[v_c3], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('the sender''s pulse phone on no card is unknown',
    pg_temp.qa_resolve(v_agency_tenant, 'phone', '0509990016'),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('agency tenant''s own campaigner on the shared card',
    pg_temp.qa_resolve(v_agency_tenant, 'phone', '0509990011'),
    pg_temp.qa_want('client_contact', ARRAY[v_c1], NULL, NULL, false, true));
  PERFORM pg_temp.qa_expect('that campaigner, seen from the card''s tenant',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990011'),
    pg_temp.qa_want('client_contact', ARRAY[v_c1], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('lead phone',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990008'),
    pg_temp.qa_want('lead', ARRAY[]::uuid[], v_lead, NULL, false));
  PERFORM pg_temp.qa_expect('agency tenant sees the shared client',
    pg_temp.qa_resolve(v_agency_tenant, 'phone', '0509990001'),
    pg_temp.qa_want('client', ARRAY[v_c1], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('client of an unrelated tenant is out of scope',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990009'),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('the unrelated tenant sees its own client',
    pg_temp.qa_resolve(v_unrelated, 'phone', '0509990009'),
    pg_temp.qa_want('client', ARRAY[v_cx], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('unknown phone',
    pg_temp.qa_resolve(v_tenant, 'phone', '0509990010'),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('unusable phone',
    pg_temp.qa_resolve(v_tenant, 'phone', '12'),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, NULL, false));

  -- ─── Resolver: emails ─────────────────────────────────────────────────────

  PERFORM pg_temp.qa_expect('card email, any case',
    pg_temp.qa_resolve(v_tenant, 'email', ' qa-c1@EXAMPLE.invalid '),
    pg_temp.qa_want('client', ARRAY[v_c1], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('contact email',
    pg_temp.qa_resolve(v_tenant, 'email', 'qa-contact@example.invalid'),
    pg_temp.qa_want('client_contact', ARRAY[v_c1], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('member profile email on its tenant''s card is staff',
    pg_temp.qa_resolve(v_tenant, 'email', v_owner_email),
    pg_temp.qa_want('staff', ARRAY[]::uuid[], NULL, NULL, false, true));
  PERFORM pg_temp.qa_expect('lead email',
    pg_temp.qa_resolve(v_tenant, 'email', 'QA-LEAD@example.invalid'),
    pg_temp.qa_want('lead', ARRAY[]::uuid[], v_lead, NULL, false));
  PERFORM pg_temp.qa_expect('unknown email',
    pg_temp.qa_resolve(v_tenant, 'email', 'nobody@example.invalid'),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, NULL, false));

  -- ─── Resolver: groups ─────────────────────────────────────────────────────

  PERFORM pg_temp.qa_expect('group of one client',
    pg_temp.qa_resolve(v_tenant, 'group', v_g1_chat),
    pg_temp.qa_want('client_group', ARRAY[v_c1], NULL, v_g1, false));
  PERFORM pg_temp.qa_expect('group of two clients is ambiguous',
    pg_temp.qa_resolve(v_tenant, 'group', v_g2_chat),
    pg_temp.qa_want('client_group', ARRAY[v_c1, v_c2], NULL, v_g2, true));
  PERFORM pg_temp.qa_expect('team-channel link by chat id only',
    pg_temp.qa_resolve(v_tenant, 'group', v_link_chat),
    pg_temp.qa_want('client_group', ARRAY[v_c3], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('group linked to a lead',
    pg_temp.qa_resolve(v_tenant, 'group', v_lead_chat),
    pg_temp.qa_want('lead', ARRAY[]::uuid[], v_lead, NULL, false));
  PERFORM pg_temp.qa_expect('campaigner group stored without @g.us',
    pg_temp.qa_resolve(v_tenant, 'group', v_camp_group || '@g.us'),
    pg_temp.qa_want('staff', ARRAY[]::uuid[], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('unlinked group of the tenant',
    pg_temp.qa_resolve(v_tenant, 'group', v_g3_chat),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, v_g3, false));
  PERFORM pg_temp.qa_expect('group of an unrelated tenant is out of scope',
    pg_temp.qa_resolve(v_tenant, 'group', v_gx_chat),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, NULL, false));
  -- The row the sender read the chat id from counts outside the scope.
  PERFORM pg_temp.qa_expect('the sender''s group row, outside the scope',
    pg_temp.qa_resolve(v_tenant, 'group', v_gx_chat, v_gx),
    pg_temp.qa_want('client_group', ARRAY[v_cx], NULL, v_gx, false));
  PERFORM pg_temp.qa_expect('a group row of another chat id is ignored',
    pg_temp.qa_resolve(v_tenant, 'group', v_g3_chat, v_gx),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, v_g3, false));

  -- ─── Resolver: Telegram, bad input ────────────────────────────────────────

  PERFORM pg_temp.qa_expect('newest Telegram row naming a client',
    pg_temp.qa_resolve(v_tenant, 'telegram', '-100999000111'),
    pg_temp.qa_want('client', ARRAY[v_c1], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('Telegram chat of a lead',
    pg_temp.qa_resolve(v_tenant, 'telegram', '-100999000222'),
    pg_temp.qa_want('lead', ARRAY[]::uuid[], v_lead, NULL, false));
  PERFORM pg_temp.qa_expect('Telegram chat naming nobody',
    pg_temp.qa_resolve(v_tenant, 'telegram', '-100999000333'),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, NULL, false));
  PERFORM pg_temp.qa_expect('Telegram chat of another tenant',
    pg_temp.qa_resolve(v_agency_tenant, 'telegram', '-100999000111'),
    pg_temp.qa_want('unknown', ARRAY[]::uuid[], NULL, NULL, false));
  BEGIN
    PERFORM public.resolve_send_recipient(v_tenant, 'fax', '0509990001');
    RAISE EXCEPTION 'An unknown shape must raise';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.resolve_send_recipient(NULL, 'phone', '0509990001');
    RAISE EXCEPTION 'A missing tenant must raise';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- ─── Opt-in trigger ───────────────────────────────────────────────────────

  BEGIN
    INSERT INTO public.client_auto_send_opt_ins (tenant_id, client_id, send_kind, target, enabled)
    VALUES (v_child, v_c1, 'lead_alert', 'whatsapp_group', true);
    RAISE EXCEPTION 'An opt-in in another tenant than the client''s was stored';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ─── RLS: who may read and change the switches ────────────────────────────

  -- Owner: upserts on, then off; the second write is an update of one row.
  PERFORM pg_temp.qa_sign_in(v_owner, v_tenant);
  SET LOCAL ROLE authenticated;
  IF NOT public.can_manage_client_auto_sends(v_c1) THEN
    RAISE EXCEPTION 'The owner cannot manage the switches';
  END IF;
  INSERT INTO public.client_auto_send_opt_ins (tenant_id, client_id, send_kind, target, enabled)
  VALUES (v_tenant, v_c1, 'lead_alert', 'whatsapp_group', true)
  ON CONFLICT (tenant_id, client_id, send_kind, target) DO UPDATE SET enabled = EXCLUDED.enabled;
  INSERT INTO public.client_auto_send_opt_ins (tenant_id, client_id, send_kind, target, enabled, updated_by)
  VALUES (v_tenant, v_c1, 'lead_alert', 'whatsapp_group', false, v_manager)
  ON CONFLICT (tenant_id, client_id, send_kind, target) DO UPDATE SET enabled = EXCLUDED.enabled;
  SELECT * INTO v_row FROM public.client_auto_send_opt_ins AS o
  WHERE o.client_id = v_c1 AND o.send_kind = 'lead_alert' AND o.target = 'whatsapp_group';
  IF NOT FOUND OR v_row.enabled OR v_row.updated_by IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'The owner''s upsert did not store enabled = false by the owner: %', v_row;
  END IF;
  BEGIN
    DELETE FROM public.client_auto_send_opt_ins WHERE client_id = v_c1;
    RAISE EXCEPTION 'A switch was deleted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- Team manager of the client's agency: may change C1, not C3 (agency B).
  PERFORM pg_temp.qa_sign_in(v_manager, v_tenant);
  SET LOCAL ROLE authenticated;
  UPDATE public.client_auto_send_opt_ins SET enabled = true
  WHERE client_id = v_c1 AND send_kind = 'lead_alert' AND target = 'whatsapp_group';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'The team manager could not change the client''s switch';
  END IF;
  BEGIN
    INSERT INTO public.client_auto_send_opt_ins (tenant_id, client_id, send_kind, target, enabled)
    VALUES (v_tenant, v_c3, 'lead_alert', 'email', true);
    RAISE EXCEPTION 'A team manager changed a client of an agency they do not manage';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  SELECT * INTO v_row FROM public.client_auto_send_opt_ins AS o
  WHERE o.client_id = v_c1 AND o.send_kind = 'lead_alert' AND o.target = 'whatsapp_group';
  IF NOT v_row.enabled OR v_row.updated_by IS DISTINCT FROM v_manager THEN
    RAISE EXCEPTION 'The team manager''s change was not stamped: %', v_row;
  END IF;
  BEGIN
    UPDATE public.client_auto_send_opt_ins SET client_id = v_c2 WHERE id = v_row.id;
    RAISE EXCEPTION 'A switch moved to another client';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Campaigner of the client: reads, cannot change.
  PERFORM pg_temp.qa_sign_in(v_campaigner_user, v_tenant);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (SELECT 1 FROM public.client_auto_send_opt_ins WHERE client_id = v_c1) THEN
    RAISE EXCEPTION 'The client''s campaigner cannot read its switches';
  END IF;
  UPDATE public.client_auto_send_opt_ins SET enabled = false WHERE client_id = v_c1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'A campaigner changed a switch';
  END IF;
  BEGIN
    INSERT INTO public.client_auto_send_opt_ins (tenant_id, client_id, send_kind, target, enabled)
    VALUES (v_tenant, v_c1, 'automation', 'email', true);
    RAISE EXCEPTION 'A campaigner added a switch';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- Owner of an agency read_write tenant: reads the shared client, cannot change.
  PERFORM pg_temp.qa_sign_in(v_agency_owner, v_agency_tenant);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (SELECT 1 FROM public.client_auto_send_opt_ins WHERE client_id = v_c1)
    OR public.can_manage_client_auto_sends(v_c1) THEN
    RAISE EXCEPTION 'The agency tenant owner must read but not manage';
  END IF;
  BEGIN
    INSERT INTO public.client_auto_send_opt_ins (tenant_id, client_id, send_kind, target, enabled)
    VALUES (v_tenant, v_c1, 'automation', 'email', true);
    RAISE EXCEPTION 'An agency tenant owner added a switch';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- Owner of the client's own org (V09): neither reads nor changes.
  PERFORM pg_temp.qa_sign_in(v_child_owner, v_child);
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.client_auto_send_opt_ins WHERE client_id = v_c1) THEN
    RAISE EXCEPTION 'The client org owner reads the switches';
  END IF;
  BEGIN
    INSERT INTO public.client_auto_send_opt_ins (tenant_id, client_id, send_kind, target, enabled)
    VALUES (v_tenant, v_c1, 'automation', 'email', true);
    RAISE EXCEPTION 'The client org owner added a switch';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- The wrong tenant fails the same way, so it does not tell the client's.
  BEGIN
    INSERT INTO public.client_auto_send_opt_ins (tenant_id, client_id, send_kind, target, enabled)
    VALUES (v_child, v_c1, 'automation', 'email', true);
    RAISE EXCEPTION 'The client org owner added a switch in its own tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- Super admin: only while the tenant allows super admin access.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.client_auto_send_opt_ins (tenant_id, client_id, send_kind, target, enabled)
  VALUES (v_tenant, v_c1, 'campaign_alert', 'whatsapp_direct', true);
  RESET ROLE;
  UPDATE public.tenants SET allow_super_admin_access = false WHERE id = v_tenant;
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.client_auto_send_opt_ins (tenant_id, client_id, send_kind, target, enabled)
    VALUES (v_tenant, v_c1, 'automation', 'whatsapp_direct', true);
    RAISE EXCEPTION 'A super admin changed a tenant that does not allow it';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  UPDATE public.tenants SET allow_super_admin_access = true WHERE id = v_tenant;

  -- Anonymous: no access to either table.
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.client_auto_send_opt_ins;
    RAISE EXCEPTION 'anon read the switches';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.client_send_refusals;
    RAISE EXCEPTION 'anon read the refusal log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- ─── Card targets, counted as the resolver counts them ─────────────────────

  PERFORM pg_temp.qa_sign_in(v_owner, v_tenant);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.qa_expect('targets: card group, phone and email',
    (SELECT concat(t.whatsapp_group, t.whatsapp_direct, t.email) FROM public.client_auto_send_targets(v_c1) AS t),
    'ttt');
  PERFORM pg_temp.qa_expect('targets: team-channel group, contact phone and email',
    (SELECT concat(t.whatsapp_group, t.whatsapp_direct, t.email) FROM public.client_auto_send_targets(v_c3) AS t),
    'ttt');
  PERFORM pg_temp.qa_expect('targets: Carmen group access, identity phone',
    (SELECT concat(t.whatsapp_group, t.whatsapp_direct, t.email) FROM public.client_auto_send_targets(v_c4) AS t),
    'ttf');
  -- C5 has only a pending identity and a one-to-one chat link.
  PERFORM pg_temp.qa_expect('targets: none',
    (SELECT concat(t.whatsapp_group, t.whatsapp_direct, t.email) FROM public.client_auto_send_targets(v_c5) AS t),
    'fff');
  RESET ROLE;
  PERFORM pg_temp.qa_sign_in(v_child_owner, v_child);
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.client_auto_send_targets(v_c1)) THEN
    RAISE EXCEPTION 'targets: a user who cannot see the client got its targets';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- ─── client_auto_send_allowed ─────────────────────────────────────────────

  IF NOT public.client_auto_send_allowed(v_tenant, v_c1, 'lead_alert', 'whatsapp_group')
    OR NOT public.client_auto_send_allowed(v_agency_tenant, v_c1, 'lead_alert', 'whatsapp_group')
    OR public.client_auto_send_allowed(v_unrelated, v_c1, 'lead_alert', 'whatsapp_group')
    OR public.client_auto_send_allowed(v_tenant, v_c1, 'lead_alert', 'email')
    OR public.client_auto_send_allowed(v_tenant, v_c2, 'lead_alert', 'whatsapp_group') THEN
    RAISE EXCEPTION 'allowed: only an enabled switch, for a sender in the client''s scope';
  END IF;
  UPDATE public.client_auto_send_opt_ins SET enabled = false
  WHERE client_id = v_c1 AND send_kind = 'lead_alert' AND target = 'whatsapp_group';
  IF public.client_auto_send_allowed(v_tenant, v_c1, 'lead_alert', 'whatsapp_group') THEN
    RAISE EXCEPTION 'allowed: a switch turned off still allows';
  END IF;

  -- ─── broadcast_lists_recipient ───────────────────────────────────────────

  IF NOT public.broadcast_lists_recipient(v_tenant, v_broadcast, 'phone', '972509990001')
    OR NOT public.broadcast_lists_recipient(v_tenant, v_broadcast, 'group', 'renamed@g.us', v_g1)
    OR NOT public.broadcast_lists_recipient(v_tenant, v_broadcast, 'group', v_g1_chat)
    OR NOT public.broadcast_lists_recipient(v_tenant, v_broadcast, 'email', ' qa-c1@example.INVALID')
    OR public.broadcast_lists_recipient(v_tenant, v_broadcast, 'phone', '0509990008')
    OR public.broadcast_lists_recipient(v_tenant, v_broadcast, 'group', v_g2_chat, v_g2)
    OR public.broadcast_lists_recipient(v_tenant, v_broadcast, 'phone', v_g1_chat)
    OR public.broadcast_lists_recipient(v_agency_tenant, v_broadcast, 'phone', '0509990001')
    OR NOT public.broadcast_lists_recipient(v_tenant, v_other_broadcast, 'phone', '+972509990008') THEN
    RAISE EXCEPTION 'broadcast_lists_recipient: only this tenant''s broadcast and its own recipients';
  END IF;

  -- ─── Refusal log ──────────────────────────────────────────────────────────

  -- The home tenant logs refusals on its client C1, with no client, and on
  -- the client org's own client; the client org logs one on its own client,
  -- one on the parent's client C1 (its send matched the parent's card) and
  -- one with no client.
  INSERT INTO public.client_send_refusals
    (tenant_id, function_name, channel, recipient_kind, client_id, send_kind, reason, enforced)
  VALUES
    (v_tenant, 'send-green-api-message', 'whatsapp', 'client', v_c1, 'staff_alert', 'staff_only', true),
    (v_tenant, 'send-green-api-message', 'whatsapp', 'client_group', NULL, NULL, 'unclassified_service_send', false),
    (v_tenant, 'send-manus-wa-message', 'whatsapp', 'client', v_cc, 'staff_alert', 'staff_only', true),
    (v_child, 'send-manus-wa-message', 'whatsapp', 'client', v_cc, 'automation', 'not_opted_in', true),
    (v_child, 'send-manus-wa-message', 'whatsapp', 'client_contact', v_c1, 'staff_alert', 'staff_only', true),
    (v_child, 'send-manus-wa-message', 'whatsapp', 'unresolved', NULL, 'staff_alert', 'guard_error', true);

  -- The sending tenant's owner reads its refusals on clients it sees and the
  -- one with no client, not the one on the client org's own client.
  PERFORM pg_temp.qa_sign_in(v_owner, v_tenant);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
  FROM public.client_send_refusals AS r
  WHERE r.tenant_id = v_tenant
    AND (r.client_id = v_c1 OR r.client_id IS NULL);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'The owner sees % of the tenant''s 2 refusals on C1 or no client', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_send_refusals AS r WHERE r.client_id = v_cc) THEN
    RAISE EXCEPTION 'The owner reads a refusal on a client it cannot see';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_send_refusals AS r WHERE r.tenant_id = v_child) THEN
    RAISE EXCEPTION 'The owner reads the client org''s refusals';
  END IF;
  BEGIN
    INSERT INTO public.client_send_refusals (tenant_id, function_name, channel, recipient_kind, client_id, reason, enforced)
    VALUES (v_tenant, 'forged', 'whatsapp', 'client', v_c1, 'not_opted_in', true);
    RAISE EXCEPTION 'A signed-in user wrote a refusal';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A member who is not an owner reads the refusals on a client they see,
  -- not the one with no client.
  PERFORM pg_temp.qa_sign_in(v_campaigner_user, v_tenant);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.client_send_refusals AS r;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'The campaigner sees % refusals; expected only the one on C1', v_count;
  END IF;
  RESET ROLE;

  -- The client org's owner reads its own refusals on its own client and with
  -- no client, never the one naming the parent's client C1 or the parent's.
  PERFORM pg_temp.qa_sign_in(v_child_owner, v_child);
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.client_send_refusals AS r WHERE r.client_id = v_c1) THEN
    RAISE EXCEPTION 'The client org owner learns a phone of the parent''s client from its own refusal';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_send_refusals AS r WHERE r.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'The client org owner reads the home tenant''s refusals';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.client_send_refusals AS r
  WHERE r.tenant_id = v_child;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'The client org owner sees % of its 2 readable refusals', v_count;
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$test$;
SELECT 'Grants, scope, resolver (phone, email, group, Telegram, staff on own cards, pulse phones), opt-in trigger, switch RLS, card targets, allowed, broadcast recipients and refusal log passed' AS result;
ROLLBACK;
