-- Client update reads (20261126200000_client_updates_read_scope): whoever can
-- see a client reads every entry on its card, whichever org wrote it; an org
-- member who cannot see the client (a campaigner not assigned to it) and a
-- user of an unrelated org read none of its entries.
-- Synthetic users, tenants, clients and entries inside one transaction that is
-- rolled back.
BEGIN;

-- Signs in as the user; the caller then switches to the authenticated role.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$fn$;

-- Entries of one client the signed-in user can read.
CREATE FUNCTION pg_temp.qa_visible_entries(p_client uuid)
RETURNS integer
LANGUAGE sql
AS $fn$
  SELECT count(*)::integer FROM public.client_updates WHERE client_id = p_client
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_owner uuid := gen_random_uuid();
  v_assigned uuid := gen_random_uuid();
  v_unassigned uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_partner uuid := gen_random_uuid();
  v_own uuid;
  v_other uuid;
  v_partner_tenant uuid;
  v_agency uuid;
  v_client uuid;
  v_campaigner uuid;
  v_unassigned_campaigner uuid;
  v_seen integer;
  r record;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-cur-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_owner, v_assigned, v_unassigned, v_outsider, v_partner]) AS u;

  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-cur-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-cur-other-' || v_tag) RETURNING id INTO v_other;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK partner', 'qa-cur-partner-' || v_tag) RETURNING id INTO v_partner_tenant;

  -- The owner owns the client's org; two campaigners there, one assigned to
  -- the client and one not; the outsider owns an unrelated org; the partner
  -- owns an org the client's agency is shared with read_only.
  INSERT INTO public.tenant_users (user_id, tenant_id, role) VALUES
    (v_owner, v_own, 'owner'),
    (v_assigned, v_own, 'member'),
    (v_unassigned, v_own, 'member'),
    (v_outsider, v_other, 'owner'),
    (v_partner, v_partner_tenant, 'owner');
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (v_owner, v_own),
    (v_assigned, v_own),
    (v_unassigned, v_own),
    (v_outsider, v_other),
    (v_partner, v_partner_tenant)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (v_owner, 'owner', v_own),
    (v_assigned, 'campaigner', v_own),
    (v_unassigned, 'campaigner', v_own),
    (v_outsider, 'owner', v_other),
    (v_partner, 'owner', v_partner_tenant);

  INSERT INTO public.agencies (name, tenant_id)
  VALUES ('QA ROLLBACK agency', v_own) RETURNING id INTO v_agency;
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES ('QA ROLLBACK client', v_own, v_agency) RETURNING id INTO v_client;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (v_own, v_agency, v_partner_tenant, 'read_only');

  INSERT INTO public.campaigners (full_name, tenant_id)
  VALUES ('QA ROLLBACK assigned', v_own) RETURNING id INTO v_campaigner;
  INSERT INTO public.campaigners (full_name, tenant_id)
  VALUES ('QA ROLLBACK unassigned', v_own) RETURNING id INTO v_unassigned_campaigner;
  UPDATE public.profiles SET campaigner_id = v_campaigner WHERE id = v_assigned;
  UPDATE public.profiles SET campaigner_id = v_unassigned_campaigner WHERE id = v_unassigned;
  INSERT INTO public.client_team (client_id, campaigner_id) VALUES (v_client, v_campaigner);

  -- One card: the owner's entry, Carmen's entry, and one the partner org wrote.
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, update_type) VALUES
    (v_client, v_own, v_owner, 'QA ROLLBACK owner ' || v_tag, 'general'),
    (v_client, v_partner_tenant, v_partner, 'QA ROLLBACK partner ' || v_tag, 'general');
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, update_type, source)
  VALUES (v_client, v_own, v_owner, 'QA ROLLBACK carmen ' || v_tag, 'red_flag', 'carmen');

  -- Who reads the card: everyone who can see the client reads all three
  -- entries; no one else reads any.
  FOR r IN
    SELECT * FROM (VALUES
      (v_owner, true, 'the owner'),
      (v_assigned, true, 'the assigned campaigner'),
      (v_partner, true, 'the shared org''s owner'),
      (v_unassigned, false, 'a campaigner not assigned to the client'),
      (v_outsider, false, 'another org''s owner')
    ) AS t (user_id, sees_client, label)
  LOOP
    PERFORM pg_temp.qa_sign_in(r.user_id);
    SET LOCAL ROLE authenticated;
    IF EXISTS (SELECT 1 FROM public.clients WHERE id = v_client) IS DISTINCT FROM r.sees_client THEN
      RAISE EXCEPTION 'setup: % must % the client', r.label,
        CASE WHEN r.sees_client THEN 'see' ELSE 'not see' END;
    END IF;
    v_seen := pg_temp.qa_visible_entries(v_client);
    RESET ROLE;
    IF r.sees_client AND v_seen <> 3 THEN
      RAISE EXCEPTION '% must read all 3 entries on the card, read %', r.label, v_seen;
    END IF;
    IF NOT r.sees_client AND v_seen <> 0 THEN
      RAISE EXCEPTION '% must read no entry of a client they cannot see, read %', r.label, v_seen;
    END IF;
  END LOOP;

  -- The org-wide read policy is gone; the client-scoped one is the only one.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_updates'
      AND cmd = 'SELECT' AND policyname <> 'Users view card entries of clients they can see'
  ) THEN
    RAISE EXCEPTION 'client_updates must have no SELECT policy beside the client-scoped one';
  END IF;

  RAISE NOTICE 'client_updates_read_scope: all checks passed';
END
$test$;

ROLLBACK;
