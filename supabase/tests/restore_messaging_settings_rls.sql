-- Telephony, Telegram and ManyChat access rules
-- (20261102107000_restore_messaging_settings_rls): who reads and writes
-- telephony_settings, telegram_bot_state, telegram_messages and sync_jobs,
-- and the conflict target telegram-verify-bot upserts on. Staging only: the
-- test's own tenants and rows, existing non-admin users as personas, and a
-- full rollback.
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

DO $test$
DECLARE
  v_users uuid[];
  u_owner uuid; u_member uuid; u_other uuid; u_admin uuid;
  t_a uuid; t_b uuid; t_c uuid; v_tenants uuid[];
  bot_a uuid; bot_b uuid; v_copy uuid;
  n bigint;
BEGIN
  -- user_roles and tenant_users need auth.users rows, so the personas are
  -- existing non-admin users. Each acts only through the memberships and
  -- roles it gets in this test's new tenants (its active tenant is set below).
  SELECT array_agg(id ORDER BY id) INTO v_users FROM (
    SELECT u.id FROM auth.users u WHERE NOT public.is_super_admin(u.id) ORDER BY u.id LIMIT 4
  ) AS picked;
  IF coalesce(array_length(v_users, 1), 0) < 4 THEN
    RAISE EXCEPTION 'Requires four non-admin users';
  END IF;
  u_owner := v_users[1]; u_member := v_users[2]; u_other := v_users[3]; u_admin := v_users[4];

  -- t_a is the main tenant, t_b another tenant, t_c a second tenant of the owner.
  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK A', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_a;
  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK B', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_b;
  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK C', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_c;
  v_tenants := array[t_a, t_b, t_c];

  INSERT INTO public.tenant_users (user_id, tenant_id, role) VALUES
    (u_owner, t_a, 'owner'), (u_owner, t_c, 'member'), (u_member, t_a, 'member'), (u_other, t_b, 'owner');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (u_owner, 'owner', t_a), (u_member, 'campaigner', t_a), (u_other, 'owner', t_b), (u_admin, 'super_admin', NULL);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES (u_owner, t_a), (u_member, t_a), (u_other, t_b)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;

  INSERT INTO public.telephony_settings (tenant_id, user_id, personal_phone) VALUES
    (t_a, u_owner, '0500000001'), (t_a, u_member, '0500000002'), (t_b, u_other, '0500000003');
  INSERT INTO public.telegram_bot_state (tenant_id, bot_username) VALUES (t_a, 'qa_a_bot') RETURNING id INTO bot_a;
  INSERT INTO public.telegram_bot_state (tenant_id, bot_username) VALUES (t_b, 'qa_b_bot') RETURNING id INTO bot_b;
  INSERT INTO public.telegram_messages (tenant_id, chat_id, text) VALUES (t_a, 1, 'QA A'), (t_b, 2, 'QA B');
  INSERT INTO public.sync_jobs (tenant_id) VALUES (t_a), (t_b);

  -- telegram-verify-bot's upsert: the service role connects the tenant's own bot again.
  INSERT INTO public.telegram_bot_state (tenant_id, shared_from_state_id, bot_username, is_active, update_offset)
  VALUES (t_a, NULL, 'qa_a_bot_v2', true, 0)
  ON CONFLICT (tenant_id, shared_from_state_id) DO UPDATE SET bot_username = excluded.bot_username;
  SELECT count(*) INTO n FROM public.telegram_bot_state WHERE tenant_id = t_a AND bot_username = 'qa_a_bot_v2';
  PERFORM pg_temp.qa_expect(n, 1, 'verify-bot upsert updates the tenant''s bot in place');

  -- Owner of t_a.
  PERFORM pg_temp.qa_act(u_owner);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE tenant_id = ANY (v_tenants)), 2, 'owner reads t_a telephony settings');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a bot');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a messages');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.sync_jobs WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a sync jobs');

  UPDATE public.telegram_bot_state SET is_active = false WHERE id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'owner disconnects the bot');

  -- Sharing into t_c, where the owner is a member: the panel then lists and removes the copy.
  INSERT INTO public.telegram_bot_state (tenant_id, shared_from_state_id, bot_username, is_active)
  VALUES (t_c, bot_a, 'qa_a_bot', true);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE shared_from_state_id = bot_a), 1, 'owner lists the shared copy');
  DELETE FROM public.telegram_bot_state WHERE tenant_id = t_c AND shared_from_state_id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'owner removes the shared copy');
  BEGIN
    INSERT INTO public.telegram_bot_state (tenant_id, shared_from_state_id, bot_username) VALUES (t_b, bot_a, 'qa_a_bot');
    RAISE EXCEPTION 'owner shared into a tenant they are not a member of';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.telegram_messages (tenant_id, chat_id, text) VALUES (t_a, 3, 'QA A out');
  BEGIN
    INSERT INTO public.telegram_messages (tenant_id, chat_id, text) VALUES (t_b, 4, 'Must be denied');
    RAISE EXCEPTION 'owner wrote a message into another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.sync_jobs (tenant_id) VALUES (t_a);
    RAISE EXCEPTION 'owner created a sync job (service role only)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.sync_jobs SET status = 'stopped' WHERE tenant_id = t_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'owner updates a sync job (service role only)');

  -- Member (campaigner) of t_a.
  PERFORM pg_temp.qa_act(u_member);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE tenant_id = ANY (v_tenants)), 2, 'member reads t_a telephony settings');
  INSERT INTO public.telephony_settings (tenant_id, user_id, personal_phone) VALUES (t_a, u_member, '0500000022')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET personal_phone = excluded.personal_phone;
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE user_id = u_member AND personal_phone = '0500000022'), 1, 'member saves own telephony settings');
  UPDATE public.telephony_settings SET personal_phone = 'Must be denied' WHERE tenant_id = t_a AND user_id = u_owner;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'member edits a colleague''s telephony settings');
  BEGIN
    UPDATE public.telephony_settings SET tenant_id = t_b WHERE tenant_id = t_a AND user_id = u_member;
    RAISE EXCEPTION 'member moved own telephony settings to another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.telephony_settings (tenant_id, user_id) VALUES (t_c, u_member);
    RAISE EXCEPTION 'member created telephony settings outside the active tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id = ANY (v_tenants)), 1, 'member reads t_a bot');
  UPDATE public.telegram_bot_state SET is_active = true WHERE id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'member reconnects the bot (owner only)');
  DELETE FROM public.telegram_bot_state WHERE id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'member deletes the bot (owner only)');
  BEGIN
    INSERT INTO public.telegram_bot_state (tenant_id, shared_from_state_id, bot_username) VALUES (t_c, bot_a, 'qa_a_bot');
    RAISE EXCEPTION 'member shared into a tenant they are not a member of';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.telegram_bot_state (tenant_id, shared_from_state_id, bot_username) VALUES (t_a, bot_b, 'qa_b_bot');
    RAISE EXCEPTION 'member copied another tenant''s bot into t_a';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id = ANY (v_tenants)), 2, 'member reads t_a messages');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.sync_jobs WHERE tenant_id = ANY (v_tenants)), 1, 'member reads t_a sync jobs');

  -- Owner of another tenant (t_b): nothing of t_a.
  PERFORM pg_temp.qa_act(u_other);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE tenant_id IN (t_a, t_c)), 0, 'other tenant reads t_a telephony settings');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id IN (t_a, t_c)), 0, 'other tenant reads t_a bot');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id IN (t_a, t_c)), 0, 'other tenant reads t_a messages');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.sync_jobs WHERE tenant_id IN (t_a, t_c)), 0, 'other tenant reads t_a sync jobs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id = t_b), 1, 'other tenant reads its own bot');
  UPDATE public.telegram_bot_state SET is_active = true WHERE id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'other tenant edits t_a bot');
  DELETE FROM public.telegram_bot_state WHERE id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'other tenant deletes t_a bot');

  -- Super admin, member of none of the test's tenants: every tenant's rows.
  PERFORM pg_temp.qa_act(u_admin);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE tenant_id = ANY (v_tenants)), 3, 'super admin reads all telephony settings');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id = ANY (v_tenants)), 2, 'super admin reads all bots');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id = ANY (v_tenants)), 3, 'super admin reads all messages');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.sync_jobs WHERE tenant_id = ANY (v_tenants)), 2, 'super admin reads all sync jobs');

  -- Anonymous: nothing.
  PERFORM pg_temp.qa_act(NULL, 'anon');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads telephony settings');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads bots');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads messages');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.sync_jobs WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads sync jobs');
  BEGIN
    INSERT INTO public.telegram_messages (tenant_id, chat_id, text) VALUES (t_a, 5, 'Must be denied');
    RAISE EXCEPTION 'anon wrote a message';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.qa_act(NULL, 'none');
END;
$test$;
SELECT 'Telephony, Telegram and ManyChat access rules passed' AS result;
ROLLBACK;
