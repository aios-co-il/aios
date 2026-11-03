-- Deactivating and deleting users keeps their history
-- (20261103110000_user_deactivate_keep_history.sql). Synthetic tenants, users
-- and rows; full rollback. Runs on a scratch database, a Preview branch or
-- Staging.
--
-- 1. Delete: offboard_tenant_member(..., 'deleted') keeps the profile and the
--    name, anonymizes the email, removes memberships and roles, and members
--    still read the writer's name on their card entries and tasks.
-- 2. Hard delete (dashboard or SQL): the auth.users delete succeeds and the
--    history rows stay with no author (before: tasks_created_by_fkey refused
--    it, and the profile delete took the card entries with it).
-- 3. Deactivate: the member loses the organization, leaves the assignee
--    pickers (active cards) and Carmen's staff, and keeps their name in
--    history; reactivating restores membership, roles and card.
-- 4. Refusals: self, a super admin, the last owner, a non-member, a deleted
--    member; clients cannot call the functions.
-- 5. RLS on tenant_inactive_members: members read; the owner or a super admin
--    acting in the organization writes, never their own row.
-- 6. client_updates_keep_owner still refuses a person changing user_id.
BEGIN;
DO $test$
DECLARE
  t_a uuid; t_b uuid; agency_a uuid; client_a uuid; task_w uuid; task_h uuid;
  owner_a uuid := gen_random_uuid(); owner_b uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid(); writer uuid := gen_random_uuid();
  hard uuid := gen_random_uuid(); solo uuid := gen_random_uuid();
  mover uuid := gen_random_uuid(); extra uuid := gen_random_uuid();
  admin uuid := gen_random_uuid();
  card_writer uuid; card_solo uuid;
  cu_writer uuid; cu_hard uuid; cu_viewer uuid; tu_writer uuid; tu_hard uuid;
  r record;
  v_name text;
  v_count integer;
  v_failed boolean;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  SELECT u.id, 'qa-deact-' || u.id || '@example.invalid', jsonb_build_object('full_name', u.name)
  FROM (VALUES (owner_a, 'QA Owner A'), (owner_b, 'QA Owner B'), (viewer, 'QA Viewer'),
               (writer, 'QA Writer'), (hard, 'QA Hard'), (solo, 'QA Solo'),
               (mover, 'QA Mover'), (extra, 'QA Extra'), (admin, 'QA Admin')) AS u(id, name);
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK A', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_a;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK B', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_b;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (t_a, owner_a, 'owner'), (t_a, viewer, 'member'), (t_a, writer, 'member'),
    (t_a, hard, 'member'), (t_a, solo, 'member'), (t_a, mover, 'member'),
    (t_a, extra, 'member'), (t_b, owner_b, 'owner'), (t_b, mover, 'member');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (owner_a, 'owner', t_a), (owner_b, 'owner', t_b), (viewer, 'campaigner', t_a),
    (writer, 'campaigner', t_a), (hard, 'campaigner', t_a), (solo, 'campaigner', t_a),
    (mover, 'campaigner', t_a), (mover, 'campaigner', t_b), (admin, 'super_admin', NULL);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (owner_a, t_a), (owner_b, t_b), (viewer, t_a), (writer, t_a), (solo, t_a),
    (mover, t_a), (admin, t_a)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;
  INSERT INTO public.campaigners (full_name, tenant_id, active)
  VALUES ('QA Writer card', t_a, true) RETURNING id INTO card_writer;
  INSERT INTO public.campaigners (full_name, tenant_id, active)
  VALUES ('QA Solo card', t_a, true) RETURNING id INTO card_solo;
  UPDATE public.profiles SET campaigner_id = card_writer WHERE id = writer;
  UPDATE public.profiles SET campaigner_id = card_solo WHERE id = solo;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA agency', t_a) RETURNING id INTO agency_a;
  INSERT INTO public.clients (name, agency_id, tenant_id) VALUES ('QA client', agency_a, t_a)
  RETURNING id INTO client_a;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content)
  VALUES (client_a, t_a, writer, 'written by the writer') RETURNING id INTO cu_writer;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content)
  VALUES (client_a, t_a, hard, 'written by hard') RETURNING id INTO cu_hard;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content)
  VALUES (client_a, t_a, viewer, 'written by the viewer') RETURNING id INTO cu_viewer;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content)
  VALUES (client_a, t_a, solo, 'written by solo');
  INSERT INTO public.tasks (title, agency_id, tenant_id, created_by)
  VALUES ('QA task by writer', agency_a, t_a, writer) RETURNING id INTO task_w;
  INSERT INTO public.tasks (title, agency_id, tenant_id, created_by)
  VALUES ('QA task by hard', agency_a, t_a, hard) RETURNING id INTO task_h;
  INSERT INTO public.task_updates (task_id, user_id, content)
  VALUES (task_w, writer, 'task note by writer') RETURNING id INTO tu_writer;
  INSERT INTO public.task_updates (task_id, user_id, content)
  VALUES (task_h, hard, 'task note by hard') RETURNING id INTO tu_hard;

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
    OR EXISTS (SELECT 1 FROM public.user_active_tenant WHERE user_id = writer) THEN
    RAISE EXCEPTION 'delete: memberships, roles or the active tenant are left';
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

  PERFORM set_config('request.jwt.claim.sub', viewer::text, true);
  SET LOCAL ROLE authenticated;
  SELECT p.full_name INTO v_name
  FROM public.client_updates u JOIN public.profiles p ON p.id = u.user_id
  WHERE u.id = cu_writer;
  IF v_name IS DISTINCT FROM 'QA Writer' THEN
    RAISE EXCEPTION 'delete: a member reads % as the card entry''s writer, not QA Writer', v_name;
  END IF;
  -- Campaigners see only their own tasks; the owner reads this one.
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SELECT p.full_name INTO v_name
  FROM public.tasks t JOIN public.profiles p ON p.id = t.created_by
  WHERE t.id = task_w;
  IF v_name IS DISTINCT FROM 'QA Writer' THEN
    RAISE EXCEPTION 'delete: a member reads % as the task''s creator, not QA Writer', v_name;
  END IF;
  IF (SELECT status FROM public.tenant_inactive_members WHERE user_id = writer) IS DISTINCT FROM 'deleted' THEN
    RAISE EXCEPTION 'delete: a member cannot read that the writer was deleted';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'delete: profile and name kept, email anonymized, history readable as QA Writer (deleted)';

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
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_inactive_members
    WHERE tenant_id = t_a AND user_id = solo AND status = 'inactive' AND member_role = 'member'
      AND roles = ARRAY['campaigner']::public.app_role[] AND campaigner_was_active
  ) OR EXISTS (SELECT 1 FROM public.tenant_users WHERE tenant_id = t_a AND user_id = solo)
    OR (SELECT deleted_at FROM public.profiles WHERE id = solo) IS NOT NULL THEN
    RAISE EXCEPTION 'deactivate: the membership was not moved aside, or the profile was deleted';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', viewer::text, true);
  SET LOCAL ROLE authenticated;
  SELECT p.full_name INTO v_name
  FROM public.client_updates u JOIN public.profiles p ON p.id = u.user_id
  WHERE u.client_id = client_a AND u.content = 'written by solo';
  IF v_name IS DISTINCT FROM 'QA Solo' THEN
    RAISE EXCEPTION 'deactivate: a member reads % as the writer, not QA Solo', v_name;
  END IF;
  IF (SELECT status FROM public.tenant_inactive_members WHERE user_id = solo) IS DISTINCT FROM 'inactive' THEN
    RAISE EXCEPTION 'deactivate: a member cannot read that solo is inactive';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', solo::text, true);
  IF public.user_is_tenant_member(t_a) OR public.get_user_tenant_id(solo) IS NOT NULL THEN
    RAISE EXCEPTION 'deactivate: the inactive member still reaches the organization';
  END IF;
  RESET ROLE;

  SET LOCAL ROLE service_role;
  SELECT * INTO r FROM public.offboard_tenant_member(t_a, mover, owner_a, 'inactive');
  RESET ROLE;
  IF r.remaining_tenants <> 1 OR r.account_deleted OR public.get_user_tenant_id(mover) <> t_b THEN
    RAISE EXCEPTION 'deactivate: a member of two organizations should keep B, got (%, %)',
      r.remaining_tenants, r.account_deleted;
  END IF;
  RAISE NOTICE 'deactivate: out of the organization, the pickers and Carmen staff; history reads QA Solo (inactive)';

  SET LOCAL ROLE service_role;
  PERFORM public.reactivate_tenant_member(t_a, solo, owner_a);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_users WHERE tenant_id = t_a AND user_id = solo AND role = 'member')
    OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE tenant_id = t_a AND user_id = solo AND role = 'campaigner')
    OR NOT (SELECT active FROM public.campaigners WHERE id = card_solo)
    OR EXISTS (SELECT 1 FROM public.tenant_inactive_members WHERE tenant_id = t_a AND user_id = solo) THEN
    RAISE EXCEPTION 'reactivate: membership, role or card not restored';
  END IF;
  -- Joining again (an invitation) makes a member active again.
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES (t_a, mover, 'member');
  IF EXISTS (SELECT 1 FROM public.tenant_inactive_members WHERE tenant_id = t_a AND user_id = mover) THEN
    RAISE EXCEPTION 'rejoin: the inactive record outlived a new membership';
  END IF;
  RAISE NOTICE 'reactivate: membership, campaigner role and active card restored; rejoining clears the record';

  -- 4. Refusals, before anything changes.
  SET LOCAL ROLE service_role;
  FOR r IN
    SELECT * FROM (VALUES
      ('the last owner', owner_a, admin, 'inactive', '23514'),
      ('the actor', owner_a, owner_a, 'deleted', '42501'),
      ('a super admin', admin, owner_a, 'inactive', '42501'),
      ('a non-member', owner_b, owner_a, 'inactive', 'P0002'),
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

  -- 5. RLS on tenant_inactive_members.
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.tenant_inactive_members (tenant_id, user_id, status) VALUES (t_a, extra, 'inactive');
  UPDATE public.tenant_inactive_members SET status = 'deleted' WHERE tenant_id = t_a AND user_id = extra;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'rls: the owner cannot update its organization''s row'; END IF;
  DELETE FROM public.tenant_inactive_members WHERE tenant_id = t_a AND user_id = extra;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'rls: the owner cannot delete its organization''s row'; END IF;
  BEGIN
    INSERT INTO public.tenant_inactive_members (tenant_id, user_id, status) VALUES (t_a, owner_a, 'inactive');
    RAISE EXCEPTION 'rls: the owner wrote its own row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.tenant_inactive_members (tenant_id, user_id, status) VALUES (t_b, mover, 'inactive');
    RAISE EXCEPTION 'rls: an owner of A wrote a row of B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', viewer::text, true);
  SELECT count(*) INTO v_count FROM public.tenant_inactive_members WHERE tenant_id = t_a;
  IF v_count = 0 THEN RAISE EXCEPTION 'rls: a member cannot read its organization''s rows'; END IF;
  BEGIN
    INSERT INTO public.tenant_inactive_members (tenant_id, user_id, status) VALUES (t_a, extra, 'inactive');
    RAISE EXCEPTION 'rls: a member who is not the owner wrote a row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.tenant_inactive_members SET status = 'inactive' WHERE tenant_id = t_a;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'rls: a member who is not the owner updated rows'; END IF;
  DELETE FROM public.tenant_inactive_members WHERE tenant_id = t_a;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'rls: a member who is not the owner deleted rows'; END IF;

  PERFORM set_config('request.jwt.claim.sub', owner_b::text, true);
  SELECT count(*) INTO v_count FROM public.tenant_inactive_members WHERE tenant_id = t_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'rls: another organization''s owner reads A''s rows'; END IF;
  SELECT count(*) INTO v_count FROM public.profiles WHERE id = writer;
  IF v_count <> 0 THEN RAISE EXCEPTION 'rls: another organization''s owner reads A''s deleted profile'; END IF;
  BEGIN
    INSERT INTO public.tenant_inactive_members (tenant_id, user_id, status) VALUES (t_a, extra, 'inactive');
    RAISE EXCEPTION 'rls: another organization''s owner wrote a row of A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', admin::text, true);
  INSERT INTO public.tenant_inactive_members (tenant_id, user_id, status) VALUES (t_a, extra, 'inactive');
  DELETE FROM public.tenant_inactive_members WHERE tenant_id = t_a AND user_id = extra;
  RESET ROLE;
  UPDATE public.user_active_tenant SET tenant_id = t_b WHERE user_id = admin;
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.tenant_inactive_members WHERE tenant_id = t_a;
  IF v_count = 0 THEN RAISE EXCEPTION 'rls: a super admin cannot read every organization'; END IF;
  BEGIN
    INSERT INTO public.tenant_inactive_members (tenant_id, user_id, status) VALUES (t_a, extra, 'inactive');
    RAISE EXCEPTION 'rls: a super admin acting in B wrote a row of A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'rls: members read; the owner or a super admin acting in the organization writes, never its own row';

  -- 6. A person still cannot change who wrote a card entry.
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
SELECT 'Deactivate and delete keep history and names; pickers, staff and access follow the membership' AS result;
ROLLBACK;
