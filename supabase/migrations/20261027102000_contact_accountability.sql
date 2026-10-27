-- Contact accountability for Carmen's manager round (AIO-253, plan component
-- C19). Nothing is sent or written to a client card by this migration.
--
-- 1. call_logs.caller_resolution: how pbx-webhook chose caller_user_id.
--    'extension' = the PBX extension is mapped to that person; 'fallback' =
--    the extension was unknown and the row carries the tenant's first user
--    (caller_user_id is NOT NULL). Rows written before this migration, by
--    other providers or by click-to-call stay NULL. Only 'extension' names
--    the person who spoke, so no one is ever blamed for a call they did not
--    make.
-- 2. get_client_contact_evidence(p_tenant_id, p_since, p_min_call_seconds,
--    p_client_ids): per client the tenant follows up, the last logged
--    contact on the card, the last contact since p_since and the oldest
--    call and meeting still waiting to be logged.
--    Service role only (the round reads it; Carmen's chat tools never do).
-- 3. carmen_finding_resolve_confirmed: resolves a live finding a staff
--    member handled through Carmen (e.g. "תעדי 123" logged the drafted call),
--    cancels its planned messages and writes the audit event. Service role
--    only; run-ai-agent authorises the person first.

-- ─── 1. call_logs.caller_resolution ─────────────────────────────────────────

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS caller_resolution text;

DO $call_logs_caller_resolution_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'call_logs_caller_resolution_check'
      AND conrelid = 'public.call_logs'::regclass
  ) THEN
    ALTER TABLE public.call_logs
      ADD CONSTRAINT call_logs_caller_resolution_check
      CHECK (caller_resolution IS NULL OR caller_resolution IN ('extension', 'fallback'));
  END IF;
END
$call_logs_caller_resolution_check$;

COMMENT ON COLUMN public.call_logs.caller_resolution IS
  'How pbx-webhook chose caller_user_id: extension (mapped PBX extension) or fallback (the tenant''s first user). NULL: older rows and other providers; never treated as attributed.';

-- ─── 2. Contact evidence per client ─────────────────────────────────────────

-- Clients in scope: active clients the tenant reaches (its own, or of an
-- agency shared with it) that one of its active campaigners is assigned to
-- today, plus its own clients nobody is assigned to. A client staffed only
-- by another tenant is that tenant's to follow up.
--
-- Per client:
-- client_since    when the client started (created, or a later start_date);
--                 no contact is expected before it.
-- last_log_at     the card's last counting contact (get_latest_client_call_updates,
--                 the pulse's own rule) or, since a plain meeting entry does
--                 not count as a call there, the last meeting a person (or
--                 Carmen at their request) logged.
-- last_contact_at the last call, meeting or campaigner message since p_since.
-- unlogged_call_* the first call since p_since and after last_log_at: the
--                 oldest contact still waiting to be logged, which stays the
--                 same until someone logs it. Its person is named only when
--                 the PBX extension named them.
-- unlogged_meeting_* the same for meetings and client-linked recordings.
-- Calls count when completed and at least p_min_call_seconds long; messages
-- when one of the client's campaigners sent them. Only the tenant's own
-- rows are read, and no message text is returned.
CREATE OR REPLACE FUNCTION public.get_client_contact_evidence(
  p_tenant_id uuid,
  p_since timestamptz,
  p_min_call_seconds integer DEFAULT 60,
  p_client_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  client_id uuid,
  client_name text,
  agency_id uuid,
  client_since timestamptz,
  last_log_at timestamptz,
  last_contact_at timestamptz,
  unlogged_call_id uuid,
  unlogged_call_at timestamptz,
  unlogged_call_seconds integer,
  unlogged_call_resolution text,
  unlogged_call_user_id uuid,
  unlogged_call_user_name text,
  unlogged_meeting_id uuid,
  unlogged_meeting_source text,
  unlogged_meeting_at timestamptz,
  unlogged_meeting_summary text
)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH today AS (
    SELECT (now() AT TIME ZONE 'Asia/Jerusalem')::date AS d
  ), assigned AS (
    SELECT ct.client_id, cp.tenant_id, pr.id AS user_id
    FROM public.client_team AS ct
    JOIN public.campaigners AS cp ON cp.id = ct.campaigner_id AND cp.active
    LEFT JOIN public.profiles AS pr ON pr.campaigner_id = ct.campaigner_id
    CROSS JOIN today
    WHERE (ct.start_date IS NULL OR ct.start_date <= today.d)
      AND (ct.end_date IS NULL OR ct.end_date >= today.d)
  ), scope AS (
    SELECT c.id, c.name, c.agency_id, c.whatsapp_group_id,
      greatest(c.created_at, c.start_date::timestamp AT TIME ZONE 'Asia/Jerusalem') AS since
    FROM public.clients AS c
    WHERE c.status = 'active'
      AND (p_client_ids IS NULL OR c.id = ANY (p_client_ids))
      AND (
        (
          (c.tenant_id = p_tenant_id OR EXISTS (
            SELECT 1 FROM public.agency_tenant_access AS ata
            WHERE ata.agency_id = c.agency_id
              AND ata.accessing_tenant_id = p_tenant_id))
          AND EXISTS (
            SELECT 1 FROM assigned AS a
            WHERE a.client_id = c.id AND a.tenant_id = p_tenant_id)
        )
        OR (
          c.tenant_id = p_tenant_id
          AND NOT EXISTS (SELECT 1 FROM assigned AS a WHERE a.client_id = c.id)
        )
      )
  ), logs AS (
    SELECT sc.id AS client_id, greatest(counted.at, meeting.at) AS at
    FROM scope AS sc
    LEFT JOIN (
      SELECT l.client_id, l.last_client_call_at AS at
      FROM public.get_latest_client_call_updates(ARRAY(SELECT s.id FROM scope AS s)) AS l
    ) AS counted ON counted.client_id = sc.id
    LEFT JOIN (
      SELECT u.client_id, max(u.created_at) AS at
      FROM public.client_updates AS u
      WHERE u.client_id IN (SELECT s.id FROM scope AS s)
        AND u.update_type = 'meeting'
        AND u.source IN ('human', 'carmen_confirmed')
      GROUP BY u.client_id
    ) AS meeting ON meeting.client_id = sc.id
  ), calls AS (
    SELECT cl.client_id, cl.id, cl.created_at AS at, cl.duration,
      cl.caller_user_id, cl.caller_resolution
    FROM public.call_logs AS cl
    WHERE cl.tenant_id = p_tenant_id
      AND cl.client_id IN (SELECT sc.id FROM scope AS sc)
      AND cl.status = 'completed'
      AND coalesce(cl.duration, 0) >= greatest(coalesce(p_min_call_seconds, 60), 1)
      AND cl.created_at >= p_since
  ), meetings AS (
    SELECT m.client_id, m.id, m.source, m.at, m.summary
    FROM (
      SELECT bot.client_id, bot.id, 'meeting_bot'::text AS source,
        coalesce(bot.ended_at, bot.joined_at, bot.scheduled_start, bot.created_at) AS at,
        rec.summary_md AS summary
      FROM public.meeting_bot_sessions AS bot
      LEFT JOIN public.zoom_recordings AS rec
        ON rec.id = bot.zoom_recording_id AND rec.tenant_id = bot.tenant_id
      WHERE bot.tenant_id = p_tenant_id
        AND bot.status = 'done'
        AND bot.client_id IN (SELECT sc.id FROM scope AS sc)
      UNION ALL
      SELECT rec.client_id, rec.id, 'recording'::text,
        coalesce(rec.start_time, rec.created_at), rec.summary_md
      FROM public.zoom_recordings AS rec
      WHERE rec.tenant_id = p_tenant_id
        AND rec.client_id IN (SELECT sc.id FROM scope AS sc)
        AND NOT EXISTS (
          SELECT 1 FROM public.meeting_bot_sessions AS bot
          WHERE bot.zoom_recording_id = rec.id)
    ) AS m
    WHERE m.at >= p_since AND m.at <= now()
  ), messages AS (
    SELECT x.client_id, max(x.created_at) AS at
    FROM (
      SELECT msg.client_id, msg.created_at, msg.sent_by_user_id
      FROM public.chat_messages AS msg
      WHERE msg.tenant_id = p_tenant_id
        AND msg.client_id IN (SELECT sc.id FROM scope AS sc)
        AND msg.direction = 'outbound'
        AND msg.created_at >= p_since
      UNION ALL
      SELECT sc.id, msg.created_at, msg.sent_by_user_id
      FROM scope AS sc
      JOIN public.chat_messages AS msg ON msg.group_id = sc.whatsapp_group_id
      WHERE msg.tenant_id = p_tenant_id
        AND msg.client_id IS NULL
        AND msg.direction = 'outbound'
        AND msg.created_at >= p_since
    ) AS x
    WHERE EXISTS (
      SELECT 1 FROM assigned AS a
      WHERE a.client_id = x.client_id
        AND a.tenant_id = p_tenant_id
        AND a.user_id = x.sent_by_user_id)
    GROUP BY x.client_id
  ), unlogged_calls AS (
    SELECT DISTINCT ON (ca.client_id) ca.*
    FROM calls AS ca
    JOIN logs AS lg ON lg.client_id = ca.client_id
    WHERE lg.at IS NULL OR ca.at > lg.at
    ORDER BY ca.client_id, ca.at
  ), unlogged_meetings AS (
    SELECT DISTINCT ON (me.client_id) me.*
    FROM meetings AS me
    JOIN logs AS lg ON lg.client_id = me.client_id
    WHERE lg.at IS NULL OR me.at > lg.at
    ORDER BY me.client_id, me.at
  )
  SELECT
    sc.id,
    sc.name,
    sc.agency_id,
    sc.since,
    lg.at,
    greatest(
      (SELECT max(ca.at) FROM calls AS ca WHERE ca.client_id = sc.id),
      (SELECT max(me.at) FROM meetings AS me WHERE me.client_id = sc.id),
      msg.at),
    uc.id,
    uc.at,
    uc.duration,
    uc.caller_resolution,
    CASE WHEN uc.caller_resolution = 'extension' THEN uc.caller_user_id END,
    CASE WHEN uc.caller_resolution = 'extension'
      THEN coalesce(nullif(caller.full_name, ''), caller.email) END,
    um.id,
    um.source,
    um.at,
    left(um.summary, 1000)
  FROM scope AS sc
  JOIN logs AS lg ON lg.client_id = sc.id
  LEFT JOIN messages AS msg ON msg.client_id = sc.id
  LEFT JOIN unlogged_calls AS uc ON uc.client_id = sc.id
  LEFT JOIN public.profiles AS caller ON caller.id = uc.caller_user_id
  LEFT JOIN unlogged_meetings AS um ON um.client_id = sc.id
  ORDER BY sc.name, sc.id
$$;

REVOKE ALL ON FUNCTION public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[])
  TO service_role;

COMMENT ON FUNCTION public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[]) IS
  'Service role only: per client the tenant follows up, the last logged contact, the last contact since p_since and the oldest call and meeting not yet logged (manager round, AIO-253).';

-- ─── 3. Resolve a finding a staff member handled through Carmen ─────────────

-- Resolves the live finding as fixed by p_actor_user_id, cancels its planned
-- messages and writes a 'resolved' event. Returns false when the finding is
-- not live in the tenant (already handled, or another tenant's). The actor
-- must belong to the tenant.
CREATE OR REPLACE FUNCTION public.carmen_finding_resolve_confirmed(
  p_tenant_id uuid,
  p_finding_id uuid,
  p_actor_user_id uuid,
  p_note text DEFAULT NULL
)
RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = p_actor_user_id AND ur.tenant_id = p_tenant_id
    UNION ALL
    SELECT 1 FROM public.tenant_users AS tu
    WHERE tu.user_id = p_actor_user_id AND tu.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'actor_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  UPDATE public.carmen_findings AS f
  SET status = 'resolved',
      resolution = 'fixed',
      resolved_by = p_actor_user_id,
      resolved_at = now(),
      next_action_at = NULL
  WHERE f.id = p_finding_id
    AND f.tenant_id = p_tenant_id
    AND f.status IN ('open', 'notified', 'acknowledged', 'snoozed');
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.carmen_finding_deliveries AS d
  SET status = 'cancelled'
  WHERE d.finding_id = p_finding_id AND d.status = 'planned';

  INSERT INTO public.carmen_finding_events
    (tenant_id, finding_id, event, actor_user_id, note, details)
  VALUES (p_tenant_id, p_finding_id, 'resolved', p_actor_user_id,
    left(p_note, 1000),
    jsonb_build_object('resolution', 'fixed', 'via', 'carmen_confirmed'));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.carmen_finding_resolve_confirmed(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_finding_resolve_confirmed(uuid, uuid, uuid, text)
  TO service_role;
