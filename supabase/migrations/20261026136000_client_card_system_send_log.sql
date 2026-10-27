-- Client card: log what AIOS sends to a client (AIO-242, plan component C5,
-- with the C4 client <-> WhatsApp group link view it needs).
--
-- Off by default. Both triggers do nothing until a tenant owner turns on
-- tenant_heartbeat_settings.pulse_alert_rules -> 'manager' ->
-- 'card_log_system_sends' (the "תיעוד אוטומטי בכרטיס הלקוח" switch in the
-- pulse alert rules dialog). Forward-only: nothing is backfilled, nothing is
-- sent, and a send is never blocked (each trigger body catches every error
-- and raises a WARNING instead). Every entry is source='system_send', which
-- get_latest_client_call_updates (AIO-232) never counts as client contact, so
-- the pulse's last-call dates and no-contact alerts do not move.
--
-- 1. chat_messages.send_kind / send_ref: what kind of system send a row is.
--    Nullable, no default, no constraint (metadata-only on this hot table).
--    The values are checked in supabase/functions/_shared/send-kind.ts:
--    chat, report, dashboard_share, meeting_summary, broadcast, carmen,
--    automation, staff_alert. A browser send that names no kind is 'chat'; a
--    service-role send that names no kind stays NULL and is never logged.
--
-- 2. report_deliveries is the ONLY logger for reports, dashboard shares and
--    meeting summaries (WhatsApp or email). AFTER INSERT, status sent/partial:
--      target_type 'meeting_summary'            -> meeting_summary_sent
--      target_type 'dashboard', no schedule_id  -> dashboard_shared
--      anything else (table, scheduled dashboard) -> report_sent
--    source_ref = the delivery id. The content is the title, the channels
--    that went out and the share link, never the report text. The person who
--    sent it (auth.uid(), or the schedule owner) is the attributed user.
--
--    Example: a manual WhatsApp + email send of table "דוח לידים"
--      INSERT INTO report_deliveries (tenant_id, client_id, target_type,
--        target_id, channels, status, details)
--      VALUES (T, C, 'table', <table>, '{whatsapp,email}', 'sent',
--        '{"share_url": "https://aios.co.il/shared/table/abc"}');
--    writes one client_updates row:
--      update_type 'report_sent', source 'system_send', source_ref <delivery>,
--      content: דוח "דוח לידים" נשלח ללקוח בוואטסאפ ובאימייל
--               קישור: https://aios.co.il/shared/table/abc
--    A 'failed' delivery, or one where no channel went out, writes nothing; a
--    'partial' one lists only the channels that succeeded and says some
--    channels failed. A meeting summary's date (details.meeting_date) follows
--    the quoted title: סיכום הפגישה "<name>" (26.10.2026) נשלח ללקוח ...
--    Table and dashboard names are read only from the sending tenant or the
--    client's tenant, so a target id from another tenant never leaks its name.
--
-- 3. chat_messages AFTER INSERT, for direction 'outbound' with send_kind
--    chat / broadcast (sent_by_user_id set) or carmen / automation, when the
--    client resolves: chat_messages.client_id, else a group linked to exactly
--    one client through client_whatsapp_group_links. report, dashboard_share,
--    meeting_summary and staff_alert are skipped, so a WhatsApp report is
--    logged once, from report_deliveries, never twice.
--      broadcast  one entry per broadcast per client,
--                 source_ref 'broadcast:<broadcast id>:<client id>',
--                 content: הדיוור "<name>" נשלח ללקוח בוואטסאפ
--                 (100 recipients of one client => still one entry)
--      carmen     one entry per message, up to 300 characters of its text,
--      automation source_ref 'carmen:<message id>' / 'automation:<message id>'
--      chat       one entry per sending tenant per client thread per Israel
--                 day, with the count and the last send time and NO message
--                 text, source_ref
--                 'chat:<tenant>:<client>:<group id or dm>:<YYYY-MM-DD>'.
--                 Three replies typed in AIOS to the client's group on
--                 26.10.2026 (Israel time) leave one entry:
--                   נשלחו ללקוח 3 הודעות וואטסאפ בקבוצה "<group>" ב-26.10.2026,
--                   האחרונה בשעה 14:32
--                 with metadata.count = 3; the first send inserts it and each
--                 later send updates the count (insert-or-update on
--                 (client_id, source, source_ref), the tenant being part of
--                 source_ref).
--    Inbound rows, service-role rows without a kind, rows with no
--    resolvable client and rows in a group linked to several clients
--    (ambiguous) write nothing. Nor does a row whose tenant may not write the
--    client's card (not its client, and no agency read_write access to it).
--    A row written with a signed-in person's token (the browser, or a sender
--    acting for that person) logs only chat, attributed to that person
--    (auth.uid()), never to the sent_by_user_id it names: broadcast, carmen
--    and automation entries come only from the server. Like every other
--    entry, a chat entry is written in the sending tenant (client_updates
--    is readable only in its own tenant): the client's tenant sees its own
--    sends on the card, an agency read_write tenant sees its own, and
--    neither sees the other's count. The group name is read only from the
--    sending tenant or the client's.
--
-- 4. client_whatsapp_group_links (C4): which client owns a WhatsApp group,
--    the union of clients.whatsapp_group_id, team_channel_whatsapp_links and
--    carmen_client_group_access. A link counts only when its tenant is the
--    group's tenant or related to it through agency_tenant_access, so another
--    tenant can neither claim a group nor make it ambiguous. Read-only,
--    service role and SECURITY DEFINER callers only; Carmen's group access
--    code never reads it.
--
-- 5. The browser may insert only human client_updates rows (AIO-232 also
--    allowed system_send for the report panel and meeting summary dialog,
--    which now record a report_deliveries row instead). Every system_send
--    entry is written by these triggers, so nobody can forge one or claim
--    its dedupe key ahead of the trigger.
--
-- 6. One chat row per Green API message. A Green API send stored by its
--    sender with send_kind carmen or automation (trigger-automation, Carmen's
--    webhook fallback, send-green-api-message) is echoed back to
--    green-api-webhook as outgoingAPIMessageReceived. The webhook skips an
--    echo whose idMessage is stored, but the two writes can cross. A BEFORE
--    INSERT trigger serialises them on (tenant, connection, idMessage):
--      the echo second  -> dropped; the webhook then mirrors the stored send
--                          to linked team channels once (team_forward);
--      the send second  -> no second row: its kind is stamped on the echo's
--                          row, and an AFTER UPDATE OF send_kind trigger logs
--                          it on the card like an insert would.
--    Browser rows are never touched, and any error stores the row as before.

-- ─── 1. chat_messages columns ───────────────────────────────────────────────

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS send_kind text,
  ADD COLUMN IF NOT EXISTS send_ref text;

COMMENT ON COLUMN public.chat_messages.send_kind IS
  'System send kind (chat, report, dashboard_share, meeting_summary, broadcast, carmen, automation, staff_alert); checked in _shared/send-kind.ts. NULL: not classified, never logged on the client card.';
COMMENT ON COLUMN public.chat_messages.send_ref IS
  'Reference for send_kind: report table, dashboard, recording, schedule or broadcast id.';

-- ─── 2. Client <-> WhatsApp group links (C4) ────────────────────────────────

-- True when a link written in p_link_tenant may speak for a group of
-- p_group_tenant: the same tenant, or tenants related by agency access.
CREATE OR REPLACE FUNCTION public.whatsapp_group_link_tenant_ok(
  p_group_tenant uuid,
  p_link_tenant uuid
)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
AS $$
  SELECT p_group_tenant = p_link_tenant
    OR EXISTS (
      SELECT 1
      FROM public.agency_tenant_access AS ata
      WHERE (ata.accessing_tenant_id = p_group_tenant
          AND ata.source_tenant_id = p_link_tenant)
        OR (ata.accessing_tenant_id = p_link_tenant
          AND ata.source_tenant_id = p_group_tenant)
    )
$$;

REVOKE ALL ON FUNCTION public.whatsapp_group_link_tenant_ok(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_group_link_tenant_ok(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_group_client_ids(p_group uuid)
RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SET search_path TO ''
AS $$
  SELECT DISTINCT links.client_id
  FROM public.whatsapp_groups AS g
  JOIN (
    SELECT c.id AS client_id, c.tenant_id
    FROM public.clients AS c
    WHERE c.whatsapp_group_id = p_group
    UNION
    SELECT l.client_id, l.tenant_id
    FROM public.team_channel_whatsapp_links AS l
    WHERE l.whatsapp_group_id = p_group
      AND l.client_id IS NOT NULL
    UNION
    SELECT a.client_id, a.tenant_id
    FROM public.carmen_client_group_access AS a
    WHERE a.whatsapp_group_id = p_group
  ) AS links
    ON public.whatsapp_group_link_tenant_ok(g.tenant_id, links.tenant_id)
  WHERE g.id = p_group
$$;

REVOKE ALL ON FUNCTION public.whatsapp_group_client_ids(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_group_client_ids(uuid)
  TO service_role;

COMMENT ON FUNCTION public.whatsapp_group_client_ids(uuid) IS
  'Distinct clients linked to a WhatsApp group through clients.whatsapp_group_id, team_channel_whatsapp_links or carmen_client_group_access, counting only links from the group''s tenant or a tenant related to it by agency access.';

-- The one client a group belongs to; NULL when none or several (ambiguous).
CREATE OR REPLACE FUNCTION public.resolve_whatsapp_group_client(p_group uuid)
RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path TO ''
AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(ids.client_id))[1] END
  FROM public.whatsapp_group_client_ids(p_group) AS ids(client_id)
$$;

REVOKE ALL ON FUNCTION public.resolve_whatsapp_group_client(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_group_client(uuid)
  TO service_role;

COMMENT ON FUNCTION public.resolve_whatsapp_group_client(uuid) IS
  'The single client linked to a WhatsApp group, or NULL when the group has no link or is linked to more than one client.';

CREATE OR REPLACE VIEW public.client_whatsapp_group_links
WITH (security_invoker = true) AS
SELECT
  links.tenant_id,
  links.client_id,
  links.group_id,
  g.group_chat_id,
  links.source,
  (
    SELECT count(*)
    FROM public.whatsapp_group_client_ids(links.group_id)
  ) > 1 AS is_ambiguous
FROM (
  SELECT
    c.tenant_id,
    c.id AS client_id,
    c.whatsapp_group_id AS group_id,
    'clients.whatsapp_group_id'::text AS source
  FROM public.clients AS c
  WHERE c.whatsapp_group_id IS NOT NULL
  UNION ALL
  SELECT
    l.tenant_id,
    l.client_id,
    l.whatsapp_group_id,
    'team_channel_whatsapp_links'::text
  FROM public.team_channel_whatsapp_links AS l
  WHERE l.client_id IS NOT NULL
    AND l.whatsapp_group_id IS NOT NULL
  UNION ALL
  SELECT
    a.tenant_id,
    a.client_id,
    a.whatsapp_group_id,
    'carmen_client_group_access'::text
  FROM public.carmen_client_group_access AS a
) AS links
JOIN public.whatsapp_groups AS g
  ON g.id = links.group_id
  AND public.whatsapp_group_link_tenant_ok(g.tenant_id, links.tenant_id);

REVOKE ALL ON public.client_whatsapp_group_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.client_whatsapp_group_links TO service_role;

COMMENT ON VIEW public.client_whatsapp_group_links IS
  'Which client owns a WhatsApp group (one row per link source). is_ambiguous: the group is linked to more than one client; consumers skip it for card writes and alerts. Read-only; never used for Carmen group access.';

-- ─── 3. Tenant switch ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.client_card_logs_system_sends(p_tenant uuid)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
AS $$
  SELECT coalesce(
    bool_or(
      (s.pulse_alert_rules #> '{manager,card_log_system_sends}') = 'true'::jsonb
    ),
    false
  )
  FROM public.tenant_heartbeat_settings AS s
  WHERE s.tenant_id = p_tenant
$$;

REVOKE ALL ON FUNCTION public.client_card_logs_system_sends(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_card_logs_system_sends(uuid)
  TO service_role;

COMMENT ON FUNCTION public.client_card_logs_system_sends(uuid) IS
  'True when the tenant turned on pulse_alert_rules.manager.card_log_system_sends (default false).';

-- A profile id for attribution, or NULL (record_client_card_entry rejects an
-- attributed user without a profile).
CREATE OR REPLACE FUNCTION public.client_card_profile_or_null(p_user uuid)
RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path TO ''
AS $$
  SELECT p.id FROM public.profiles AS p WHERE p.id = p_user
$$;

REVOKE ALL ON FUNCTION public.client_card_profile_or_null(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_card_profile_or_null(uuid)
  TO service_role;

-- ─── 4. report_deliveries -> client card ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_report_delivery_on_client_card()
RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_update_type text;
  v_label text;
  v_title text;
  v_meeting_date text;
  v_client_tenant uuid;
  v_channels text[];
  v_channel_words text[] := ARRAY[]::text[];
  v_channel text;
  v_link text;
  v_content text;
  v_actor uuid;
BEGIN
  BEGIN
    IF NEW.status NOT IN ('sent', 'partial') THEN
      RETURN NULL;
    END IF;
    IF NOT public.client_card_logs_system_sends(NEW.tenant_id) THEN
      RETURN NULL;
    END IF;

    v_update_type := CASE
      WHEN NEW.target_type = 'meeting_summary' THEN 'meeting_summary_sent'
      WHEN NEW.target_type = 'dashboard' AND NEW.schedule_id IS NULL THEN 'dashboard_shared'
      ELSE 'report_sent'
    END;
    v_label := CASE v_update_type
      WHEN 'meeting_summary_sent' THEN 'סיכום הפגישה'
      WHEN 'dashboard_shared' THEN 'דשבורד'
      ELSE 'דוח'
    END;

    -- Names come only from the sending tenant or the client's tenant: the
    -- target id is the caller's, and another tenant's name must not leak.
    SELECT c.tenant_id INTO v_client_tenant
    FROM public.clients AS c
    WHERE c.id = NEW.client_id;
    v_title := nullif(btrim(NEW.details ->> 'title'), '');
    IF v_title IS NULL AND NEW.target_type = 'table' THEN
      SELECT t.name INTO v_title
      FROM public.crm_tables AS t
      WHERE t.id = NEW.target_id
        AND t.tenant_id IN (NEW.tenant_id, v_client_tenant);
    ELSIF v_title IS NULL AND NEW.target_type = 'dashboard' THEN
      SELECT d.name INTO v_title
      FROM public.crm_dashboards AS d
      WHERE d.id = NEW.target_id
        AND d.tenant_id IN (NEW.tenant_id, v_client_tenant);
    END IF;
    v_meeting_date := nullif(btrim(NEW.details ->> 'meeting_date'), '');

    -- The channels that went out: per-channel results when the sender
    -- recorded them (scheduled-report-worker), else the requested channels.
    IF jsonb_typeof(NEW.details -> 'channels') = 'object' THEN
      SELECT coalesce(array_agg(ch.key ORDER BY ch.key DESC), ARRAY[]::text[])
      INTO v_channels
      FROM jsonb_each(NEW.details -> 'channels') AS ch
      WHERE ch.value ->> 'ok' = 'true';
    ELSE
      v_channels := coalesce(NEW.channels, ARRAY[]::text[]);
    END IF;
    -- Nothing went out (e.g. a schedule with no channel): nothing to log.
    IF cardinality(v_channels) = 0 THEN
      RETURN NULL;
    END IF;
    FOREACH v_channel IN ARRAY v_channels LOOP
      IF v_channel = 'whatsapp' THEN
        v_channel_words := array_append(v_channel_words, 'בוואטסאפ');
      ELSIF v_channel = 'email' THEN
        v_channel_words := array_append(v_channel_words, 'באימייל');
      END IF;
    END LOOP;

    v_link := nullif(btrim(NEW.details ->> 'share_url'), '');

    v_content := v_label
      || CASE WHEN v_title IS NOT NULL THEN ' "' || v_title || '"' ELSE '' END
      || CASE WHEN v_meeting_date IS NOT NULL THEN ' (' || v_meeting_date || ')' ELSE '' END
      || ' נשלח ללקוח'
      || CASE
           WHEN cardinality(v_channel_words) > 0
             THEN ' ' || array_to_string(v_channel_words, ' ו')
           ELSE ''
         END
      || CASE WHEN NEW.schedule_id IS NOT NULL THEN ' (שליחה מתוזמנת)' ELSE '' END
      || CASE WHEN NEW.status = 'partial' THEN '. חלק מהערוצים נכשלו' ELSE '' END
      || CASE WHEN v_link IS NOT NULL THEN E'\nקישור: ' || v_link ELSE '' END;

    -- Who sent it: the signed-in person, else the schedule owner.
    v_actor := public.client_card_profile_or_null(auth.uid());
    IF v_actor IS NULL AND NEW.schedule_id IS NOT NULL THEN
      SELECT public.client_card_profile_or_null(s.created_by)
      INTO v_actor
      FROM public.report_schedules AS s
      WHERE s.id = NEW.schedule_id
        AND s.tenant_id = NEW.tenant_id;
    END IF;

    PERFORM public.record_client_card_entry(
      p_tenant => NEW.tenant_id,
      p_client => NEW.client_id,
      p_content => v_content,
      p_update_type => v_update_type,
      p_source => 'system_send',
      p_source_ref => NEW.id::text,
      p_attributed_user => v_actor,
      p_counts_as_contact => NULL,
      p_metadata => jsonb_strip_nulls(jsonb_build_object(
        'report_delivery_id', NEW.id,
        'target_type', NEW.target_type,
        'target_id', NEW.target_id,
        'schedule_id', NEW.schedule_id,
        'channels', to_jsonb(v_channels),
        'status', NEW.status,
        'share_url', v_link
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log_report_delivery_on_client_card: delivery % not logged: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_report_delivery_on_client_card()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS report_deliveries_log_on_client_card ON public.report_deliveries;
CREATE TRIGGER report_deliveries_log_on_client_card
  AFTER INSERT ON public.report_deliveries
  FOR EACH ROW
  WHEN (NEW.status IN ('sent', 'partial'))
  EXECUTE FUNCTION public.log_report_delivery_on_client_card();

-- ─── 5. chat_messages -> client card ────────────────────────────────────────

-- lock_timeout: a send waits at most 2 seconds for today's chat entry; a
-- lock timeout is caught below like any other error, so the send goes
-- through and only that one count is lost.
CREATE OR REPLACE FUNCTION public.log_system_send_on_client_card()
RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  SET lock_timeout TO '2s'
AS $$
DECLARE
  v_kind text := NEW.send_kind;
  v_role text;
  v_sender uuid;
  v_client uuid := NEW.client_id;
  v_client_tenant uuid;
  v_client_agency uuid;
  v_sent_at timestamptz := coalesce(NEW.created_at, now());
  v_day date;
  v_where text := '';
  v_group_name text;
  v_actor uuid;
  v_ref text;
  v_content text;
  v_text text;
  v_name text;
  v_entry_id uuid;
  v_inserted boolean;
  v_meta jsonb;
  v_count integer;
  v_last timestamptz;
BEGIN
  BEGIN
    IF NEW.direction IS DISTINCT FROM 'outbound'
      OR v_kind IS NULL
      OR v_kind NOT IN ('chat', 'broadcast', 'carmen', 'automation') THEN
      RETURN NULL;
    END IF;
    -- Who wrote the row. A signed-in person's token (the browser, or a sender
    -- acting for that person) may log only chat, as that person; broadcast,
    -- carmen and automation entries come only from the server.
    v_role := coalesce(auth.jwt() ->> 'role', auth.role(), '');
    IF v_role IN ('authenticated', 'anon') THEN
      IF v_kind <> 'chat' THEN
        RETURN NULL;
      END IF;
      v_sender := auth.uid();
    ELSE
      v_sender := NEW.sent_by_user_id;
    END IF;
    IF v_sender IS NULL AND v_kind NOT IN ('carmen', 'automation') THEN
      RETURN NULL;
    END IF;
    IF NOT public.client_card_logs_system_sends(NEW.tenant_id) THEN
      RETURN NULL;
    END IF;

    IF v_client IS NULL AND NEW.group_id IS NOT NULL THEN
      v_client := public.resolve_whatsapp_group_client(NEW.group_id);
    END IF;
    IF v_client IS NULL THEN
      RETURN NULL;
    END IF;

    -- The sending tenant must be allowed to write this client's card: its
    -- own client, or an agency client it has read_write access to. Same rule
    -- as record_client_card_entry, checked here because a later chat send
    -- only updates today's entry.
    SELECT c.tenant_id, c.agency_id
    INTO v_client_tenant, v_client_agency
    FROM public.clients AS c
    WHERE c.id = v_client;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    IF v_client_tenant IS DISTINCT FROM NEW.tenant_id AND NOT EXISTS (
      SELECT 1
      FROM public.agency_tenant_access AS ata
      WHERE ata.accessing_tenant_id = NEW.tenant_id
        AND ata.source_tenant_id = v_client_tenant
        AND ata.agency_id = v_client_agency
        AND ata.access_level = 'read_write'
    ) THEN
      RETURN NULL;
    END IF;

    IF NEW.group_id IS NOT NULL THEN
      -- Only a group of the sending tenant or the client's tenant is named.
      SELECT nullif(btrim(g.group_name), '') INTO v_group_name
      FROM public.whatsapp_groups AS g
      WHERE g.id = NEW.group_id
        AND g.tenant_id IN (NEW.tenant_id, v_client_tenant);
      v_where := CASE
        WHEN v_group_name IS NOT NULL THEN ' בקבוצה "' || v_group_name || '"'
        ELSE ' בקבוצת הלקוח'
      END;
    END IF;

    v_actor := public.client_card_profile_or_null(v_sender);

    IF v_kind = 'broadcast' THEN
      IF NEW.send_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT nullif(btrim(b.name), '') INTO v_name
        FROM public.broadcasts AS b
        WHERE b.id = NEW.send_ref::uuid
          AND b.tenant_id = NEW.tenant_id;
      END IF;
      v_ref := CASE
        WHEN NEW.send_ref IS NOT NULL THEN 'broadcast:' || NEW.send_ref || ':' || v_client::text
        ELSE 'broadcast:message:' || NEW.id::text
      END;
      v_content := CASE
        WHEN v_name IS NOT NULL THEN 'הדיוור "' || v_name || '" נשלח ללקוח בוואטסאפ'
        ELSE 'דיוור נשלח ללקוח בוואטסאפ'
      END || v_where;
      PERFORM public.record_client_card_entry(
        p_tenant => NEW.tenant_id,
        p_client => v_client,
        p_content => v_content,
        p_update_type => 'broadcast_sent',
        p_source => 'system_send',
        p_source_ref => v_ref,
        p_attributed_user => v_actor,
        p_counts_as_contact => NULL,
        p_metadata => jsonb_strip_nulls(jsonb_build_object(
          'send_kind', v_kind,
          'broadcast_id', NEW.send_ref,
          'chat_message_id', NEW.id,
          'group_id', NEW.group_id
        ))
      );
      RETURN NULL;
    END IF;

    IF v_kind IN ('carmen', 'automation') THEN
      v_text := btrim(coalesce(NEW.message_text, ''));
      IF char_length(v_text) > 300 THEN
        v_text := left(v_text, 300) || '…';
      END IF;
      v_content := CASE v_kind
          WHEN 'carmen' THEN 'כרמן שלחה ללקוח הודעת וואטסאפ'
          ELSE 'אוטומציה שלחה ללקוח הודעת וואטסאפ'
        END
        || v_where
        || CASE WHEN v_text <> '' THEN E':\n' || v_text ELSE '' END;
      PERFORM public.record_client_card_entry(
        p_tenant => NEW.tenant_id,
        p_client => v_client,
        p_content => v_content,
        p_update_type => CASE v_kind WHEN 'carmen' THEN 'carmen_message' ELSE 'automation_message' END,
        p_source => 'system_send',
        p_source_ref => v_kind || ':' || NEW.id::text,
        p_attributed_user => v_actor,
        p_counts_as_contact => NULL,
        p_metadata => jsonb_strip_nulls(jsonb_build_object(
          'send_kind', v_kind,
          'send_ref', NEW.send_ref,
          'chat_message_id', NEW.id,
          'group_id', NEW.group_id
        ))
      );
      RETURN NULL;
    END IF;

    -- chat: one entry per sending tenant per client thread per Israel day,
    -- no message text. The entry lives in the sending tenant, like every
    -- other entry: client_updates is readable only in its own tenant, so the
    -- client's tenant and an agency tenant each count their own sends on an
    -- entry they can see, and neither sees the other's.
    v_day := (v_sent_at AT TIME ZONE 'Asia/Jerusalem')::date;
    v_ref := 'chat:' || NEW.tenant_id::text || ':' || v_client::text || ':'
      || coalesce(NEW.group_id::text, 'dm') || ':'
      || to_char(v_day, 'YYYY-MM-DD');

    SELECT u.id, coalesce(u.metadata, '{}'::jsonb)
    INTO v_entry_id, v_meta
    FROM public.client_updates AS u
    WHERE u.client_id = v_client
      AND u.tenant_id = NEW.tenant_id
      AND u.source = 'system_send'
      AND u.source_ref = v_ref
    FOR UPDATE;

    IF v_entry_id IS NULL THEN
      SELECT r.entry_id, r.inserted
      INTO v_entry_id, v_inserted
      FROM public.record_client_card_entry(
        p_tenant => NEW.tenant_id,
        p_client => v_client,
        p_content => 'נשלחה ללקוח הודעת וואטסאפ אחת'
          || coalesce(nullif(v_where, ''), ' בצ׳אט הפרטי')
          || ' ב-' || to_char(v_day, 'DD.MM.YYYY')
          || ', בשעה ' || to_char(v_sent_at AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI'),
        p_update_type => 'whatsapp_sent',
        p_source => 'system_send',
        p_source_ref => v_ref,
        p_attributed_user => v_actor,
        p_counts_as_contact => NULL,
        p_metadata => jsonb_strip_nulls(jsonb_build_object(
          'send_kind', v_kind,
          'thread', coalesce(NEW.group_id::text, 'dm'),
          'group_id', NEW.group_id,
          'israel_date', to_char(v_day, 'YYYY-MM-DD'),
          'count', 1,
          'first_sent_at', v_sent_at,
          'last_sent_at', v_sent_at,
          'last_message_id', NEW.id
        ))
      ) AS r;
      IF v_inserted THEN
        RETURN NULL;
      END IF;
      -- Another send won the race for today's entry: count this one on it.
      SELECT u.id, coalesce(u.metadata, '{}'::jsonb)
      INTO v_entry_id, v_meta
      FROM public.client_updates AS u
      WHERE u.client_id = v_client
        AND u.tenant_id = NEW.tenant_id
        AND u.source = 'system_send'
        AND u.source_ref = v_ref
      FOR UPDATE;
      IF v_entry_id IS NULL THEN
        RETURN NULL;
      END IF;
    END IF;

    v_count := CASE
        WHEN (v_meta ->> 'count') ~ '^[0-9]{1,9}$' THEN (v_meta ->> 'count')::integer
        ELSE 1
      END + 1;
    v_last := greatest(coalesce((v_meta ->> 'last_sent_at')::timestamptz, v_sent_at), v_sent_at);
    UPDATE public.client_updates AS u
    SET
      content = 'נשלחו ללקוח ' || v_count::text || ' הודעות וואטסאפ'
        || coalesce(nullif(v_where, ''), ' בצ׳אט הפרטי')
        || ' ב-' || to_char(v_day, 'DD.MM.YYYY')
        || ', האחרונה בשעה ' || to_char(v_last AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI'),
      metadata = v_meta || jsonb_build_object(
        'count', v_count,
        'last_sent_at', v_last,
        'last_message_id', NEW.id
      ),
      updated_at = now()
    WHERE u.id = v_entry_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log_system_send_on_client_card: message % not logged: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_system_send_on_client_card()
  FROM PUBLIC, anon, authenticated;

-- The WHEN clause keeps inbound traffic and unclassified sends out of the
-- function entirely.
DROP TRIGGER IF EXISTS chat_messages_log_system_send ON public.chat_messages;
CREATE TRIGGER chat_messages_log_system_send
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  WHEN (
    NEW.direction = 'outbound'
    AND NEW.send_kind IN ('chat', 'broadcast', 'carmen', 'automation')
  )
  EXECUTE FUNCTION public.log_system_send_on_client_card();

-- A send whose kind is stamped on the row its Green API echo stored first
-- (merge_green_api_send_echo below) is logged like an insert. A browser
-- token may set send_kind on its tenant's rows, but the function logs only
-- server kinds from the server, and chat is not in this clause.
DROP TRIGGER IF EXISTS chat_messages_log_stamped_send ON public.chat_messages;
CREATE TRIGGER chat_messages_log_stamped_send
  AFTER UPDATE OF send_kind ON public.chat_messages
  FOR EACH ROW
  WHEN (
    OLD.send_kind IS NULL
    AND NEW.direction = 'outbound'
    AND NEW.send_kind IN ('carmen', 'automation')
  )
  EXECUTE FUNCTION public.log_system_send_on_client_card();

-- ─── 6. One chat row per Green API message ──────────────────────────────────

-- Both writes of one Green API message (the sender's stamped row and the
-- webhook's outgoingAPIMessageReceived echo) take the same transaction lock
-- on (tenant, connection, idMessage), so whichever comes second sees the
-- first. The echo second is dropped (the webhook already skips an echo it
-- finds stored; this closes the gap between its check and its insert). The
-- send second stamps its kind on the echo's row instead of adding a second
-- row; that row was mirrored to team channels by the webhook, so it carries
-- no team_forward. Browser rows are never touched, and any error (a lock
-- wait over 2 seconds included) stores the row as before.
CREATE OR REPLACE FUNCTION public.merge_green_api_send_echo()
RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  SET lock_timeout TO '2s'
AS $$
DECLARE
  v_message_id text := nullif(btrim(NEW.raw_provider_data ->> 'idMessage'), '');
  v_existing public.chat_messages%ROWTYPE;
BEGIN
  IF v_message_id IS NULL
    OR coalesce(auth.jwt() ->> 'role', auth.role(), '') IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'chat_messages:green_api:' || NEW.tenant_id::text || ':'
        || coalesce(NEW.connection_user_id::text, '') || ':' || v_message_id,
      0
    ));
    SELECT m.* INTO v_existing
    FROM public.chat_messages AS m
    WHERE m.tenant_id = NEW.tenant_id
      AND m.connection_user_id IS NOT DISTINCT FROM NEW.connection_user_id
      AND m.raw_provider_data ->> 'idMessage' = v_message_id
    ORDER BY m.created_at, m.id
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    IF NEW.send_kind IN ('carmen', 'automation') AND v_existing.send_kind IS NULL THEN
      UPDATE public.chat_messages AS m
      SET
        send_kind = NEW.send_kind,
        send_ref = NEW.send_ref,
        client_id = CASE
            WHEN m.client_id IS NULL AND m.lead_id IS NULL AND m.group_id IS NULL
              THEN NEW.client_id
            ELSE m.client_id
          END,
        sent_by_user_id = coalesce(m.sent_by_user_id, NEW.sent_by_user_id),
        integration_id = coalesce(m.integration_id, NEW.integration_id),
        raw_provider_data = coalesce(m.raw_provider_data, '{}'::jsonb)
          || jsonb_build_object(NEW.send_kind, true)
      WHERE m.id = v_existing.id;
    END IF;
    RETURN NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'merge_green_api_send_echo: message % stored without merging: % (%)',
      v_message_id, SQLERRM, SQLSTATE;
    RETURN NEW;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_green_api_send_echo()
  FROM PUBLIC, anon, authenticated;

-- Only Green API echoes and the stamped sends they can duplicate enter the
-- function; every other insert skips it.
DROP TRIGGER IF EXISTS chat_messages_merge_green_api_send_echo ON public.chat_messages;
CREATE TRIGGER chat_messages_merge_green_api_send_echo
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW
  WHEN (
    NEW.provider = 'green_api'
    AND NEW.direction = 'outbound'
    AND (
      NEW.raw_provider_data ->> 'typeWebhook' = 'outgoingAPIMessageReceived'
      OR NEW.send_kind IN ('carmen', 'automation')
    )
  )
  EXECUTE FUNCTION public.merge_green_api_send_echo();

-- ─── 7. Browser inserts: human rows only ────────────────────────────────────

-- AIO-232 let the browser insert system_send rows for the report panel and
-- the meeting summary dialog; both now record a report_deliveries row and the
-- triggers above write the entry. A browser system_send row could only forge
-- an entry or claim a trigger's dedupe key ahead of it.
DROP POLICY IF EXISTS "Users can create client updates in their tenant" ON public.client_updates;
CREATE POLICY "Users can create client updates in their tenant"
  ON public.client_updates
  FOR INSERT
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      tenant_id = public.get_user_tenant_id(auth.uid())
      AND source = 'human'
    )
  );
