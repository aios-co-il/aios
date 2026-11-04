-- Deactivating and deleting users keeps their history
-- (20261104100000_user_deactivate_keep_history.sql). Synthetic tenants, users
-- and rows; full rollback. Runs on a scratch database, a Preview branch or
-- Staging.
--
-- 1. Delete: offboard_tenant_member(..., 'deleted') keeps the profile and the
--    name, anonymizes the email, removes memberships, roles and sessions;
--    members read the writer's name and status through
--    tenant_departed_members, never the rest of the profile.
-- 2. Hard delete (dashboard or SQL): the auth.users delete succeeds and the
--    history rows stay with no author.
-- 3. Deactivate: the member loses the organization (also the clients and
--    agencies their campaigner card there gave them while another
--    organization stays), leaves the assignee pickers and Carmen's staff,
--    keeps their name in history; sessions end when no organization is left.
--    Reactivating restores membership (original created_at), member roles and
--    card, never super_admin.
-- 4. Ranks, in the organization acted on: a super admin acting in it acts on
--    anyone but a super admin; an owner of a parent organization on everyone
--    in it; an owner on everyone in it but another owner. A member's other
--    organizations are not touched. Refusals: self, a super admin, the last
--    owner, a non-member, a deleted member; clients cannot call the functions.
-- 5. tenant_inactive_members: members read it; no client writes it, so an
--    owner can neither plant a row (to read a stranger's profile) nor rewrite
--    the roles a reactivation restores.
-- 6. handle_new_user links only an open invitation: a deleted user who signs
--    up again gets nothing back; a new invitation still links (AIO-326).
-- 7. A user cannot change their own deleted_at, status or email.
-- 8. The pulse "last call by" line names a departed caller and never shows a
--    deleted user's anonymized email.
-- 9. client_updates_keep_owner still refuses a person changing user_id.
BEGIN;
DO $test$
DECLARE
  t_a uuid; t_b uuid; t_p uuid; t_c uuid; agency_a uuid; client_a uuid; client_b uuid; task_w uuid; task_h uuid;
  owner_a uuid := gen_random_uuid(); owner_b uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid(); writer uuid := gen_random_uuid();
  nameless uuid := gen_random_uuid(); hard uuid := gen_random_uuid();
  solo uuid := gen_random_uuid(); mover uuid := gen_random_uuid();
  extra uuid := gen_random_uuid(); admin uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid(); rejoiner uuid := gen_random_uuid();
  owner2_a uuid := gen_random_uuid(); dual uuid := gen_random_uuid(); owner_p uuid := gen_random_uuid();
  co_c uuid := gen_random_uuid();
  rejoiner2 uuid := gen_random_uuid(); late uuid := gen_random_uuid();
  rejoin_email text := 'qa-rejoin-' || gen_random_uuid() || '@example.invalid';
  late_email text := 'qa-late-' || gen_random_uuid() || '@example.invalid';
  card_writer uuid; card_solo uuid; card_mover uuid; solo_session uuid; mover_session uuid;
  cu_writer uuid; cu_hard uuid; cu_viewer uuid; tu_writer uuid; tu_hard uuid;
  solo_since timestamptz;
  r record;
  v_name text;
  v_count integer;
  v_failed boolean;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  SELECT u.id, 'qa-deact-' || u.id || '@example.invalid', jsonb_build_object('full_name', u.name)
  FROM (VALUES (owner_a, 'QA Owner A'), (owner_b, 'QA Owner B'), (viewer, 'QA Viewer'),
               (writer, 'QA Writer'), (nameless, ''), (hard, 'QA Hard'), (solo, 'QA Solo'),
               (mover, 'QA Mover'), (extra, 'QA Extra'), (admin, 'QA Admin'),
               (outsider, 'QA Outsider'), (owner2_a, 'QA Co-owner A'), (dual, 'QA Dual'),
               (owner_p, 'QA Owner P'), (co_c, 'QA Co-owner C')) AS u(id, name);
  UPDATE public.profiles SET phone = '+972500000123' WHERE id IN (solo, outsider);
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK P', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_p;
  INSERT INTO public.tenants (name, slug, parent_tenant_id)
  VALUES ('QA ROLLBACK A', 'qa-rollback-' || gen_random_uuid(), t_p) RETURNING id INTO t_a;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK B', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_b;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK C', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_c;
  INSERT INTO public.tenant_users (tenant_id, user_id, role, created_at) VALUES
    (t_a, owner_a, 'owner', now()), (t_a, viewer, 'member', now()), (t_a, writer, 'member', now()),
    (t_a, nameless, 'member', now()), (t_a, hard, 'member', now()),
    (t_a, solo, 'member', '2025-01-01 10:00+00'), (t_a, mover, 'member', now()),
    (t_a, extra, 'member', now()), (t_b, owner_b, 'owner', now()), (t_b, mover, 'member', now()),
    (t_a, owner2_a, 'owner', now()), (t_a, dual, 'member', now()), (t_b, dual, 'owner', now()),
    (t_p, owner_p, 'owner', now()), (t_c, admin, 'owner', now()), (t_c, co_c, 'owner', now());
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (owner_a, 'owner', t_a), (owner_b, 'owner', t_b), (viewer, 'campaigner', t_a),
    (writer, 'campaigner', t_a), (nameless, 'campaigner', t_a), (hard, 'campaigner', t_a),
    (solo, 'campaigner', t_a), (mover, 'campaigner', t_a), (mover, 'campaigner', t_b),
    (admin, 'super_admin', NULL), (owner2_a, 'owner', t_a), (dual, 'campaigner', t_a),
    (dual, 'owner', t_b), (owner_p, 'owner', t_p), (admin, 'owner', t_c), (co_c, 'owner', t_c);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (owner_a, t_a), (owner_b, t_b), (viewer, t_a), (writer, t_a), (solo, t_a),
    (mover, t_a), (admin, t_a)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;
  INSERT INTO public.campaigners (full_name, tenant_id, active)
  VALUES ('QA Writer card', t_a, true) RETURNING id INTO card_writer;
  INSERT INTO public.campaigners (full_name, tenant_id, active)
  VALUES ('QA Solo card', t_a, true) RETURNING id INTO card_solo;
  INSERT INTO public.campaigners (full_name, tenant_id, active)
  VALUES ('QA Mover card', t_a, true) RETURNING id INTO card_mover;
  UPDATE public.profiles SET campaigner_id = card_writer WHERE id = writer;
  UPDATE public.profiles SET campaigner_id = card_solo WHERE id = solo;
  UPDATE public.profiles SET campaigner_id = card_mover WHERE id = mover;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA agency', t_a) RETURNING id INTO agency_a;
  INSERT INTO public.clients (name, agency_id, tenant_id) VALUES ('QA client', agency_a, t_a)
  RETURNING id INTO client_a;
  INSERT INTO public.clients (name, agency_id, tenant_id) VALUES ('QA client 2', agency_a, t_a)
  RETURNING id INTO client_b;
  INSERT INTO public.campaigner_agencies (campaigner_id, agency_id) VALUES (card_mover, agency_a);
  INSERT INTO public.client_team (client_id, campaigner_id) VALUES (client_a, card_mover);
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content)
  VALUES (client_a, t_a, writer, 'written by the writer') RETURNING id INTO cu_writer;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content)
  VALUES (client_a, t_a, hard, 'written by hard') RETURNING id INTO cu_hard;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content)
  VALUES (client_a, t_a, viewer, 'written by the viewer') RETURNING id INTO cu_viewer;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content)
  VALUES (client_a, t_a, solo, 'written by solo');
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, update_type, counts_as_contact, created_at)
  VALUES (client_a, t_a, nameless, 'called them', 'call', true, now()),
         (client_b, t_a, writer, 'called them', 'call', true, now());
  INSERT INTO public.tasks (title, agency_id, tenant_id, created_by)
  VALUES ('QA task by writer', agency_a, t_a, writer) RETURNING id INTO task_w;
  INSERT INTO public.tasks (title, agency_id, tenant_id, created_by)
  VALUES ('QA task by hard', agency_a, t_a, hard) RETURNING id INTO task_h;
  INSERT INTO public.task_updates (task_id, user_id, content)
  VALUES (task_w, writer, 'task note by writer') RETURNING id INTO tu_writer;
  INSERT INTO public.task_updates (task_id, user_id, content)
  VALUES (task_h, hard, 'task note by hard') RETURNING id INTO tu_hard;
  INSERT INTO auth.sessions (id, user_id) VALUES (gen_random_uuid(), solo) RETURNING id INTO solo_session;
  INSERT INTO auth.refresh_tokens (token, user_id, session_id) VALUES ('qa', solo::text, solo_session);
  INSERT INTO auth.sessions (id, user_id) VALUES (gen_random_uuid(), mover) RETURNING id INTO mover_session;
  INSERT INTO auth.sessions (id, user_id) VALUES (gen_random_uuid(), writer);

  -- 1. Delete keeps the profile, the name and the history.
  SET LOCAL ROLE service_role;
  SELECT * INTO r FROM public.offboard_tenant_member(t_a, writer, owner_a, 'deleted');
  RESET ROLE;
  IF r.remaining_tenants <> 0 OR NOT r.account_deleted THEN
    RAISE EXCEPTION 'delete: expected (0, true), got (%, %)', r.remaining_tenants, r.account_deleted;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = writer AND full_name = 'QA Writer' AND deleted_at IS NOT NULL
      AND status = 'inactive' AND email = 'deleted-' || writer || '@deleted.invalid'
  ) THEN
    RAISE EXCEPTION 'delete: the profile is not kept with its name and an anonymized email';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = writer)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = writer)
    OR EXISTS (SELECT 1 FROM public.user_active_tenant WHERE user_id = writer)
    OR EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = writer) THEN
    RAISE EXCEPTION 'delete: memberships, roles, the active tenant or a session are left';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_updates WHERE id = cu_writer AND user_id = writer)
    OR NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = task_w AND created_by = writer)
    OR NOT EXISTS (SELECT 1 FROM public.task_updates WHERE id = tu_writer AND user_id = writer) THEN
    RAISE EXCEPTION 'delete: a history row lost its writer';
  END IF;
  IF (SELECT active FROM public.campaigners WHERE id = card_writer)
    OR (SELECT status FROM public.tenant_inactive_members WHERE tenant_id = t_a AND user_id = writer) <> 'deleted' THEN
    RAISE EXCEPTION 'delete: the card is still active or the organization has no deleted record';
  END IF;
  -- GoTrue's soft delete only updates auth.users, so nothing cascades.
  UPDATE auth.users SET email = NULL, deleted_at = now() WHERE id = writer;
  SET LOCAL ROLE service_role;
  PERFORM public.offboard_tenant_member(t_a, nameless, owner_a, 'deleted');
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', viewer::text, true);
  SET LOCAL ROLE authenticated;
  SELECT d.full_name || ' ' || d.status INTO v_name
  FROM public.client_updates u
  JOIN public.tenant_departed_members(ARRAY[t_a]) d ON d.user_id = u.user_id
  WHERE u.id = cu_writer;
  IF v_name IS DISTINCT FROM 'QA Writer deleted' THEN
    RAISE EXCEPTION 'delete: a member reads % as the card entry''s writer, not QA Writer deleted', v_name;
  END IF;
  SELECT count(*) INTO v_count FROM public.profiles WHERE id = writer;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'delete: a member reads the deleted writer''s whole profile';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'delete: profile and name kept, email anonymized, sessions ended; members read only name and status';

  -- 2. A hard delete keeps the history rows with no author.
  DELETE FROM auth.users WHERE id = hard;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = hard)
    OR NOT EXISTS (SELECT 1 FROM public.client_updates WHERE id = cu_hard AND user_id IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = task_h AND created_by IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.task_updates WHERE id = tu_hard AND user_id IS NULL) THEN
    RAISE EXCEPTION 'hard delete: a history row was deleted or kept its author';
  END IF;
  RAISE NOTICE 'hard delete: auth.users delete succeeds; card entry, task and task note stay with no author';

  -- 3. Deactivate hides the member from pickers and staff, history keeps the name.
  SELECT created_at INTO solo_since FROM public.tenant_users WHERE tenant_id = t_a AND user_id = solo;
  SET LOCAL ROLE service_role;
  SELECT * INTO r FROM public.offboard_tenant_member(t_a, solo, owner_a, 'inactive');
  RESET ROLE;
  IF r.remaining_tenants <> 0 OR r.account_deleted THEN
    RAISE EXCEPTION 'deactivate: expected (0, false), got (%, %)', r.remaining_tenants, r.account_deleted;
  END IF;
  IF EXISTS (SELECT 1 FROM public.campaigners WHERE tenant_id = t_a AND active AND id = card_solo) THEN
    RAISE EXCEPTION 'deactivate: the member''s card is still in the assignee pickers';
  END IF;
  IF EXISTS (SELECT 1 FROM public.carmen_report_staff_rows(t_a) AS s WHERE s.user_id = solo) THEN
    RAISE EXCEPTION 'deactivate: the member is still Carmen staff';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = solo)
    OR EXISTS (SELECT 1 FROM auth.refresh_tokens WHERE user_id = solo::text) THEN
    RAISE EXCEPTION 'deactivate: a member with no organization left keeps a session';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_inactive_members
    WHERE tenant_id = t_a AND user_id = solo AND status = 'inactive' AND member_role = 'member'
      AND roles = ARRAY['campaigner']::public.app_role[] AND campaigner_was_active
      AND member_since = solo_since
  ) OR EXISTS (SELECT 1 FROM public.tenant_users WHERE tenant_id = t_a AND user_id = solo)
    OR (SELECT deleted_at FROM public.profiles WHERE id = solo) IS NOT NULL THEN
    RAISE EXCEPTION 'deactivate: the membership was not moved aside, or the profile was deleted';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', viewer::text, true);
  SET LOCAL ROLE authenticated;
  SELECT d.full_name || ' ' || d.status INTO v_name
  FROM public.tenant_departed_members(ARRAY[t_a, t_b]) d WHERE d.user_id = solo;
  IF v_name IS DISTINCT FROM 'QA Solo inactive' THEN
    RAISE EXCEPTION 'deactivate: a member reads % for solo, not QA Solo inactive', v_name;
  END IF;
  SELECT count(*) INTO v_count FROM public.profiles WHERE id = solo AND phone IS NOT NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'deactivate: a member reads the inactive member''s phone';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', owner_b::text, true);
  SELECT count(*) INTO v_count FROM public.tenant_departed_members(ARRAY[t_a]);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'deactivate: another organization''s owner reads A''s departed members';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', solo::text, true);
  IF public.user_is_tenant_member(t_a) OR public.get_user_tenant_id(solo) IS NOT NULL THEN
    RAISE EXCEPTION 'deactivate: the inactive member still reaches the organization';
  END IF;
  RESET ROLE;

  SET LOCAL ROLE service_role;
  -- The owner of A deactivates, in A only, a member who also works in B.
  SELECT * INTO r FROM public.offboard_tenant_member(t_a, mover, owner_a, 'inactive');
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_users WHERE tenant_id = t_b AND user_id = mover)
    OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE tenant_id = t_b AND user_id = mover AND role = 'campaigner') THEN
    RAISE EXCEPTION 'deactivate: the member''s B membership or role changed';
  END IF;
  IF r.remaining_tenants <> 1 OR r.account_deleted OR public.get_user_tenant_id(mover) <> t_b
    OR NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id = mover_session) THEN
    RAISE EXCEPTION 'deactivate: a member of two organizations should keep B and their session, got (%, %)',
      r.remaining_tenants, r.account_deleted;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', mover::text, true);
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.clients WHERE tenant_id = t_a)
    OR EXISTS (SELECT 1 FROM public.agencies WHERE tenant_id = t_a)
    OR cardinality(coalesce(public.get_user_client_ids(mover), '{}')) <> 0
    OR public.get_user_agency_ids(mover) IS NOT NULL THEN
    RAISE EXCEPTION 'deactivate: a member still active in B reads A''s clients or agencies through their card';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'deactivate: out of the organization, its clients, the pickers and Carmen staff; history reads QA Solo (inactive)';

  -- A row that somehow holds super_admin still restores only member roles.
  UPDATE public.tenant_inactive_members SET roles = '{super_admin,campaigner}'
  WHERE tenant_id = t_a AND user_id = solo;
  SET LOCAL ROLE service_role;
  PERFORM public.reactivate_tenant_member(t_a, solo, owner_a);
  RESET ROLE;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = t_a AND user_id = solo AND role = 'member' AND created_at = solo_since
  )
    OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE tenant_id = t_a AND user_id = solo AND role = 'campaigner')
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = solo AND role = 'super_admin')
    OR NOT (SELECT active FROM public.campaigners WHERE id = card_solo)
    OR EXISTS (SELECT 1 FROM public.tenant_inactive_members WHERE tenant_id = t_a AND user_id = solo) THEN
    RAISE EXCEPTION 'reactivate: membership, created_at, role or card not restored, or super_admin restored';
  END IF;
  -- Joining again (an invitation) makes a member active again.
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES (t_a, mover, 'member');
  IF EXISTS (SELECT 1 FROM public.tenant_inactive_members WHERE tenant_id = t_a AND user_id = mover) THEN
    RAISE EXCEPTION 'rejoin: the inactive record outlived a new membership';
  END IF;
  RAISE NOTICE 'reactivate: membership (original created_at), campaigner role and card restored, never super_admin';

  -- 4. Ranks.
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.offboard_tenant_member(t_a, owner2_a, owner_a, 'inactive');
    RAISE EXCEPTION 'rank: an owner deactivated a co-owner';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  -- The owner of A deactivates, then deletes, in A only, someone who is an owner in B.
  SELECT * INTO r FROM public.offboard_tenant_member(t_a, dual, owner_a, 'inactive');
  IF r.remaining_tenants <> 1 OR r.account_deleted THEN
    RAISE EXCEPTION 'rank: deactivating in A reached beyond A, got (%, %)', r.remaining_tenants, r.account_deleted;
  END IF;
  SELECT * INTO r FROM public.offboard_tenant_member(t_a, dual, owner_a, 'deleted');
  IF r.remaining_tenants <> 1 OR r.account_deleted THEN
    RAISE EXCEPTION 'rank: deleting from A deleted the account of an owner of B';
  END IF;
  -- The super admin acting in A deactivates a co-owner; another owner remains.
  SELECT * INTO r FROM public.offboard_tenant_member(t_a, owner2_a, admin, 'inactive');
  BEGIN
    PERFORM public.reactivate_tenant_member(t_a, owner2_a, owner_a);
    RAISE EXCEPTION 'rank: an owner reactivated an inactive co-owner';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  -- An owner of the parent organization ranks above A's owners.
  PERFORM public.reactivate_tenant_member(t_a, owner2_a, owner_p);
  -- A super admin who also owns C, acting in A, is only an owner of C: C's co-owner is out of reach.
  BEGIN
    PERFORM public.offboard_tenant_member(t_c, co_c, admin, 'inactive');
    RAISE EXCEPTION 'rank: a super admin acting in A deactivated a co-owner of C';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;
  UPDATE public.user_active_tenant SET tenant_id = t_c WHERE user_id = admin;
  SET LOCAL ROLE service_role;
  -- Acting in C, the super admin ranks above C's co-owner.
  PERFORM public.offboard_tenant_member(t_c, co_c, admin, 'inactive');
  RESET ROLE;
  UPDATE public.user_active_tenant SET tenant_id = t_a WHERE user_id = admin;
  IF EXISTS (SELECT 1 FROM public.tenant_users WHERE tenant_id = t_c AND user_id = co_c) THEN
    RAISE EXCEPTION 'rank: the super admin acting in C did not deactivate the co-owner';
  END IF;
  IF NOT public.tenant_member_is_owner(t_a, owner2_a)
    OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = dual AND tenant_id = t_a)
    OR NOT public.tenant_member_is_owner(t_b, dual)
    OR (SELECT deleted_at FROM public.profiles WHERE id = dual) IS NOT NULL THEN
    RAISE EXCEPTION 'rank: the co-owner is not an owner again, or the owner of B was touched outside A';
  END IF;
  IF public.actor_may_manage_member(owner_b, mover, t_a) OR public.actor_may_manage_member(owner_a, owner_p, t_p)
    OR NOT public.actor_may_manage_member(owner_p, owner_a, t_a) THEN
    RAISE EXCEPTION 'rank: actor_may_manage_member disagrees with the rules';
  END IF;
  -- The parent owner deactivates the co-owner again, so owner_a is the last owner below.
  SET LOCAL ROLE service_role;
  PERFORM public.offboard_tenant_member(t_a, owner2_a, owner_p, 'inactive');
  RESET ROLE;
  RAISE NOTICE 'ranks: co-owner refused; members and owners of B handled in A only; super admin (only where acting) and parent owner allowed';

  -- Refusals, before anything changes.
  SET LOCAL ROLE service_role;
  FOR r IN
    SELECT * FROM (VALUES
      ('the last owner', owner_a, admin, 'inactive', '23514'),
      ('the actor', owner_a, owner_a, 'deleted', '42501'),
      ('a super admin', admin, owner_a, 'inactive', '42501'),
      ('a non-member', outsider, owner_a, 'inactive', 'P0002'),
      ('a deleted member', writer, owner_a, 'inactive', '22023')
    ) AS c(label, target, actor, status, code)
  LOOP
    BEGIN
      PERFORM public.offboard_tenant_member(t_a, r.target, r.actor, r.status);
      RAISE EXCEPTION 'refusal: offboarding % went through', r.label;
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE <> r.code THEN
        RAISE EXCEPTION 'refusal: offboarding % failed with % (%), expected %', r.label, SQLSTATE, SQLERRM, r.code;
      END IF;
    END;
  END LOOP;
  BEGIN
    PERFORM public.reactivate_tenant_member(t_a, writer, owner_a);
    RAISE EXCEPTION 'refusal: a deleted member was reactivated';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
  BEGIN
    PERFORM public.reactivate_tenant_member(t_a, admin, owner_a);
    RAISE EXCEPTION 'refusal: a super admin was reactivated';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_users WHERE tenant_id = t_a AND user_id = owner_a) THEN
    RAISE EXCEPTION 'refusal: the last owner was removed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.offboard_tenant_member(t_a, viewer, owner_a, 'deleted');
    RAISE EXCEPTION 'grants: a signed-in owner called offboard_tenant_member';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.reactivate_tenant_member(t_a, mover, owner_a);
    RAISE EXCEPTION 'grants: a signed-in owner called reactivate_tenant_member';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'refusals: self, super admin, last owner, non-member, deleted member; server only';

  -- 5. No client writes tenant_inactive_members.
  SET LOCAL ROLE service_role;
  PERFORM public.offboard_tenant_member(t_a, extra, owner_a, 'inactive');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    -- Attack 1: a row for a stranger would open their profile to the owner.
    INSERT INTO public.tenant_inactive_members (tenant_id, user_id, status) VALUES (t_a, outsider, 'inactive');
    RAISE EXCEPTION 'rls: an owner planted a row for a stranger';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = outsider) THEN
    RAISE EXCEPTION 'rls: an owner reads a stranger''s profile';
  END IF;
  BEGIN
    -- Attack 2: rewriting the roles a reactivation restores.
    UPDATE public.tenant_inactive_members SET roles = '{super_admin,owner}' WHERE tenant_id = t_a AND user_id = extra;
    RAISE EXCEPTION 'rls: an owner rewrote the stored roles';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.tenant_inactive_members WHERE tenant_id = t_a;
    RAISE EXCEPTION 'rls: an owner deleted rows';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', viewer::text, true);
  SELECT count(*) INTO v_count FROM public.tenant_inactive_members WHERE tenant_id = t_a;
  IF v_count = 0 THEN RAISE EXCEPTION 'rls: a member cannot read its organization''s rows'; END IF;
  PERFORM set_config('request.jwt.claim.sub', owner_b::text, true);
  SELECT count(*) INTO v_count FROM public.tenant_inactive_members WHERE tenant_id = t_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'rls: another organization''s owner reads A''s rows'; END IF;
  RESET ROLE;
  UPDATE public.user_active_tenant SET tenant_id = t_b WHERE user_id = admin;
  PERFORM set_config('request.jwt.claim.sub', admin::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.tenant_inactive_members WHERE tenant_id = t_a;
  IF v_count = 0 THEN RAISE EXCEPTION 'rls: a super admin cannot read every organization'; END IF;
  BEGIN
    INSERT INTO public.tenant_inactive_members (tenant_id, user_id, status) VALUES (t_b, outsider, 'inactive');
    RAISE EXCEPTION 'rls: a super admin wrote a row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  PERFORM public.reactivate_tenant_member(t_a, extra, owner_a);
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = extra AND role IN ('super_admin', 'owner')) THEN
    RAISE EXCEPTION 'rls: a reactivation restored roles the member never held';
  END IF;
  RAISE NOTICE 'tenant_inactive_members: members read; no client writes; planted rows and rewritten roles refused';

  -- 6. handle_new_user links only an open invitation.
  INSERT INTO public.invitation_tokens (token, tenant_id, created_by, email, metadata, expires_at)
  VALUES (gen_random_uuid()::text, t_a, owner_a, rejoin_email,
          '{"role": "team_manager", "modulePermissions": ["finance"]}', now() + interval '7 days');
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (rejoiner, rejoin_email, '{"full_name": "QA Rejoiner"}');
  IF NOT EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = rejoiner AND tenant_id = t_a AND role = 'team_manager')
    OR NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = rejoiner AND module = 'finance') THEN
    RAISE EXCEPTION 'invitation: an open invitation no longer links a new account';
  END IF;
  UPDATE public.invitation_tokens SET used = true, used_by = rejoiner, used_at = now() WHERE email = rejoin_email;
  SET LOCAL ROLE service_role;
  PERFORM public.offboard_tenant_member(t_a, rejoiner, owner_a, 'deleted');
  RESET ROLE;
  UPDATE auth.users SET email = 'obfuscated-' || id, deleted_at = now() WHERE id = rejoiner;
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (rejoiner2, rejoin_email, '{"full_name": "QA Rejoiner again"}');
  IF EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = rejoiner2)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = rejoiner2)
    OR EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = rejoiner2) THEN
    RAISE EXCEPTION 'invitation: a deleted user signing up again got the old organization back';
  END IF;
  INSERT INTO public.invitation_tokens (token, tenant_id, created_by, email, metadata, expires_at)
  VALUES (gen_random_uuid()::text, t_a, owner_a, late_email, '{"role": "campaigner"}', now() - interval '1 day');
  INSERT INTO auth.users (id, email) VALUES (late, late_email);
  IF EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = late) THEN
    RAISE EXCEPTION 'invitation: an expired invitation linked a new account';
  END IF;
  RAISE NOTICE 'invitations: an open one links; a used or expired one never does';

  -- 7. A user cannot change their own deleted_at, status or email.
  PERFORM set_config('request.jwt.claim.sub', solo::text, true);
  SET LOCAL ROLE authenticated;
  FOR r IN
    SELECT * FROM (VALUES
      ('deleted_at', 'now()'), ('status', '''pending'''), ('email', '''x@example.invalid''')
    ) AS c(col, val)
  LOOP
    v_failed := false;
    BEGIN
      EXECUTE format('update public.profiles set %I = %s where id = %L', r.col, r.val, solo);
    EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
    END;
    IF NOT v_failed THEN RAISE EXCEPTION 'profiles: a user changed their own %', r.col; END IF;
  END LOOP;
  UPDATE public.profiles SET full_name = 'QA Solo renamed' WHERE id = solo;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'profiles: a user cannot change their own name'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE service_role;
  UPDATE public.profiles SET status = 'active' WHERE id = solo;
  RESET ROLE;
  RAISE NOTICE 'profiles: deleted_at, status and email are not the user''s own to change';

  -- 8. The pulse "last call by" line (campaign-pulse-snapshot, service role).
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE service_role;
  SELECT string_agg(l.last_client_call_by, ' | ' ORDER BY l.client_id = client_a) INTO v_name
  FROM public.get_latest_client_call_updates(ARRAY[client_a, client_b]) l;
  IF v_name IS DISTINCT FROM 'QA Writer | משתמש שנמחק' THEN
    RAISE EXCEPTION 'last call: expected the departed writer''s name and a deleted user without a name, got %', v_name;
  END IF;
  RESET ROLE;
  RAISE NOTICE 'last call: a departed caller keeps their name; an anonymized email never shows';

  -- 9. A person still cannot change who wrote a card entry.
  PERFORM set_config('request.jwt.claim.sub', viewer::text, true);
  SET LOCAL ROLE authenticated;
  v_failed := false;
  BEGIN
    UPDATE public.client_updates SET user_id = NULL WHERE id = cu_viewer;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'keep owner: a person cleared the writer of their entry'; END IF;
  v_failed := false;
  BEGIN
    UPDATE public.client_updates SET user_id = owner_a WHERE id = cu_viewer;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'keep owner: a person moved their entry to another writer'; END IF;
  RESET ROLE;
  RAISE NOTICE 'keep owner: user_id changes only through the key''s SET NULL';
END;
$test$;
SELECT 'Deactivate and delete keep history and names; access, pickers, staff and invitations follow the membership' AS result;
ROLLBACK;
