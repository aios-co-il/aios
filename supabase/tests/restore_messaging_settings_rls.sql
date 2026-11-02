-- Telephony, Telegram and ManyChat access rules
-- (20261102113400_restore_messaging_settings_rls): who reads and writes
-- telephony_settings, telegram_bot_state, telegram_messages and sync_jobs,
-- and the upsert telegram-verify-bot makes as the caller. Staging only: the
-- test's own users, tenants and rows, and a full rollback. Inserts made as a
-- persona use no RETURNING and are counted as postgres, so only the INSERT
-- policy decides them.
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
  u_owner uuid := gen_random_uuid();
  u_member uuid := gen_random_uuid();
  u_other uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  v_tag text := left(gen_random_uuid()::text, 8);
  t_a uuid := gen_random_uuid();
  t_b uuid := gen_random_uuid();
  t_c uuid := gen_random_uuid();
  v_tenants uuid[];
  bot_a uuid; bot_b uuid;
  n bigint;
BEGIN
  -- Fixtures, written as postgres. t_a is the main tenant, t_b another tenant
  -- (where the super admin acts), t_c a second tenant of t_a's owner.
  v_tenants := ARRAY[t_a, t_b, t_c];
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-rls-messaging-' || u || '@example.invalid'
  FROM unnest(ARRAY[u_owner, u_member, u_other, u_admin]) AS u;
  INSERT INTO public.tenants (id, name, slug) VALUES
    (t_a, 'QA ROLLBACK A', 'qa-rls-messaging-a-' || v_tag),
    (t_b, 'QA ROLLBACK B', 'qa-rls-messaging-b-' || v_tag),
    (t_c, 'QA ROLLBACK C', 'qa-rls-messaging-c-' || v_tag);
  INSERT INTO public.tenant_users (user_id, tenant_id, role) VALUES
    (u_owner, t_a, 'owner'), (u_owner, t_c, 'member'), (u_member, t_a, 'member'),
    (u_other, t_b, 'owner'), (u_admin, t_b, 'member');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (u_owner, 'owner', t_a), (u_member, 'campaigner', t_a), (u_other, 'owner', t_b), (u_admin, 'super_admin', NULL);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (u_owner, t_a), (u_member, t_a), (u_other, t_b), (u_admin, t_b)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;

  INSERT INTO public.telephony_settings (tenant_id, user_id, personal_phone) VALUES
    (t_a, u_owner, '0500000001'), (t_b, u_other, '0500000003');
  INSERT INTO public.telegram_bot_state (tenant_id, bot_username) VALUES (t_b, 'qa_b_bot') RETURNING id INTO bot_b;
  INSERT INTO public.telegram_messages (tenant_id, chat_id, text) VALUES (t_a, 1, 'QA A'), (t_b, 2, 'QA B');
  INSERT INTO public.sync_jobs (tenant_id) VALUES (t_a), (t_b);

  -- Owner of t_a: connects the bot (as telegram-verify-bot now does, as the caller), shares it into t_c.
  PERFORM pg_temp.qa_act(u_owner);
  INSERT INTO public.telegram_bot_state (tenant_id, bot_username, is_active, update_offset) VALUES (t_a, 'qa_a_bot', true, 0);
  PERFORM pg_temp.qa_act(NULL, 'none');
  SELECT id INTO bot_a FROM public.telegram_bot_state WHERE tenant_id = t_a AND shared_from_state_id IS NULL;
  PERFORM pg_temp.qa_expect(CASE WHEN bot_a IS NULL THEN 0 ELSE 1 END, 1, 'owner connects the tenant''s bot');
  PERFORM pg_temp.qa_act(u_owner);
  INSERT INTO public.telegram_bot_state (tenant_id, shared_from_state_id, bot_username, is_active, update_offset)
  VALUES (t_a, NULL, 'qa_a_bot_v2', true, 0)
  ON CONFLICT (tenant_id, shared_from_state_id) DO UPDATE SET bot_username = excluded.bot_username;
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE id = bot_a AND bot_username = 'qa_a_bot_v2'), 1, 'owner reconnects the bot in place (verify-bot upsert)');
  UPDATE public.telegram_bot_state SET is_active = false WHERE id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'owner disconnects the bot');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a telephony settings');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a bot');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a messages');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.sync_jobs WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a sync jobs');

  INSERT INTO public.telegram_bot_state (tenant_id, shared_from_state_id, bot_username, is_active) VALUES (t_c, bot_a, 'qa_a_bot', true);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE shared_from_state_id = bot_a), 1, 'owner lists the copy shared into t_c');
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
  PERFORM pg_temp.qa_act(NULL, 'none');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id = t_c AND shared_from_state_id = bot_a), 1, 'the shared copy is stored');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id = t_a AND chat_id = 3), 1, 'the owner''s message is stored');

  -- Member (campaigner) of t_a.
  PERFORM pg_temp.qa_act(u_member);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE tenant_id = ANY (v_tenants)), 1, 'member reads the owner''s telephony settings');
  INSERT INTO public.telephony_settings (tenant_id, user_id, personal_phone) VALUES (t_a, u_member, '0500000002');
  INSERT INTO public.telephony_settings (tenant_id, user_id, personal_phone) VALUES (t_a, u_member, '0500000022')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET personal_phone = excluded.personal_phone;
  UPDATE public.telephony_settings SET auto_record = false WHERE tenant_id = t_a AND user_id = u_member;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'member edits own telephony settings');
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
  BEGIN
    INSERT INTO public.telephony_settings (tenant_id, user_id) VALUES (t_a, u_admin);
    RAISE EXCEPTION 'member created telephony settings for someone else';
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
    INSERT INTO public.telegram_bot_state (tenant_id, bot_username) VALUES (t_a, 'Must be denied');
    RAISE EXCEPTION 'member connected a bot (owner only)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.telegram_bot_state (tenant_id, shared_from_state_id, bot_username) VALUES (t_c, bot_a, 'Must be denied');
    RAISE EXCEPTION 'member shared into a tenant they are not a member of';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.telegram_bot_state (tenant_id, shared_from_state_id, bot_username) VALUES (t_a, bot_b, 'Must be denied');
    RAISE EXCEPTION 'member copied another tenant''s bot into t_a';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id = ANY (v_tenants)), 2, 'member reads t_a messages');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.sync_jobs WHERE tenant_id = ANY (v_tenants)), 1, 'member reads t_a sync jobs');
  PERFORM pg_temp.qa_act(NULL, 'none');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE user_id = u_member AND personal_phone = '0500000022' AND NOT auto_record), 1, 'the member''s telephony settings are stored');

  -- Owner of another tenant (t_b): nothing of t_a or t_c.
  PERFORM pg_temp.qa_act(u_other);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE tenant_id IN (t_a, t_c)), 0, 'other tenant reads t_a telephony settings');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id IN (t_a, t_c)), 0, 'other tenant reads t_a bots');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id IN (t_a, t_c)), 0, 'other tenant reads t_a messages');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.sync_jobs WHERE tenant_id IN (t_a, t_c)), 0, 'other tenant reads t_a sync jobs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id = t_b), 1, 'other tenant reads its own bot');
  BEGIN
    INSERT INTO public.telegram_bot_state (tenant_id, shared_from_state_id, bot_username) VALUES (t_b, bot_a, 'Must be denied');
    RAISE EXCEPTION 'other tenant''s owner copied a bot of a tenant they are not in';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.telegram_messages (tenant_id, chat_id, text) VALUES (t_a, 5, 'Must be denied');
    RAISE EXCEPTION 'other tenant wrote a message into t_a';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Super admin acting in t_b: reads every tenant, writes only in t_b.
  PERFORM pg_temp.qa_act(u_admin);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE tenant_id = ANY (v_tenants)), 3, 'super admin reads all telephony settings');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id = ANY (v_tenants)), 3, 'super admin reads all bots and copies');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id = ANY (v_tenants)), 3, 'super admin reads all messages');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.sync_jobs WHERE tenant_id = ANY (v_tenants)), 2, 'super admin reads all sync jobs');
  INSERT INTO public.telegram_messages (tenant_id, chat_id, text) VALUES (t_b, 6, 'QA B by super admin');
  BEGIN
    INSERT INTO public.telegram_messages (tenant_id, chat_id, text) VALUES (t_a, 7, 'Must be denied');
    RAISE EXCEPTION 'super admin wrote a message into a tenant they do not act in';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.telegram_bot_state (tenant_id, bot_username) VALUES (t_c, 'Must be denied');
    RAISE EXCEPTION 'super admin connected a bot in another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.telegram_bot_state SET is_active = true WHERE id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'super admin edits another tenant''s bot');
  UPDATE public.telegram_bot_state SET tenant_id = t_b WHERE shared_from_state_id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'super admin moves a copy into the tenant they act in');
  DELETE FROM public.telegram_bot_state WHERE shared_from_state_id = bot_a OR id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'super admin deletes another tenant''s bot or copy');
  UPDATE public.telephony_settings SET personal_phone = 'Must be denied' WHERE tenant_id = t_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'super admin edits another tenant''s telephony settings');
  BEGIN
    INSERT INTO public.telephony_settings (tenant_id, user_id) VALUES (t_a, u_admin);
    RAISE EXCEPTION 'super admin created telephony settings in another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.qa_act(NULL, 'none');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id = t_b AND chat_id = 6), 1, 'the super admin''s message in t_b is stored');

  -- Anonymous: nothing.
  PERFORM pg_temp.qa_act(NULL, 'anon');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telephony_settings WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads telephony settings');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_bot_state WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads bots');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.telegram_messages WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads messages');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.sync_jobs WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads sync jobs');
  BEGIN
    INSERT INTO public.telegram_messages (tenant_id, chat_id, text) VALUES (t_a, 8, 'Must be denied');
    RAISE EXCEPTION 'anon wrote a message';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Owner again: removes the copy from t_a's side, then the bot itself.
  PERFORM pg_temp.qa_act(u_owner);
  DELETE FROM public.telegram_bot_state WHERE tenant_id = t_c AND shared_from_state_id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'owner removes the shared copy');
  DELETE FROM public.telegram_bot_state WHERE id = bot_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'owner deletes the tenant''s bot');

  PERFORM pg_temp.qa_act(NULL, 'none');
END;
$test$;
SELECT 'Telephony, Telegram and ManyChat access rules passed' AS result;
ROLLBACK;
