-- Carmen sensitive screenshots (20261126181000_carmen_sensitive_screenshots):
-- the permission is off for every row unless set; the org's manager switches
-- it on and off for a member; the member reads it and cannot switch it on for
-- themselves, not even by creating their own row; a manager of another org
-- cannot touch it. Synthetic users and tenants inside one transaction that is
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

-- Sets the permission on every row of the member as the signed-in user; the rows it changed.
CREATE FUNCTION pg_temp.qa_switch(p_actor uuid, p_member uuid, p_on boolean)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_rows integer;
BEGIN
  PERFORM pg_temp.qa_sign_in(p_actor);
  SET LOCAL ROLE authenticated;
  UPDATE public.carmen_command_center_access
    SET sensitive_screenshots = p_on
    WHERE user_id = p_member;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  RETURN v_rows;
END
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_manager uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_newcomer uuid := gen_random_uuid();
  v_other_manager uuid := gen_random_uuid();
  v_own uuid;
  v_other uuid;
  v_carmen uuid;
  v_on boolean;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-sensitive-shots-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_manager, v_member, v_newcomer, v_other_manager]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-ss-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-ss-other-' || v_tag) RETURNING id INTO v_other;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_manager, 'owner'),
    (v_own, v_member, 'campaigner'),
    (v_own, v_newcomer, 'campaigner'),
    (v_other, v_other_manager, 'owner');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (v_manager, 'owner', v_own),
    (v_other_manager, 'owner', v_other);
  INSERT INTO public.ai_agents (tenant_id, name) VALUES (v_own, 'כרמן') RETURNING id INTO v_carmen;
  INSERT INTO public.carmen_command_center_access (tenant_id, agent_id, user_id)
  VALUES (v_own, v_carmen, v_member);

  -- A row is off until a manager switches it on.
  SELECT sensitive_screenshots INTO v_on
  FROM public.carmen_command_center_access WHERE user_id = v_member;
  IF v_on IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'default: the permission must be off on a new row (got %)', v_on;
  END IF;

  -- The member reads the switch and cannot turn it on for themselves.
  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;
  SELECT sensitive_screenshots INTO v_on
  FROM public.carmen_command_center_access WHERE user_id = v_member;
  RESET ROLE;
  IF v_on IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'member: must read their own switch as off';
  END IF;
  IF pg_temp.qa_switch(v_member, v_member, true) <> 0 THEN
    RAISE EXCEPTION 'member: must not switch the permission on for themselves';
  END IF;

  -- A member without a row cannot create one that grants it.
  PERFORM pg_temp.qa_sign_in(v_newcomer);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.carmen_command_center_access (tenant_id, agent_id, user_id, sensitive_screenshots)
    VALUES (v_own, v_carmen, v_newcomer, true);
    RAISE EXCEPTION 'member: creating their own row with the permission must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A manager of another org cannot touch it.
  IF pg_temp.qa_switch(v_other_manager, v_member, true) <> 0 THEN
    RAISE EXCEPTION 'other org: a foreign manager must not switch the permission';
  END IF;

  -- The org's manager switches it on, and off again.
  IF pg_temp.qa_switch(v_manager, v_member, true) <> 1 THEN
    RAISE EXCEPTION 'manager: must switch the permission on for a member';
  END IF;
  IF NOT (SELECT sensitive_screenshots FROM public.carmen_command_center_access WHERE user_id = v_member) THEN
    RAISE EXCEPTION 'manager: the switch must be stored on';
  END IF;
  IF pg_temp.qa_switch(v_manager, v_member, false) <> 1 THEN
    RAISE EXCEPTION 'manager: must switch the permission off again';
  END IF;

  -- The column takes no null: "unknown" is never stored.
  BEGIN
    UPDATE public.carmen_command_center_access SET sensitive_screenshots = NULL WHERE user_id = v_member;
    RAISE EXCEPTION 'null: the permission must refuse null';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;

  RAISE NOTICE 'carmen_sensitive_screenshots: all checks passed';
END
$test$;

ROLLBACK;
