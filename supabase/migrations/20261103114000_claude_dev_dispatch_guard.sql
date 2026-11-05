-- AIO-299: Carmen opens at most one Claude session per dev task.
--
-- claude-mcp's request_dev_task reserves its claude_dispatches row through
-- claim_claude_dev_dispatch() before it fires the Claude routine. A second
-- call for the same tenant and the same normalized task inside the window
-- (claude-mcp passes DEV_DISPATCH_WINDOW_SECONDS, 15 minutes) gets the first
-- row back, so Carmen returns that session link instead of opening another.
--
-- Matching rule: the task text is trimmed, runs of whitespace become one
-- space, and it is lower-cased; the SHA-256 of that is request_hash. Context
-- and branch are not part of the key. A row marked 'failed' (the routine
-- refused the fire) does not block a retry; a 'dispatching' row whose fire
-- never finished blocks repeats until the window ends.
--
-- Existing rows keep request_hash NULL and never match. Nothing here sends a
-- message or replays an old notification.

ALTER TABLE public.claude_dispatches
  ADD COLUMN IF NOT EXISTS request_hash text;

COMMENT ON COLUMN public.claude_dispatches.request_hash IS
  'AIO-299: SHA-256 of the normalized request_dev_task text (trim, collapse whitespace, lower-case); the duplicate-dispatch key with tenant_id and tool.';

CREATE INDEX IF NOT EXISTS idx_claude_dispatches_dedupe
  ON public.claude_dispatches (tenant_id, tool, request_hash, created_at DESC)
  WHERE request_hash IS NOT NULL;

-- Reserves a request_dev_task dispatch for the tenant, or returns the row of
-- the same task reserved inside the window. A transaction advisory lock on
-- (tenant, tool, hash) serializes concurrent callers, so only one reserves.
CREATE OR REPLACE FUNCTION public.claim_claude_dev_dispatch(
  p_tenant_id uuid,
  p_request_text text,
  p_context text,
  p_branch text,
  p_window_seconds integer,
  p_agent_id uuid DEFAULT NULL
)
RETURNS TABLE (dispatch_id uuid, claimed boolean, existing_session_url text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text;
  v_existing_id uuid;
  v_existing_url text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'claim_claude_dev_dispatch: tenant required';
  END IF;

  v_hash := encode(
    sha256(convert_to(
      lower(regexp_replace(btrim(p_request_text), '\s+', ' ', 'g')),
      'UTF8'
    )),
    'hex'
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':request_dev_task:' || v_hash, 0)
  );

  SELECT d.id, d.session_url
  INTO v_existing_id, v_existing_url
  FROM public.claude_dispatches d
  WHERE d.tenant_id = p_tenant_id
    AND d.tool = 'request_dev_task'
    AND d.request_hash = v_hash
    AND d.status <> 'failed'
    AND d.created_at >= now() - make_interval(secs => p_window_seconds)
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE NOTICE 'claim_claude_dev_dispatch: duplicate of %', v_existing_id;
    RETURN QUERY SELECT v_existing_id, false, v_existing_url;
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO public.claude_dispatches AS d
    (tenant_id, agent_id, tool, request_text, context, branch, request_hash, status)
  VALUES
    (p_tenant_id, p_agent_id, 'request_dev_task', p_request_text,
     NULLIF(p_context, ''), NULLIF(p_branch, ''), v_hash, 'dispatching')
  RETURNING d.id, true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_claude_dev_dispatch(uuid, text, text, text, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_claude_dev_dispatch(uuid, text, text, text, integer, uuid)
  TO service_role;
