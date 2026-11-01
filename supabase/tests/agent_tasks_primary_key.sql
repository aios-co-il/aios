-- agent_tasks primary key (20261101090000_agent_tasks_primary_key): synthetic
-- rows inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_agent uuid;
  v_tenant uuid;
  v_task uuid;
  v_claimed uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.agent_tasks'::regclass AND contype = 'p'
  ) THEN
    RAISE EXCEPTION 'agent_tasks must have a primary key';
  END IF;

  SELECT id, tenant_id INTO v_agent, v_tenant FROM public.ai_agents ORDER BY id LIMIT 1;
  IF v_agent IS NULL THEN RAISE EXCEPTION 'Requires an agent'; END IF;

  INSERT INTO public.agent_tasks (agent_id, tenant_id, title, status, schedule_type, scheduled_at)
  VALUES (v_agent, v_tenant, 'QA ROLLBACK reminder', 'pending', 'once', now() - interval '1 minute')
  RETURNING id INTO v_task;

  -- The dispatcher's claim: the UPDATE that failed with 55000 while the table
  -- published updates without a replica identity.
  UPDATE public.agent_tasks
  SET last_run = now(), status = 'running'
  WHERE id = v_task AND last_run IS NULL
  RETURNING id INTO v_claimed;
  IF v_claimed IS DISTINCT FROM v_task THEN
    RAISE EXCEPTION 'claim: the due task must be claimed';
  END IF;

  -- A second claim of the same task finds nothing (the race guard).
  v_claimed := NULL;
  UPDATE public.agent_tasks
  SET last_run = now(), status = 'running'
  WHERE id = v_task AND last_run IS NULL
  RETURNING id INTO v_claimed;
  IF v_claimed IS NOT NULL THEN
    RAISE EXCEPTION 'claim: a claimed task must not be claimed twice';
  END IF;
END
$test$;
SELECT 'agent_tasks primary key: key, claim and race guard passed' AS result;
ROLLBACK;
