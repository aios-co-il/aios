-- Own-agency tasks across tenants (AIO-296,
-- 20261103111000_tasks_owned_agency_cross_tenant): the tenant that owns an
-- agency reads and updates the agency's tasks stamped with a tenant it shared
-- the agency with directly, and nothing stamped with a tenant that does not
-- hold it or holds it only through a re-share.
-- The test seeds its own users, tenants and rows and rolls everything back, so
-- it runs on a scratch database, a Preview branch or Staging.
BEGIN;

-- Acts as p_user (auth.uid()) with database role p_role; 'none' returns to the session user.
CREATE FUNCTION pg_temp.qa_act(p_user uuid, p_role text DEFAULT 'authenticated') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  PERFORM set_config('role', p_role, true);
END;
$$;

-- Fails the test when a persona sees or changes the wrong number of rows.
CREATE FUNCTION pg_temp.qa_expect(p_actual bigint, p_expected bigint, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION '%: expected %, got %', p_what, p_expected, p_actual;
  END IF;
END;
$$;

-- Runs one write as the current persona and returns how many rows it changed.
CREATE FUNCTION pg_temp.qa_rows(p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Fails the test unless the write is refused by row-level security (42501).
CREATE FUNCTION pg_temp.qa_refused(p_sql text, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN;
  END;
  RAISE EXCEPTION '%: expected a refusal', p_what;
END;
$$;

DO $test$
DECLARE
  v_tag text := left(gen_random_uuid()::text, 8);
  u_owner uuid := gen_random_uuid(); u_camp uuid := gen_random_uuid();
  t_own uuid; t_share uuid; t_reshare uuid; t_other uuid;
  ag_own uuid; cp_own uuid; cp_other uuid;
  task_assigned uuid; task_unassigned uuid; task_unshared uuid; task_reshared uuid;
  task_home uuid;
  v_ids uuid[];
  n bigint;
BEGIN
  -- Users of this run only; the auth trigger gives each a profile.
  INSERT INTO auth.users (id, email)
  SELECT x.u, 'qa-own-agency-tasks-' || v_tag || '-' || x.i || '@example.invalid'
  FROM unnest(array[u_owner, u_camp]) WITH ORDINALITY AS x (u, i);

  -- t_own owns ag_own and shares it with t_share, which re-shares it with
  -- t_reshare. t_other never holds it.
  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK own', 'qa-own-agency-own-' || v_tag) RETURNING id INTO t_own;
  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK share', 'qa-own-agency-share-' || v_tag) RETURNING id INTO t_share;
  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK reshare', 'qa-own-agency-reshare-' || v_tag) RETURNING id INTO t_reshare;
  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK other', 'qa-own-agency-other-' || v_tag) RETURNING id INTO t_other;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK own', t_own) RETURNING id INTO ag_own;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (t_own, ag_own, t_share, 'read_write'), (t_share, ag_own, t_reshare, 'read_write');
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK own', t_own) RETURNING id INTO cp_own;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK other', t_own) RETURNING id INTO cp_other;

  -- The owner and a campaigner of t_own. Roles come before active tenants, as
  -- an active tenant must be one the user may use.
  INSERT INTO public.tenant_users (user_id, tenant_id, role) VALUES
    (u_owner, t_own, 'owner'), (u_camp, t_own, 'member');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (u_owner, 'owner', t_own), (u_camp, 'campaigner', t_own);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (u_owner, t_own), (u_camp, t_own);
  UPDATE public.profiles SET campaigner_id = cp_own, sales_person_id = NULL WHERE id = u_camp;

  -- Two tasks t_share made on ag_own, one a tenant without the share stamped
  -- on it, one the re-share tenant made, and one in t_own itself.
  INSERT INTO public.tasks (title, tenant_id, agency_id, campaigner_id)
  VALUES ('QA ROLLBACK assigned', t_share, ag_own, cp_own) RETURNING id INTO task_assigned;
  INSERT INTO public.tasks (title, tenant_id, agency_id, campaigner_id)
  VALUES ('QA ROLLBACK unassigned', t_share, ag_own, cp_other) RETURNING id INTO task_unassigned;
  INSERT INTO public.tasks (title, tenant_id, agency_id)
  VALUES ('QA ROLLBACK unshared', t_other, ag_own) RETURNING id INTO task_unshared;
  INSERT INTO public.tasks (title, tenant_id, agency_id, campaigner_id)
  VALUES ('QA ROLLBACK reshared', t_reshare, ag_own, cp_own) RETURNING id INTO task_reshared;
  INSERT INTO public.tasks (title, tenant_id, agency_id, campaigner_id)
  VALUES ('QA ROLLBACK home', t_own, ag_own, cp_other) RETURNING id INTO task_home;
  v_ids := array[task_assigned, task_unassigned, task_unshared, task_reshared, task_home];

  -- The agency owner reads both shared-tenant tasks and its own, not the
  -- unshared stamp or the re-share tenant's task.
  PERFORM pg_temp.qa_act(u_owner);
  SELECT count(*) INTO n FROM public.tasks WHERE id = ANY (v_ids);
  PERFORM pg_temp.qa_expect(n, 3, 'Owner reads own-agency tasks');
  PERFORM pg_temp.qa_expect(
    (SELECT count(*) FROM public.tasks WHERE id = task_unshared), 0,
    'Owner reads a task stamped with a tenant that does not hold the agency');
  PERFORM pg_temp.qa_expect(
    (SELECT count(*) FROM public.tasks WHERE id = task_reshared), 0,
    'Owner reads a task stamped with a re-share tenant');

  -- The owner completes a shared-tenant task, but not the unshared stamp, and
  -- cannot move a task to a tenant without a direct share of the agency.
  n := pg_temp.qa_rows(format(
    'UPDATE public.tasks SET status = %L WHERE id = %L', 'done', task_assigned));
  PERFORM pg_temp.qa_expect(n, 1, 'Owner updates a shared-tenant task');
  n := pg_temp.qa_rows(format(
    'UPDATE public.tasks SET title = %L WHERE id = %L', 'QA ROLLBACK edited', task_unshared));
  PERFORM pg_temp.qa_expect(n, 0, 'Owner updates an unshared stamp');
  PERFORM pg_temp.qa_refused(format(
    'UPDATE public.tasks SET tenant_id = %L WHERE id = %L', t_other, task_unassigned),
    'Owner moves a task to a tenant without the agency');
  PERFORM pg_temp.qa_refused(format(
    'UPDATE public.tasks SET tenant_id = %L WHERE id = %L', t_reshare, task_unassigned),
    'Owner moves a task to a re-share tenant');

  -- A campaigner of t_own reads and updates only the shared-tenant task assigned to it.
  -- In-tenant visibility is unchanged: the home task is not its own. The
  -- re-share tenant's task stays hidden though it is assigned to it.
  PERFORM pg_temp.qa_act(u_camp);
  SELECT count(*) INTO n FROM public.tasks WHERE id = ANY (v_ids);
  PERFORM pg_temp.qa_expect(n, 1, 'Campaigner reads own-agency tasks');
  PERFORM pg_temp.qa_expect(
    (SELECT count(*) FROM public.tasks WHERE id = task_assigned), 1,
    'Campaigner reads its assigned shared-tenant task');
  n := pg_temp.qa_rows(format(
    'UPDATE public.tasks SET title = %L WHERE id = %L', 'QA ROLLBACK edited', task_unassigned));
  PERFORM pg_temp.qa_expect(n, 0, 'Campaigner updates a task assigned to someone else');

  -- Revoking the share hides the shared-tenant tasks from the owner again.
  PERFORM pg_temp.qa_act(NULL, 'none');
  DELETE FROM public.agency_tenant_access WHERE agency_id = ag_own AND accessing_tenant_id = t_share;
  PERFORM pg_temp.qa_act(u_owner);
  SELECT count(*) INTO n FROM public.tasks WHERE id = ANY (v_ids);
  PERFORM pg_temp.qa_expect(n, 1, 'Owner reads tasks of a revoked share');
  PERFORM pg_temp.qa_act(NULL, 'none');
END;
$test$;
SELECT 'Own-agency tasks across tenants passed' AS result;
ROLLBACK;
