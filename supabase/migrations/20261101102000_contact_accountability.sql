-- Contact accountability for Carmen's manager round (AIO-253, plan component
-- C19): who made a call, the contact evidence per client, and logging a
-- finding's contact on a staff member's "תעדי <code>". Sends nothing.

-- ─── 1. call_logs.caller_resolution ─────────────────────────────────────────

-- How caller_user_id was chosen; only 'extension' and 'click_to_call' name
-- the person who spoke, so nobody is held to a call they did not make.
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

-- Per client the tenant follows up: its last logged contact, its last contact
-- and its oldest call and meeting no log covers (no message text).
CREATE OR REPLACE FUNCTION public.get_client_contact_evidence(
  p_tenant_id uuid,
  p_since timestamptz,
  p_min_call_seconds integer,
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
      least(coalesce(p_contact_since, p_since), p_since) AS contact_since,
      -- A log written up to this long before a call or meeting started covers it.
      interval '30 minutes' AS log_lead
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
    -- Active clients whose card the tenant may write (tenant_can_write_client,
    -- as record_client_card_entry requires) and one of its campaigners is on
    -- today, plus its own clients nobody is on; a client staffed only by
    -- another tenant is that tenant's.
    SELECT c.id, c.name, c.agency_id, c.whatsapp_group_id,
      greatest(c.created_at, c.start_date::timestamp AT TIME ZONE 'Asia/Jerusalem') AS since
    FROM public.clients AS c
    WHERE c.status = 'active'
      AND (p_client_ids IS NULL OR c.id = ANY (p_client_ids))
      -- Cheap pre-filter: own clients and agencies shared with the tenant.
      AND (c.tenant_id = p_tenant_id OR c.agency_id IN (
        SELECT ata.agency_id FROM public.agency_tenant_access AS ata
        WHERE ata.accessing_tenant_id = p_tenant_id))
      AND (
        (
          public.tenant_can_write_client(p_tenant_id, c.id)
          AND EXISTS (SELECT 1 FROM mine AS m WHERE m.client_id = c.id)
        )
        OR (
          c.tenant_id = p_tenant_id
          AND NOT EXISTS (SELECT 1 FROM assigned AS a WHERE a.client_id = c.id)
        )
      )
  ), logs AS (
    -- The pulse's own counting rule, plus logged meetings, which it does not
    -- count as a call.
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
    -- The PBX reports a call when it ends, so it started duration earlier.
    SELECT cl.client_id, cl.id, cl.created_at AS at,
      cl.created_at - make_interval(secs => coalesce(cl.duration, 0)) AS started_at,
      cl.duration, cl.caller_user_id, cl.caller_resolution
    FROM public.call_logs AS cl
    CROSS JOIN bounds
    WHERE cl.tenant_id = p_tenant_id
      AND cl.client_id IN (SELECT sc.id FROM scope AS sc)
      AND cl.status = 'completed'
      AND coalesce(cl.duration, 0) >= greatest(p_min_call_seconds, 1)
      AND cl.created_at >= bounds.contact_since
  ), meetings AS (
    -- Client meetings only (summary_scope campaigner, agency and lead are
    -- not client contact); a Zoom meeting's files count once, the one with
    -- the summary first, so its key stays the same across runs.
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
    -- The tenant's own copy of the client's group (same group_chat_id), from
    -- clients.whatsapp_group_id only; reading AIO-242's group links and the
    -- staff roster is AIO-253 phase 2.
    SELECT sc.id AS client_id, own.id AS group_id
    FROM scope AS sc
    JOIN public.whatsapp_groups AS linked ON linked.id = sc.whatsapp_group_id
    JOIN public.whatsapp_groups AS own
      ON own.group_chat_id = linked.group_chat_id AND own.tenant_id = p_tenant_id
  ), thread_messages AS (
    -- Uses chat_messages (client_id)/(group_id); a Staging plan check of this
    -- read is AIO-253 phase 2.
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
    -- A group sender seen as an @lid is mapped to a phone through wa_lid_map.
    SELECT tm.*,
      public.phone_match_key(CASE
        WHEN tm.raw_provider_data -> 'senderData' ->> 'sender' LIKE '%@lid' THEN lid.phone
        ELSE tm.sender_phone END) AS sender_key
    FROM thread_messages AS tm
    LEFT JOIN public.wa_lid_map AS lid
      ON tm.raw_provider_data -> 'senderData' ->> 'sender' LIKE '%@lid'
      AND lid.lid = regexp_replace(coalesce(tm.sender_phone, ''), '\D', '', 'g')
  ), staff_messages AS (
    -- Written by one of the client's campaigners in this tenant: sent from
    -- AIOS, typed on their own connected phone, or in the group from their phone.
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
    -- The caller is named only for an attributed call by a member of the tenant.
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
    CROSS JOIN bounds
    WHERE ca.at >= p_since
      AND (lg.at IS NULL OR lg.at < ca.started_at - bounds.log_lead)
    ORDER BY ca.client_id, ca.at, ca.id
  ), unlogged_meetings AS (
    SELECT DISTINCT ON (me.client_id) me.*
    FROM meetings AS me
    JOIN logs AS lg ON lg.client_id = me.client_id
    CROSS JOIN bounds
    WHERE me.at >= p_since
      AND (lg.at IS NULL OR lg.at < me.started_at - bounds.log_lead)
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

-- Logs a live contact_not_logged finding's contact in p_user_id's name and
-- resolves the finding, in one transaction: 'logged', 'not_found' or 'read_only'.
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
  v_entry_id uuid;
  v_inserted boolean;
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
  -- One answer for a missing finding and a person who may not log it, so
  -- codes cannot be probed.
  IF NOT FOUND OR NOT public.carmen_finding_may_confirm(
    p_tenant_id, v_finding.client_id, v_finding.agency_id, v_finding.owner_user_id,
    coalesce(v_finding.evidence ->> 'attributed' = 'true', false), p_user_id
  ) THEN
    RAISE NOTICE 'carmen_finding_confirm_contact: tenant %, finding %, user %: not_found',
      p_tenant_id, p_finding_id, p_user_id;
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::boolean;
    RETURN;
  END IF;

  BEGIN
    SELECT e.entry_id, e.inserted INTO v_entry_id, v_inserted
    FROM public.record_client_card_entry(
      p_tenant_id, v_finding.client_id, p_content, p_update_type,
      'carmen_confirmed', 'finding:' || v_finding.id, p_user_id, true,
      jsonb_build_object(
        'tool', 'confirm_finding_draft',
        'finding_id', v_finding.id,
        'short_code', v_finding.short_code,
        'finding_owner_user_id', v_finding.owner_user_id,
        'confirmed_by', p_user_id)) AS e;
  EXCEPTION WHEN insufficient_privilege THEN
    -- record_client_card_entry decides card write access (42501): the
    -- client's agency is shared read-only, or no longer with this tenant.
    RAISE NOTICE 'carmen_finding_confirm_contact: tenant %, finding %, user %: read_only',
      p_tenant_id, p_finding_id, p_user_id;
    RETURN QUERY SELECT 'read_only'::text, NULL::uuid, NULL::boolean;
    RETURN;
  END;

  UPDATE public.carmen_findings AS f
  SET status = 'resolved',
      resolution = 'fixed',
      resolved_by = p_user_id,
      resolved_at = now(),
      next_action_at = NULL
  WHERE f.tenant_id = p_tenant_id AND f.id = v_finding.id;

  UPDATE public.carmen_finding_deliveries AS d
  SET status = 'cancelled'
  WHERE d.tenant_id = p_tenant_id AND d.finding_id = v_finding.id
    AND d.status = 'planned';

  INSERT INTO public.carmen_finding_events
    (tenant_id, finding_id, event, actor_user_id, note, details)
  VALUES (p_tenant_id, v_finding.id, 'resolved', p_user_id,
    left(p_content, 1000),
    jsonb_build_object('resolution', 'fixed', 'via', 'carmen_confirmed'));

  RETURN QUERY SELECT 'logged'::text, v_entry_id, v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.carmen_finding_confirm_contact(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_finding_confirm_contact(uuid, uuid, uuid, text, text)
  TO service_role;

-- May p_user_id log the contact of a finding of p_tenant_id? Roles count only
-- in that tenant. One role reader with carmen_finding_viewer_role: AIO-275.
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
    -- An owner or agency owner of the tenant, or a super admin acting in it.
    EXISTS (SELECT 1 FROM member WHERE role IN ('owner', 'agency_owner'))
    OR (
      public.is_super_admin(p_user_id)
      AND public.get_user_tenant_id(p_user_id) = p_tenant_id
    )
    -- A team manager of the finding's agency.
    OR (
      p_agency_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM member WHERE role = 'team_manager')
      AND EXISTS (
        SELECT 1 FROM public.user_managed_agencies AS uma
        WHERE uma.user_id = p_user_id AND uma.agency_id = p_agency_id)
    )
    -- The person an attributed call belongs to; when nobody was named, a
    -- campaigner of the tenant on the client today (Israel date).
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
