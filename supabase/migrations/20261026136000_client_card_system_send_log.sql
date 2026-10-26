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
--    A 'failed' delivery writes nothing; a 'partial' one lists only the
--    channels that succeeded and says some channels failed.
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
--      chat       one entry per client thread per Israel day, with the count
--                 and the last send time and NO message text,
--                 source_ref 'chat:<client>:<group id or dm>:<YYYY-MM-DD>'.
--                 Three replies typed in AIOS to the client's group on
--                 26.10.2026 (Israel time) leave one entry:
--                   נשלחו ללקוח 3 הודעות וואטסאפ בקבוצה "<group>" ב-26.10.2026,
--                   האחרונה בשעה 14:32
--                 with metadata.count = 3; the first send inserts it and each
--                 later send updates the count (insert-or-update on
--                 (client_id, source, source_ref)).
--    Inbound rows, service-role rows without a kind, rows with no
--    resolvable client and rows in a group linked to several clients
--    (ambiguous) write nothing.
--
-- 4. client_whatsapp_group_links (C4): which client owns a WhatsApp group,
--    the union of clients.whatsapp_group_id, team_channel_whatsapp_links and
--    carmen_client_group_access. Read-only, service role and SECURITY DEFINER
--    callers only; Carmen's group access code never reads it.

-- ─── 1. chat_messages columns ───────────────────────────────────────────────

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS send_kind text,
  ADD COLUMN IF NOT EXISTS send_ref text;

COMMENT ON COLUMN public.chat_messages.send_kind IS
  'System send kind (chat, report, dashboard_share, meeting_summary, broadcast, carmen, automation, staff_alert); checked in _shared/send-kind.ts. NULL: not classified, never logged on the client card.';
COMMENT ON COLUMN public.chat_messages.send_ref IS
  'Reference for send_kind: report table, dashboard, recording, schedule or broadcast id.';

-- ─── 2. Client <-> WhatsApp group links (C4) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.whatsapp_group_client_ids(p_group uuid)
RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SET search_path TO ''
AS $$
  SELECT c.id
  FROM public.clients AS c
  WHERE c.whatsapp_group_id = p_group
  UNION
  SELECT l.client_id
  FROM public.team_channel_whatsapp_links AS l
  WHERE l.whatsapp_group_id = p_group
    AND l.client_id IS NOT NULL
  UNION
  SELECT a.client_id
  FROM public.carmen_client_group_access AS a
  WHERE a.whatsapp_group_id = p_group
$$;

REVOKE ALL ON FUNCTION public.whatsapp_group_client_ids(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_group_client_ids(uuid)
  TO service_role;

COMMENT ON FUNCTION public.whatsapp_group_client_ids(uuid) IS
  'Distinct clients linked to a WhatsApp group through clients.whatsapp_group_id, team_channel_whatsapp_links or carmen_client_group_access.';

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
JOIN public.whatsapp_groups AS g ON g.id = links.group_id;

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

    v_title := nullif(btrim(NEW.details ->> 'title'), '');
    IF v_title IS NULL AND NEW.target_type = 'table' THEN
      SELECT t.name INTO v_title FROM public.crm_tables AS t WHERE t.id = NEW.target_id;
    ELSIF v_title IS NULL AND NEW.target_type = 'dashboard' THEN
      SELECT d.name INTO v_title FROM public.crm_dashboards AS d WHERE d.id = NEW.target_id;
    END IF;

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
      WHERE s.id = NEW.schedule_id;
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

CREATE OR REPLACE FUNCTION public.log_system_send_on_client_card()
RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_kind text := NEW.send_kind;
  v_client uuid := NEW.client_id;
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
    IF NEW.sent_by_user_id IS NULL AND v_kind NOT IN ('carmen', 'automation') THEN
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

    IF NEW.group_id IS NOT NULL THEN
      SELECT nullif(btrim(g.group_name), '') INTO v_group_name
      FROM public.whatsapp_groups AS g
      WHERE g.id = NEW.group_id;
      v_where := CASE
        WHEN v_group_name IS NOT NULL THEN ' בקבוצה "' || v_group_name || '"'
        ELSE ' בקבוצת הלקוח'
      END;
    END IF;

    v_actor := public.client_card_profile_or_null(NEW.sent_by_user_id);

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

    -- chat: one entry per client thread per Israel day, no message text.
    v_day := (v_sent_at AT TIME ZONE 'Asia/Jerusalem')::date;
    v_ref := 'chat:' || v_client::text || ':'
      || coalesce(NEW.group_id::text, 'dm') || ':'
      || to_char(v_day, 'YYYY-MM-DD');

    SELECT u.id, coalesce(u.metadata, '{}'::jsonb)
    INTO v_entry_id, v_meta
    FROM public.client_updates AS u
    WHERE u.client_id = v_client
      AND u.source = 'system_send'
      AND u.source_ref = v_ref
      AND u.tenant_id = NEW.tenant_id
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
        AND u.source = 'system_send'
        AND u.source_ref = v_ref
        AND u.tenant_id = NEW.tenant_id
      FOR UPDATE;
      IF v_entry_id IS NULL THEN
        RETURN NULL;
      END IF;
    END IF;

    v_count := coalesce((v_meta ->> 'count')::integer, 1) + 1;
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
