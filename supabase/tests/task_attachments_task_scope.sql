-- Task attachments scoped to the task (20261126200000_task_attachments_task_scope):
-- a file in the private task-attachments bucket is read only by callers who
-- can see its task, whether they belong to another tenant, to the same tenant
-- without access to the task, or hold no session. Uploads and deletes go only
-- into {acting tenant}/{visible task}/. Files of the legacy {user_id}/{task_id}/
-- layout stay readable to the task's viewers. Synthetic users, tenants, tasks
-- and objects inside one transaction that is rolled back.
BEGIN;

-- Signs in as the user; the caller then switches to the authenticated role.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$fn$;

-- Counts this run's task files the signed-in caller can read.
CREATE FUNCTION pg_temp.qa_readable(p_tag text)
RETURNS integer
LANGUAGE sql
AS $fn$
  SELECT count(*)::integer FROM storage.objects
  WHERE bucket_id = 'task-attachments' AND name LIKE '%qa-' || p_tag || '%';
$fn$;

-- Tries an upload as the signed-in caller; true when the policy allows it.
CREATE FUNCTION pg_temp.qa_can_upload(p_name text)
RETURNS boolean
LANGUAGE plpgsql
AS $fn$
BEGIN
  INSERT INTO storage.objects (bucket_id, name) VALUES ('task-attachments', p_name);
  RETURN true;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN false;
END
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  u_owner uuid := gen_random_uuid();
  u_assignee uuid := gen_random_uuid();
  u_peer uuid := gen_random_uuid();
  u_other uuid := gen_random_uuid();
  t_a uuid;
  t_b uuid;
  ag_a uuid;
  ag_b uuid;
  cp_assignee uuid;
  cp_peer uuid;
  task_a uuid;
  task_b uuid;
  v_rows integer;
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'task-attachments' AND public) THEN
    RAISE EXCEPTION 'the task-attachments bucket must be private';
  END IF;

  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-task-attachments-' || u || '@example.invalid'
  FROM unnest(ARRAY[u_owner, u_assignee, u_peer, u_other]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK A', 'qa-task-att-a-' || v_tag) RETURNING id INTO t_a;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK B', 'qa-task-att-b-' || v_tag) RETURNING id INTO t_b;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK A', t_a) RETURNING id INTO ag_a;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK B', t_b) RETURNING id INTO ag_b;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK 1', t_a) RETURNING id INTO cp_assignee;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK 2', t_a) RETURNING id INTO cp_peer;

  -- Owner of A; the campaigner assigned to the task; a campaigner of A who
  -- cannot see the task; the owner of B.
  INSERT INTO public.tenant_users (user_id, tenant_id, role) VALUES
    (u_owner, t_a, 'owner'), (u_assignee, t_a, 'member'),
    (u_peer, t_a, 'member'), (u_other, t_b, 'owner');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (u_owner, 'owner', t_a), (u_assignee, 'campaigner', t_a),
    (u_peer, 'campaigner', t_a), (u_other, 'owner', t_b);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (u_owner, t_a), (u_assignee, t_a), (u_peer, t_a), (u_other, t_b);
  UPDATE public.profiles SET campaigner_id = cp_assignee WHERE id = u_assignee;
  UPDATE public.profiles SET campaigner_id = cp_peer WHERE id = u_peer;
  INSERT INTO public.tasks (title, tenant_id, agency_id, campaigner_id)
  VALUES ('QA ROLLBACK A', t_a, ag_a, cp_assignee) RETURNING id INTO task_a;
  INSERT INTO public.tasks (title, tenant_id, agency_id)
  VALUES ('QA ROLLBACK B', t_b, ag_b) RETURNING id INTO task_b;

  -- Written past RLS like the storage API: the task's file, a legacy file in
  -- its uploader's folder, a draft file with no task, and a file filed under
  -- task A in B's folder by nobody in A.
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES
    ('task-attachments', t_a || '/' || task_a || '/qa-' || v_tag || '-tenant.pdf', u_assignee, u_assignee::text),
    ('task-attachments', u_assignee || '/' || task_a || '/qa-' || v_tag || '-legacy.pdf', u_assignee, u_assignee::text),
    ('task-attachments', t_a || '/draft/qa-' || v_tag || '-draft.pdf', u_owner, u_owner::text),
    ('task-attachments', t_b || '/' || task_a || '/qa-' || v_tag || '-misfiled.pdf', NULL, NULL);

  -- No session: nothing.
  SET LOCAL ROLE anon;
  v_rows := pg_temp.qa_readable(v_tag);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'anon must read no task file, read %', v_rows;
  END IF;
  RESET ROLE;

  -- Another tenant: nothing to read, and no upload under A's task.
  PERFORM pg_temp.qa_sign_in(u_other);
  SET LOCAL ROLE authenticated;
  v_rows := pg_temp.qa_readable(v_tag);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'a member of another tenant must read no file of task A, read %', v_rows;
  END IF;
  IF pg_temp.qa_can_upload(t_a || '/' || task_a || '/qa-up-' || v_tag || '.png') THEN
    RAISE EXCEPTION 'another tenant must not upload into tenant A''s folder';
  END IF;
  IF pg_temp.qa_can_upload(t_b || '/' || task_a || '/qa-up-' || v_tag || '.png') THEN
    RAISE EXCEPTION 'another tenant must not file an upload under task A';
  END IF;
  IF NOT pg_temp.qa_can_upload(t_b || '/' || task_b || '/qa-up-' || v_tag || '.png') THEN
    RAISE EXCEPTION 'the owner of B must upload under their own task';
  END IF;
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'task-attachments' AND name LIKE t_a || '/%' || v_tag || '%';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'another tenant must delete no file of tenant A, deleted %', v_rows;
  END IF;
  RESET ROLE;

  -- Same tenant without access to the task: nothing to read or upload.
  PERFORM pg_temp.qa_sign_in(u_peer);
  SET LOCAL ROLE authenticated;
  v_rows := pg_temp.qa_readable(v_tag);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'a member who cannot see the task must read none of its files, read %', v_rows;
  END IF;
  IF pg_temp.qa_can_upload(t_a || '/' || task_a || '/qa-up-' || v_tag || '.png') THEN
    RAISE EXCEPTION 'a member who cannot see the task must not upload to it';
  END IF;
  RESET ROLE;

  -- The assignee reads the task's file and the legacy one, and uploads where
  -- NotesWithAttachments writes, but not into a draft or {user_id}/ folder.
  PERFORM pg_temp.qa_sign_in(u_assignee);
  SET LOCAL ROLE authenticated;
  v_rows := pg_temp.qa_readable(v_tag);
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'the assignee must read the task file and the legacy file, read %', v_rows;
  END IF;
  IF NOT pg_temp.qa_can_upload(t_a || '/' || task_a || '/qa-' || v_tag || '-new.png') THEN
    RAISE EXCEPTION 'the assignee must upload to {tenant}/{task}/';
  END IF;
  IF pg_temp.qa_can_upload(t_a || '/draft/qa-' || v_tag || '-new.png') THEN
    RAISE EXCEPTION 'an upload with no task must be refused';
  END IF;
  IF pg_temp.qa_can_upload(u_assignee || '/' || task_a || '/qa-' || v_tag || '-new.png') THEN
    RAISE EXCEPTION 'an upload into the legacy {user_id}/ folder must be refused';
  END IF;
  RESET ROLE;

  -- The owner reads the same files, now three, and deletes the task's file.
  PERFORM pg_temp.qa_sign_in(u_owner);
  SET LOCAL ROLE authenticated;
  v_rows := pg_temp.qa_readable(v_tag);
  IF v_rows <> 3 THEN
    RAISE EXCEPTION 'the owner must read the 3 files of task A, read %', v_rows;
  END IF;
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'task-attachments' AND name = t_a || '/' || task_a || '/qa-' || v_tag || '-tenant.pdf';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'the owner must delete a file of their tenant''s task, deleted %', v_rows;
  END IF;
  RESET ROLE;

  RAISE NOTICE 'task_attachments_task_scope: all checks passed';
END
$test$;

ROLLBACK;
