-- Two guards for automation-driven broadcasts (review of PR #892).

-- Reserve a list send atomically: concurrent triggers serialize on an
-- advisory lock per (automation, step), so only one of them can see "no
-- recent send" and insert the draft broadcast. Returns the reserved draft, or
-- the recent broadcast with reserved = false when the interval has not passed.
CREATE OR REPLACE FUNCTION public.broadcast_reserve_automation_send(
  p_tenant_id uuid,
  p_automation_id uuid,
  p_step_key text,
  p_min_interval_hours numeric,
  p_name text,
  p_channel text,
  p_provider text
) RETURNS TABLE (broadcast_id uuid, reserved boolean)
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO 'public'
AS $$
DECLARE
  v_recent uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_automation_id::text || ':' || p_step_key, 0)
  );

  IF coalesce(p_min_interval_hours, 0) > 0 THEN
    SELECT b.id INTO v_recent
    FROM public.broadcasts b
    WHERE b.tenant_id = p_tenant_id
      AND b.origin = 'automation'
      AND b.automation_id = p_automation_id
      AND b.automation_step_key = p_step_key
      AND b.created_at >= now() - make_interval(secs => p_min_interval_hours * 3600)
    ORDER BY b.created_at DESC
    LIMIT 1;
    IF v_recent IS NOT NULL THEN
      RETURN QUERY SELECT v_recent, false;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  INSERT INTO public.broadcasts
    (tenant_id, origin, automation_id, automation_step_key, name, channel, provider, status)
  VALUES
    (p_tenant_id, 'automation', p_automation_id, p_step_key, p_name, p_channel, p_provider, 'draft')
  RETURNING id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_reserve_automation_send(uuid, uuid, text, numeric, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_reserve_automation_send(uuid, uuid, text, numeric, text, text, text)
  TO service_role;

-- Dispatch candidates: sending broadcasts with pending recipients and room
-- left under today's (UTC) daily cap. Idle automation streams stay 'sending'
-- forever and capped broadcasts wait for tomorrow; selecting only broadcasts
-- that can send now keeps either from filling the window and starving others.
CREATE OR REPLACE FUNCTION public.broadcast_dispatch_candidates(p_limit integer)
  RETURNS SETOF public.broadcasts
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO 'public'
AS $$
  SELECT b.*
  FROM public.broadcasts b
  WHERE b.status = 'sending'
    AND EXISTS (
      SELECT 1 FROM public.broadcast_recipients r
      WHERE r.broadcast_id = b.id AND r.status = 'pending'
    )
    AND (
      SELECT count(*) FROM public.broadcast_recipients r
      WHERE r.broadcast_id = b.id
        AND r.sent_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
    ) < coalesce(b.daily_cap, 300)
  ORDER BY b.started_at ASC NULLS LAST
  LIMIT greatest(p_limit, 0);
$$;

REVOKE ALL ON FUNCTION public.broadcast_dispatch_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_dispatch_candidates(integer) TO service_role;
