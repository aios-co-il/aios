-- Carmen device actions (20261126143000_carmen_device_actions): each user reads
-- only their own actions, in an org they belong to; a colleague, a member who
-- left, another org and anon read nothing; a super admin reads their own only
-- in the org they act in; a signed-in user reads the ids, tool, status and
-- timestamps of a row and never its arguments, result, observed address or
-- decision; no signed-in user inserts, updates or deletes a row;
-- the status and decision checks hold; a row goes with its org, its user and
-- its conversation, and 90 days after it was created. Synthetic users and
-- tenants inside one transaction that is rolled back.
--
-- A write that must be refused runs without a WHERE clause, so the refusal is
-- the missing privilege and not a row the SELECT policy hid.
BEGIN;

-- Signs in as the user; the caller then switches to the authenticated role.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$fn$;

-- The number of action rows the user reads when signed in.
CREATE FUNCTION pg_temp.qa_visible_to(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_rows integer;
BEGIN
  PERFORM pg_temp.qa_sign_in(p_user);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_device_actions;
  RESET ROLE;
  RETURN v_rows;
END
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_me uuid := gen_random_uuid();
  v_colleague uuid := gen_random_uuid();
  v_leaver uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_super uuid := gen_random_uuid();
  v_own uuid;
  v_other uuid;
  v_conversation uuid;
  v_mine uuid;
  v_rows integer;
  v_status text;
  v_command text;
  v_names text[];
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-device-actions-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_me, v_colleague, v_leaver, v_outsider, v_super]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-da-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-da-other-' || v_tag) RETURNING id INTO v_other;

  -- The super admin belongs to no org and acts in mine.
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_me, 'member'),
    (v_own, v_colleague, 'member'),
    (v_own, v_leaver, 'member'),
    (v_other, v_outsider, 'owner');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (v_super, 'super_admin', NULL);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (v_super, v_own);
  INSERT INTO public.ai_conversations (user_id, tenant_id)
  VALUES (v_me, v_own) RETURNING id INTO v_conversation;

  -- The server (service role) writes one pending action each for me, the leaver,
  -- the outsider in their own org, and the super admin in the org they act in.
  SET LOCAL ROLE service_role;
  INSERT INTO public.carmen_device_actions (tenant_id, user_id, conversation_id, run_id, tool, expires_at)
  VALUES (v_own, v_me, v_conversation, gen_random_uuid(), 'browser_read_page', now() + interval '2 minutes')
  RETURNING id INTO v_mine;
  INSERT INTO public.carmen_device_actions (tenant_id, user_id, run_id, tool, expires_at) VALUES
    (v_own, v_leaver, gen_random_uuid(), 'browser_read_page', now() + interval '2 minutes'),
    (v_other, v_outsider, gen_random_uuid(), 'browser_read_page', now() + interval '2 minutes'),
    (v_own, v_super, gen_random_uuid(), 'browser_read_page', now() + interval '2 minutes');
  RESET ROLE;

  -- A new row is pending, with no claim, completion, result or decision.
  IF NOT EXISTS (
    SELECT 1 FROM public.carmen_device_actions
    WHERE id = v_mine AND status = 'pending' AND arguments = '{}'::jsonb
      AND claimed_at IS NULL AND completed_at IS NULL AND result IS NULL AND decision IS NULL
  ) THEN
    RAISE EXCEPTION 'defaults: a new action must be pending and empty';
  END IF;

  -- I read exactly my own action.
  PERFORM pg_temp.qa_sign_in(v_me);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_device_actions;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'member: must see only their own actions (saw % rows)', v_rows;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.carmen_device_actions WHERE id = v_mine AND user_id = v_me) THEN
    RAISE EXCEPTION 'member: the action they see must be their own';
  END IF;

  -- Of my own row I read what the edge function's check and the site need, and nothing a page or I typed.
  PERFORM id, tenant_id, user_id, run_id, tool, status, created_at, claimed_at, completed_at, expires_at
  FROM public.carmen_device_actions;
  FOREACH v_status IN ARRAY ARRAY[
    'arguments', 'result', 'observed_origin', 'observed_path', 'decision', 'conversation_id', '*'
  ] LOOP
    BEGIN
      EXECUTE 'SELECT ' || v_status || ' FROM public.carmen_device_actions';
      RAISE EXCEPTION 'member: reading % of an action must be refused', v_status;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  -- I write nothing, not even my own row: every write goes through the edge function.
  BEGIN
    INSERT INTO public.carmen_device_actions (tenant_id, user_id, run_id, tool, expires_at)
    VALUES (v_own, v_me, gen_random_uuid(), 'browser_click', now() + interval '2 minutes');
    RAISE EXCEPTION 'member: inserting an action must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.carmen_device_actions SET status = 'claimed';
    RAISE EXCEPTION 'member: updating an action must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.carmen_device_actions;
    RAISE EXCEPTION 'member: deleting an action must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A colleague in the same org has no action of their own and sees none of mine.
  IF pg_temp.qa_visible_to(v_colleague) <> 0 THEN
    RAISE EXCEPTION 'colleague: another user''s actions must be hidden';
  END IF;

  -- A user of another org sees their own action and nothing of my org.
  IF pg_temp.qa_visible_to(v_outsider) <> 1 THEN
    RAISE EXCEPTION 'other org: must see only their own action';
  END IF;

  -- A member reads their action until they leave the org, and not after.
  IF pg_temp.qa_visible_to(v_leaver) <> 1 THEN
    RAISE EXCEPTION 'leaver: must see their own action while a member';
  END IF;
  DELETE FROM public.tenant_users WHERE tenant_id = v_own AND user_id = v_leaver;
  IF pg_temp.qa_visible_to(v_leaver) <> 0 THEN
    RAISE EXCEPTION 'leaver: actions in an org they left must be hidden';
  END IF;

  -- A super admin reads their own action in the org they act in and nobody else's,
  -- and no longer reads it after switching to another org.
  IF pg_temp.qa_visible_to(v_super) <> 1 THEN
    RAISE EXCEPTION 'super admin: must see exactly their own action in the org they act in';
  END IF;
  UPDATE public.user_active_tenant SET tenant_id = v_other WHERE user_id = v_super;
  IF pg_temp.qa_visible_to(v_super) <> 0 THEN
    RAISE EXCEPTION 'super admin: actions outside the org they act in must be hidden';
  END IF;

  -- anon reads and writes nothing.
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.carmen_device_actions;
    RAISE EXCEPTION 'anon: reading actions must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.carmen_device_actions SET status = 'claimed';
    RAISE EXCEPTION 'anon: updating an action must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- The service role, which the edge function writes with, moves my action through every status.
  SET LOCAL ROLE service_role;
  FOREACH v_status IN ARRAY ARRAY[
    'pending', 'claimed', 'done', 'refused', 'denied', 'target_changed', 'expired', 'cancelled', 'outcome_unknown'
  ] LOOP
    UPDATE public.carmen_device_actions SET status = v_status WHERE id = v_mine;
  END LOOP;
  FOREACH v_status IN ARRAY ARRAY['never', 'ask', 'free', NULL] LOOP
    UPDATE public.carmen_device_actions SET decision = v_status WHERE id = v_mine;
  END LOOP;

  -- A status or decision outside the lists, and an empty tool name, are refused.
  BEGIN
    UPDATE public.carmen_device_actions SET status = 'approved' WHERE id = v_mine;
    RAISE EXCEPTION 'check: an unknown status must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.carmen_device_actions SET decision = 'trusted' WHERE id = v_mine;
    RAISE EXCEPTION 'check: an unknown decision must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.carmen_device_actions SET tool = '' WHERE id = v_mine;
    RAISE EXCEPTION 'check: an empty tool must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RESET ROLE;

  -- On the table as a whole PUBLIC (grantee 0), anon and signed-in users hold nothing:
  -- no write, no TRUNCATE, which row-level security does not cover, and no SELECT,
  -- which would open every column.
  SELECT array_agg(g.held ORDER BY g.held) INTO v_names
  FROM (
    SELECT coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type AS held
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
    WHERE c.oid = 'public.carmen_device_actions'::regclass
      AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
  ) g;
  IF v_names IS NOT NULL THEN
    RAISE EXCEPTION 'grants: unexpected table grants to PUBLIC, anon or authenticated on public.carmen_device_actions: %', v_names;
  END IF;

  -- Column by column, signed-in users hold SELECT on exactly these ten and nothing else;
  -- anon and PUBLIC hold no column.
  SELECT array_agg(g.held ORDER BY g.held) INTO v_names
  FROM (
    SELECT coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type || ':' || att.attname AS held
    FROM pg_attribute att
    CROSS JOIN LATERAL aclexplode(att.attacl) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
    WHERE att.attrelid = 'public.carmen_device_actions'::regclass
      AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
  ) g;
  IF v_names IS DISTINCT FROM ARRAY[
    'authenticated:SELECT:claimed_at', 'authenticated:SELECT:completed_at', 'authenticated:SELECT:created_at',
    'authenticated:SELECT:expires_at', 'authenticated:SELECT:id', 'authenticated:SELECT:run_id',
    'authenticated:SELECT:status', 'authenticated:SELECT:tenant_id', 'authenticated:SELECT:tool',
    'authenticated:SELECT:user_id'
  ] THEN
    RAISE EXCEPTION 'grants: unexpected column grants to PUBLIC, anon or authenticated on public.carmen_device_actions: %', v_names;
  END IF;

  -- Policies are permissive and OR together: only the one SELECT policy, for authenticated only.
  SELECT array_agg(p.policyname || ':' || p.cmd ORDER BY p.policyname) INTO v_names
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'carmen_device_actions';
  IF v_names IS DISTINCT FROM ARRAY['carmen_device_actions_select:SELECT'] THEN
    RAISE EXCEPTION 'policies: unexpected policies on public.carmen_device_actions: %', v_names;
  END IF;
  SELECT count(*) INTO v_rows
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'carmen_device_actions'
    AND (p.roles <> ARRAY['authenticated']::name[] OR p.permissive <> 'PERMISSIVE');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'policies: % policy(ies) on public.carmen_device_actions are not permissive for authenticated only', v_rows;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.carmen_device_actions'::regclass) THEN
    RAISE EXCEPTION 'policies: row-level security must be on for public.carmen_device_actions';
  END IF;

  -- Realtime does not carry the table: it would send each change to subscribers.
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'carmen_device_actions'
  ) THEN
    RAISE EXCEPTION 'realtime: public.carmen_device_actions must not be in publication supabase_realtime';
  END IF;

  -- The retention job deletes rows created over 90 days ago and keeps newer ones.
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'retention: pg_cron not installed, scheduled job not checked';
  ELSE
    SELECT command INTO v_command FROM cron.job
    WHERE jobname = 'cleanup-carmen-device-actions' AND schedule = '7 4 * * *';
    IF v_command IS NULL THEN
      RAISE EXCEPTION 'retention: cleanup-carmen-device-actions must run daily at 04:07';
    END IF;
    UPDATE public.carmen_device_actions SET created_at = now() - interval '91 days'
    WHERE tenant_id = v_own AND user_id = v_leaver;
    UPDATE public.carmen_device_actions SET created_at = now() - interval '89 days' WHERE id = v_mine;
    EXECUTE v_command;
    IF EXISTS (SELECT 1 FROM public.carmen_device_actions WHERE tenant_id = v_own AND user_id = v_leaver) THEN
      RAISE EXCEPTION 'retention: an action created 91 days ago must be deleted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.carmen_device_actions WHERE id = v_mine) THEN
      RAISE EXCEPTION 'retention: an action created 89 days ago must be kept';
    END IF;
  END IF;

  -- An action goes with its conversation, its user and its org.
  DELETE FROM public.ai_conversations WHERE id = v_conversation;
  IF EXISTS (SELECT 1 FROM public.carmen_device_actions WHERE id = v_mine) THEN
    RAISE EXCEPTION 'cascade: deleting the conversation must delete its actions';
  END IF;
  DELETE FROM auth.users WHERE id = v_super;
  IF EXISTS (SELECT 1 FROM public.carmen_device_actions WHERE user_id = v_super) THEN
    RAISE EXCEPTION 'cascade: deleting the user must delete their actions';
  END IF;
  DELETE FROM public.tenants WHERE id = v_other;
  IF EXISTS (SELECT 1 FROM public.carmen_device_actions WHERE tenant_id = v_other) THEN
    RAISE EXCEPTION 'cascade: deleting the org must delete its actions';
  END IF;
END
$test$;
SELECT 'Carmen device actions: own rows only and never their arguments or result, no writes for signed-in users, colleague, leaver, other org and anon refused, checks and cascades hold' AS result;
ROLLBACK;
