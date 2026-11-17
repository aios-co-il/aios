-- Claude Direct follow-up queue (20261117130000_claude_session_messages): who may reach it,
-- what a claim takes (one message per session at a time), and that a follow-up left queued too
-- long is cancelled, and a claimed one with no verdict failed, instead of being sent late.
-- Synthetic rows inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_conversation uuid;
  v_fresh uuid;
  v_stale uuid;
  v_second uuid;
  v_claimed uuid;
  v_fn text := 'public.claim_claude_session_message(text, integer)';
BEGIN
  -- The table and the claim belong to the service role only.
  IF has_table_privilege('anon', 'public.claude_session_messages', 'SELECT')
     OR has_table_privilege('authenticated', 'public.claude_session_messages', 'SELECT')
     OR has_table_privilege('authenticated', 'public.claude_session_messages', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.claude_session_messages', 'INSERT') THEN
    RAISE EXCEPTION 'claude_session_messages must be service role only';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.claude_session_messages'::regclass) THEN
    RAISE EXCEPTION 'claude_session_messages must have row level security on';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'claim_claude_session_message must be service role only';
  END IF;

  SELECT id, tenant_id INTO v_conversation, v_tenant FROM public.ai_conversations ORDER BY id LIMIT 1;
  IF v_conversation IS NULL THEN
    SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
    INSERT INTO public.ai_conversations (tenant_id, user_id)
    SELECT v_tenant, id FROM auth.users ORDER BY id LIMIT 1
    RETURNING id INTO v_conversation;
    IF v_conversation IS NULL THEN RAISE EXCEPTION 'Requires a user'; END IF;
  END IF;

  -- A session id that could read as a command-line option is refused.
  BEGIN
    INSERT INTO public.claude_session_messages (tenant_id, conversation_id, cloud_session_id, via, status)
    VALUES (v_tenant, v_conversation, '--help', 'worker', 'queued');
    RAISE EXCEPTION 'a cloud_session_id that is not session_… must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Leave nothing else for this test's claims to pick up.
  UPDATE public.claude_session_messages SET status = 'cancelled' WHERE status = 'queued';

  INSERT INTO public.claude_session_messages
    (tenant_id, conversation_id, cloud_session_id, via, status, prompt, created_at)
  VALUES (v_tenant, v_conversation, 'session_QAstale', 'worker', 'queued', 'late', now() - interval '5 minutes')
  RETURNING id INTO v_stale;
  INSERT INTO public.claude_session_messages
    (tenant_id, conversation_id, cloud_session_id, via, status, prompt)
  VALUES (v_tenant, v_conversation, 'session_QAfresh', 'worker', 'queued', 'now')
  RETURNING id INTO v_fresh;

  SELECT id INTO v_claimed FROM public.claim_claude_session_message('qa-worker', 60);
  IF v_claimed IS DISTINCT FROM v_fresh THEN
    RAISE EXCEPTION 'claim: the fresh follow-up must be claimed, got %', v_claimed;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.claude_session_messages
    WHERE id = v_fresh AND status = 'sending' AND worker = 'qa-worker' AND claimed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'claim: the claimed row must be sending, with its worker and time';
  END IF;

  -- The stale follow-up was already answered through a new session: cancelled, prompt cleared.
  IF NOT EXISTS (
    SELECT 1 FROM public.claude_session_messages
    WHERE id = v_stale AND status = 'cancelled' AND prompt IS NULL AND finished_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'claim: a follow-up queued too long must be cancelled, not sent';
  END IF;

  -- A second claim finds nothing (the race guard).
  v_claimed := NULL;
  SELECT id INTO v_claimed FROM public.claim_claude_session_message('qa-worker-2', 60);
  IF v_claimed IS NOT NULL THEN
    RAISE EXCEPTION 'claim: a claimed follow-up must not be claimed twice';
  END IF;

  -- A session with a message still being sent gives up no second message: one at a time, in order.
  INSERT INTO public.claude_session_messages
    (tenant_id, conversation_id, cloud_session_id, via, status, prompt)
  VALUES (v_tenant, v_conversation, 'session_QAfresh', 'worker', 'queued', 'second')
  RETURNING id INTO v_second;
  v_claimed := NULL;
  SELECT id INTO v_claimed FROM public.claim_claude_session_message('qa-worker-2', 60);
  IF v_claimed IS NOT NULL THEN
    RAISE EXCEPTION 'claim: a session with a message in flight must not give up another';
  END IF;

  -- Once the first has its verdict, the second is claimed.
  UPDATE public.claude_session_messages SET status = 'sent' WHERE id = v_fresh;
  SELECT id INTO v_claimed FROM public.claim_claude_session_message('qa-worker-2', 60);
  IF v_claimed IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'claim: the next message of the session must be claimed after the verdict';
  END IF;

  -- A claimed row whose worker died is failed at the next claim, and its session is free again.
  UPDATE public.claude_session_messages SET claimed_at = now() - interval '10 minutes' WHERE id = v_second;
  PERFORM public.claim_claude_session_message('qa-worker-3', 60);
  IF NOT EXISTS (
    SELECT 1 FROM public.claude_session_messages
    WHERE id = v_second AND status = 'failed' AND prompt IS NULL AND finished_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'claim: a row claimed long ago with no verdict must be failed';
  END IF;

  -- A signed-in member cannot claim.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.claim_claude_session_message('member', 60);
    RESET ROLE;
    RAISE EXCEPTION 'claim: authenticated must not be able to claim';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
END
$test$;
SELECT 'claude_session_messages: grants, claim, per-session order, stale rows and race guard passed' AS result;
ROLLBACK;
