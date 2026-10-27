-- Contact accountability for Carmen's manager round (AIO-253, plan component
-- C19). Nothing is sent by this migration.
--
-- 1. call_logs.caller_resolution: how caller_user_id was chosen.
--    'extension' = pbx-webhook mapped the PBX extension to that person;
--    'click_to_call' = the person started the call from AIOS (make-pbx-call);
--    'fallback' = the extension was unknown and the row carries the tenant's
--    first user (caller_user_id is NOT NULL). Rows written before this
--    migration and by other providers stay NULL. Only 'extension' and
--    'click_to_call' name the person who spoke, so no one is held to a call
--    they did not make.
-- 2. get_client_contact_evidence: per client the tenant follows up, the last
--    logged contact on the card, the last contact and the oldest call and
--    meeting still waiting to be logged. Service role only (the round reads
--    it; Carmen's chat tools never do).
-- 3. carmen_finding_confirm_contact: a staff member's "תעדי <code>" reply.
--    Decides in the tenant whether this person may log the finding's
--    contact, then writes the card entry and resolves the finding in one
--    transaction. Service role only; run-ai-agent passes the person talking
--    to Carmen.

-- ─── 1. call_logs.caller_resolution ─────────────────────────────────────────

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS caller_resolution text;

-- NOT VALID: the column is new, so every existing row is NULL; this skips a
-- full scan of call_logs under an exclusive lock. New and updated rows are
-- still checked.
ALTER TABLE public.call_logs
  DROP CONSTRAINT IF EXISTS call_logs_caller_resolution_check;
ALTER TABLE public.call_logs
  ADD CONSTRAINT call_logs_caller_resolution_check
  CHECK (caller_resolution IN ('extension', 'click_to_call', 'fallback'))
  NOT VALID;

COMMENT ON COLUMN public.call_logs.caller_resolution IS
  'How caller_user_id was chosen: extension (mapped PBX extension), click_to_call (started from AIOS by that person) or fallback (the tenant''s first user). NULL: older rows and other providers. Only extension and click_to_call are treated as attributed.';

-- ─── 2. Contact evidence per client ─────────────────────────────────────────

-- Clients in scope: active clients whose card the tenant may write (its own,
-- or of an agency shared with it read_write, as record_client_card_entry
-- requires) that one of its active campaigners is assigned to today, plus its
-- own clients nobody is assigned to. A client staffed only
-- by another tenant is that tenant's to follow up.
--
-- Per client:
-- client_since    when the client started (created, or a later start_date);
--                 no contact is expected before it.
-- last_log_at     the card's last counting contact (get_latest_client_call_updates,
--                 the pulse's own rule) or, since a plain meeting entry does
--                 not count as a call there, the last meeting a person (or
--                 Carmen at their request) logged.
-- last_contact_at the last call, meeting or message from one of the client's
--                 campaigners since p_contact_since (default p_since). The
--                 round reads it further back than the no-contact threshold,
--                 so the contact a silence started from is still known.
-- unlogged_call_* the oldest call since p_since that no log covers. A log
--                 covers a call when it was written no earlier than 30
--                 minutes before the call started (row time minus duration:
--                 the PBX reports a call when it ends). The person is named
--                 only for an attributed call by a member of the tenant.
-- unlogged_meeting_* the same for meetings: a done meeting-bot session, or a
--                 Zoom meeting with its recording files collapsed into one
--                 (the file with the summary first), compared with when it
--                 started and dated when it ended. Internal and lead meetings
--                 (summary_scope campaigner, agency or lead) are not client
--                 contact. unlogged_meeting_key stays the same across runs.
-- Calls count when completed and at least p_min_call_seconds long. A message
-- counts when one of the client's campaigners in this tenant wrote it: sent
-- from AIOS, typed on their own connected phone, or written in the client's
-- group from their phone (an @lid sender mapped through wa_lid_map), seen on
-- any of the tenant's lines. The group is read as the tenant's own copy of
-- it (same group_chat_id). Calls, meetings and messages are the tenant's own
-- rows and card entries are the client's card; only timestamps of messages
-- leave, never their text.
CREATE OR REPLACE FUNCTION public.get_client_contact_evidence(
  p_tenant_id uuid,
  p_since timestamptz,
  p_min_call_seconds integer DEFAULT 60,
  p_client_ids uuid[] DEFAULT NULL,
  p_contact_since timestamptz DEFAULT NULL
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
  unlogged_meeting_key text,
  unlogged_meeting_source text,
  unlogged_meeting_at timestamptz,
  unlogged_meeting_summary text
)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH bounds AS (
    SELECT (now() AT TIME ZONE 'Asia/Jerusalem')::date AS today,
      least(coalesce(p_contact_since, p_since), p_since) AS contact_since
  ), assigned AS (
    SELECT ct.client_id, cp.tenant_id, pr.id AS user_id,
      public.phone_match_key(cp.phone) AS campaigner_key,
      public.phone_match_key(pr.phone) AS profile_key
    FROM public.client_team AS ct
    JOIN public.campaigners AS cp ON cp.id = ct.campaigner_id AND cp.active
    LEFT JOIN public.profiles AS pr ON pr.campaigner_id = ct.campaigner_id
    CROSS JOIN bounds
    WHERE (ct.start_date IS NULL OR ct.start_date <= bounds.today)
      AND (ct.end_date IS NULL OR ct.end_date >= bounds.today)
  ), mine AS (
    SELECT a.* FROM assigned AS a WHERE a.tenant_id = p_tenant_id
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
              AND ata.source_tenant_id = c.tenant_id
              AND ata.accessing_tenant_id = p_tenant_id
              AND ata.access_level = 'read_write'))
          AND EXISTS (SELECT 1 FROM mine AS m WHERE m.client_id = c.id)
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
    SELECT cl.client_id, cl.id, cl.created_at AS at,
      cl.created_at - make_interval(secs => coalesce(cl.duration, 0)) AS started_at,
      cl.duration, cl.caller_user_id, cl.caller_resolution
    FROM public.call_logs AS cl
    CROSS JOIN bounds
    WHERE cl.tenant_id = p_tenant_id
      AND cl.client_id IN (SELECT sc.id FROM scope AS sc)
      AND cl.status = 'completed'
      AND coalesce(cl.duration, 0) >= greatest(coalesce(p_min_call_seconds, 60), 1)
      AND cl.created_at >= bounds.contact_since
  ), meetings AS (
    SELECT m.*
    FROM (
      SELECT bot.client_id, bot.id, 'bot:' || bot.id AS key,
        'meeting_bot'::text AS source,
        coalesce(bot.joined_at, bot.scheduled_start, bot.created_at) AS started_at,
        coalesce(bot.ended_at, bot.joined_at, bot.scheduled_start, bot.created_at) AS at,
        rec.summary_md AS summary
      FROM public.meeting_bot_sessions AS bot
      LEFT JOIN public.zoom_recordings AS rec
        ON rec.id = bot.zoom_recording_id AND rec.tenant_id = bot.tenant_id
      WHERE bot.tenant_id = p_tenant_id
        AND bot.status = 'done'
        AND bot.summary_scope IN ('auto', 'client')
        AND bot.client_id IN (SELECT sc.id FROM scope AS sc)
      UNION ALL
      SELECT zoom.client_id, zoom.id, zoom.key, 'recording'::text,
        zoom.started_at, zoom.at, zoom.summary
      FROM (
        SELECT DISTINCT ON (rec.client_id, rec.meeting_id)
          rec.client_id, rec.id, 'zoom:' || rec.meeting_id AS key,
          coalesce(rec.start_time, rec.created_at) AS started_at,
          coalesce(rec.start_time, rec.created_at)
            + make_interval(mins => coalesce(rec.duration, 0)) AS at,
          rec.summary_md AS summary
        FROM public.zoom_recordings AS rec
        WHERE rec.tenant_id = p_tenant_id
          AND rec.client_id IN (SELECT sc.id FROM scope AS sc)
          AND coalesce(rec.summary_scope, 'auto') IN ('auto', 'client')
          AND NOT EXISTS (
            SELECT 1 FROM public.meeting_bot_sessions AS bot
            WHERE bot.zoom_recording_id = rec.id)
        ORDER BY rec.client_id, rec.meeting_id, (rec.summary_md IS NULL), rec.id
      ) AS zoom
    ) AS m
    CROSS JOIN bounds
    WHERE m.at >= bounds.contact_since AND m.at <= now()
  ), client_groups AS (
    SELECT sc.id AS client_id, own.id AS group_id
    FROM scope AS sc
    JOIN public.whatsapp_groups AS linked ON linked.id = sc.whatsapp_group_id
    JOIN public.whatsapp_groups AS own
      ON own.group_chat_id = linked.group_chat_id AND own.tenant_id = p_tenant_id
  ), thread_messages AS (
    SELECT msg.client_id, msg.created_at, msg.direction, msg.sent_by_user_id,
      msg.connection_user_id, msg.sender_phone, msg.raw_provider_data,
      msg.group_id IS NOT NULL AS in_group
    FROM public.chat_messages AS msg
    CROSS JOIN bounds
    WHERE msg.tenant_id = p_tenant_id
      AND msg.client_id IN (SELECT sc.id FROM scope AS sc)
      AND msg.created_at >= bounds.contact_since
    UNION ALL
    SELECT cg.client_id, msg.created_at, msg.direction, msg.sent_by_user_id,
      msg.connection_user_id, msg.sender_phone, msg.raw_provider_data, true
    FROM client_groups AS cg
    JOIN public.chat_messages AS msg ON msg.group_id = cg.group_id
    CROSS JOIN bounds
    WHERE msg.tenant_id = p_tenant_id
      AND msg.created_at >= bounds.contact_since
  ), senders AS (
    SELECT tm.*,
      public.phone_match_key(CASE
        WHEN tm.raw_provider_data -> 'senderData' ->> 'sender' LIKE '%@lid' THEN lid.phone
        ELSE tm.sender_phone END) AS sender_key
    FROM thread_messages AS tm
    LEFT JOIN public.wa_lid_map AS lid
      ON tm.raw_provider_data -> 'senderData' ->> 'sender' LIKE '%@lid'
      AND lid.lid = regexp_replace(coalesce(tm.sender_phone, ''), '\D', '', 'g')
  ), staff_messages AS (
    SELECT s.client_id, max(s.created_at) AS at
    FROM senders AS s
    WHERE EXISTS (
      SELECT 1 FROM mine AS m
      WHERE m.client_id = s.client_id
        AND (
          (s.direction = 'outbound' AND (
            m.user_id = s.sent_by_user_id
            OR (m.user_id = s.connection_user_id
              AND s.raw_provider_data ->> 'typeWebhook' = 'outgoingMessageReceived')))
          OR (s.in_group AND s.direction = 'inbound'
            AND s.sender_key IN (m.campaigner_key, m.profile_key))
        ))
    GROUP BY s.client_id
  ), unlogged_calls AS (
    SELECT DISTINCT ON (ca.client_id) ca.*,
      coalesce(ca.caller_resolution IN ('extension', 'click_to_call'), false)
        AND EXISTS (
          SELECT 1 FROM public.user_roles AS ur
          WHERE ur.user_id = ca.caller_user_id AND ur.tenant_id = p_tenant_id
          UNION ALL
          SELECT 1 FROM public.tenant_users AS tu
          WHERE tu.user_id = ca.caller_user_id AND tu.tenant_id = p_tenant_id
        ) AS attributed
    FROM calls AS ca
    JOIN logs AS lg ON lg.client_id = ca.client_id
    WHERE ca.at >= p_since
      AND (lg.at IS NULL OR lg.at < ca.started_at - interval '30 minutes')
    ORDER BY ca.client_id, ca.at, ca.id
  ), unlogged_meetings AS (
    SELECT DISTINCT ON (me.client_id) me.*
    FROM meetings AS me
    JOIN logs AS lg ON lg.client_id = me.client_id
    WHERE me.at >= p_since
      AND (lg.at IS NULL OR lg.at < me.started_at - interval '30 minutes')
    ORDER BY me.client_id, me.at, me.key
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
      sm.at),
    uc.id,
    uc.at,
    uc.duration,
    uc.caller_resolution,
    CASE WHEN uc.attributed THEN uc.caller_user_id END,
    CASE WHEN uc.attributed THEN nullif(btrim(caller.full_name), '') END,
    um.id,
    um.key,
    um.source,
    um.at,
    left(um.summary, 1000)
  FROM scope AS sc
  JOIN logs AS lg ON lg.client_id = sc.id
  LEFT JOIN staff_messages AS sm ON sm.client_id = sc.id
  LEFT JOIN unlogged_calls AS uc ON uc.client_id = sc.id
  LEFT JOIN public.profiles AS caller ON caller.id = uc.caller_user_id
  LEFT JOIN unlogged_meetings AS um ON um.client_id = sc.id
  ORDER BY sc.name, sc.id
$$;

REVOKE ALL ON FUNCTION public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[], timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[], timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.get_client_contact_evidence(uuid, timestamptz, integer, uuid[], timestamptz) IS
  'Service role only: per client the tenant follows up, the last logged contact, the last contact and the oldest call and meeting not yet logged (manager round, AIO-253).';

-- ─── 3. Log a finding's contact at a staff member's request ─────────────────

-- "תעדי <code>" from p_user_id on a live contact_not_logged finding of
-- p_tenant_id. Who may: carmen_finding_may_confirm. Then, in one transaction:
-- the card entry (record_client_card_entry: carmen_confirmed, counts as
-- contact, in this person's name, idempotent on the finding), the finding
-- resolved as fixed by them, its planned messages cancelled and a 'resolved'
-- event. outcome: 'logged'; 'not_found' (no such live finding, or this
-- person may not log it: one answer, so codes cannot be probed);
-- 'read_only' (an agency shared without write access to the card).
CREATE OR REPLACE FUNCTION public.carmen_finding_confirm_contact(
  p_tenant_id uuid,
  p_finding_id uuid,
  p_user_id uuid,
  p_update_type text,
  p_content text
)
RETURNS TABLE (outcome text, entry_id uuid, inserted boolean)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_finding public.carmen_findings%ROWTYPE;
  v_client_tenant uuid;
BEGIN
  IF p_update_type IS NULL OR p_update_type NOT IN ('call', 'meeting') THEN
    RAISE EXCEPTION 'invalid_update_type' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_finding FROM public.carmen_findings AS f
  WHERE f.id = p_finding_id
    AND f.tenant_id = p_tenant_id
    AND f.kind = 'contact_not_logged'
    AND f.client_id IS NOT NULL
    AND f.status IN ('open', 'notified', 'acknowledged', 'snoozed')
  FOR UPDATE;
  IF NOT FOUND OR NOT public.carmen_finding_may_confirm(
    p_tenant_id, v_finding.client_id, v_finding.agency_id, v_finding.owner_user_id,
    coalesce(v_finding.evidence ->> 'attributed' = 'true', false), p_user_id
  ) THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::boolean;
    RETURN;
  END IF;

  SELECT c.tenant_id INTO v_client_tenant
  FROM public.clients AS c WHERE c.id = v_finding.client_id;
  IF v_client_tenant IS DISTINCT FROM p_tenant_id AND NOT EXISTS (
    SELECT 1 FROM public.agency_tenant_access AS ata
    WHERE ata.accessing_tenant_id = p_tenant_id
      AND ata.source_tenant_id = v_client_tenant
      AND ata.agency_id = v_finding.agency_id
      AND ata.access_level = 'read_write'
  ) THEN
    RETURN QUERY SELECT 'read_only'::text, NULL::uuid, NULL::boolean;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 'logged'::text, e.entry_id, e.inserted
  FROM public.record_client_card_entry(
    p_tenant_id, v_finding.client_id, p_content, p_update_type,
    'carmen_confirmed', 'finding:' || v_finding.id, p_user_id, true,
    jsonb_build_object(
      'tool', 'confirm_finding_draft',
      'finding_id', v_finding.id,
      'short_code', v_finding.short_code,
      'finding_owner_user_id', v_finding.owner_user_id,
      'confirmed_by', p_user_id)) AS e;

  UPDATE public.carmen_findings AS f
  SET status = 'resolved',
      resolution = 'fixed',
      resolved_by = p_user_id,
      resolved_at = now(),
      next_action_at = NULL
  WHERE f.id = v_finding.id;

  UPDATE public.carmen_finding_deliveries AS d
  SET status = 'cancelled'
  WHERE d.tenant_id = p_tenant_id AND d.finding_id = v_finding.id
    AND d.status = 'planned';

  INSERT INTO public.carmen_finding_events
    (tenant_id, finding_id, event, actor_user_id, note, details)
  VALUES (p_tenant_id, v_finding.id, 'resolved', p_user_id,
    left(p_content, 1000),
    jsonb_build_object('resolution', 'fixed', 'via', 'carmen_confirmed'));
END;
$$;

REVOKE ALL ON FUNCTION public.carmen_finding_confirm_contact(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_finding_confirm_contact(uuid, uuid, uuid, text, text)
  TO service_role;

-- May p_user_id log the contact of a finding of p_tenant_id? Roles count
-- only in that tenant (a role elsewhere never does), as
-- carmen_finding_viewer_role decides for the browser: an owner or agency
-- owner, a super admin acting in the tenant, a team manager of the finding's
-- agency, the person an attributed call belongs to, or, when nobody was
-- named, a campaigner of the tenant assigned to the client today (Israel
-- date).
CREATE OR REPLACE FUNCTION public.carmen_finding_may_confirm(
  p_tenant_id uuid,
  p_client_id uuid,
  p_agency_id uuid,
  p_owner_user_id uuid,
  p_attributed boolean,
  p_user_id uuid
)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH member AS (
    SELECT ur.role::text AS role
    FROM public.user_roles AS ur
    WHERE ur.user_id = p_user_id AND ur.tenant_id = p_tenant_id
    UNION ALL
    SELECT tu.role
    FROM public.tenant_users AS tu
    WHERE tu.user_id = p_user_id AND tu.tenant_id = p_tenant_id
  ), today AS (
    SELECT (now() AT TIME ZONE 'Asia/Jerusalem')::date AS d
  )
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM member WHERE role IN ('owner', 'agency_owner'))
    OR (
      public.is_super_admin(p_user_id)
      AND public.get_user_tenant_id(p_user_id) = p_tenant_id
    )
    OR (
      p_agency_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM member WHERE role = 'team_manager')
      AND EXISTS (
        SELECT 1 FROM public.user_managed_agencies AS uma
        WHERE uma.user_id = p_user_id AND uma.agency_id = p_agency_id)
    )
    OR (
      EXISTS (SELECT 1 FROM member)
      AND CASE
        WHEN p_attributed THEN p_owner_user_id IS NOT DISTINCT FROM p_user_id
        ELSE EXISTS (
          SELECT 1
          FROM public.profiles AS p
          JOIN public.client_team AS ct ON ct.campaigner_id = p.campaigner_id
          JOIN public.campaigners AS cp
            ON cp.id = ct.campaigner_id AND cp.active AND cp.tenant_id = p_tenant_id
          CROSS JOIN today
          WHERE p.id = p_user_id
            AND ct.client_id = p_client_id
            AND (ct.start_date IS NULL OR ct.start_date <= today.d)
            AND (ct.end_date IS NULL OR ct.end_date >= today.d))
      END
    )
  )
$$;

REVOKE ALL ON FUNCTION public.carmen_finding_may_confirm(uuid, uuid, uuid, uuid, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_finding_may_confirm(uuid, uuid, uuid, uuid, boolean, uuid)
  TO service_role;
