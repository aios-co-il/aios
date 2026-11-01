-- Carmen manager round: client chat SLA and complaints (AIO-252; plan
-- components C17 and C18).
--
-- Read-only over chat_messages. Nothing here sends a message, and nothing
-- reads a thread that is not a group linked to a client: direct chats and
-- unlinked groups never leave these functions (an unlinked group's name and
-- message count leave only when the name matches one client, as a link
-- suggestion).
--
-- Requires AIO-242 (20261030093000_client_card_system_send_log.sql):
-- resolve_whatsapp_group_client, whatsapp_group_client_ids,
-- whatsapp_group_link_tenant_ok and chat_messages.send_kind. Merge order:
-- AIO-242, AIO-251 (20261101100000), then this migration.
--
-- 1. carmen_chat_thread_reviews: the last LLM verdict per client group
--    thread and the last client message the model read, so each client line
--    is read once (later lines are sent as new). Service role only.
-- 2. get_client_thread_activity: the recent messages of every client group
--    of the given lines (the round passes the tenant's monitored Green API
--    lines). A group resolves to one client through
--    resolve_whatsapp_group_client. TypeScript decides who is staff.
-- 3. get_unlinked_client_groups: groups with traffic and no client link whose
--    name contains exactly one client's name as whole words (an owner-level
--    suggestion).
-- 4. carmen_finding_resolve: closes live findings a collector saw end
--    ('answered'), with the details (response time) on the 'resolved' event.
--
-- Indexes: none added; chat_messages is a hot webhook table. The read-only
-- plan check for these reads is supabase/ops/verify_carmen_chat_sla_plans.sql.

-- ─── 1. carmen_chat_thread_reviews ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.carmen_chat_thread_reviews (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  thread_key text NOT NULL CHECK (length(thread_key) BETWEEN 1 AND 200),
  last_reviewed_message_id uuid NOT NULL,
  verdict jsonb NOT NULL,
  model text,
  cost_usd numeric(12, 6),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, thread_key)
);

COMMENT ON TABLE public.carmen_chat_thread_reviews IS
  'Last LLM verdict per client group thread of the manager round (AIO-252) and the last client message the model read (last_reviewed_message_id): later client lines are read as new, each once. verdict.complaint_ids names the lines read as complaints. Written by carmen-manager-round (service role).';

ALTER TABLE public.carmen_chat_thread_reviews ENABLE ROW LEVEL SECURITY;

-- Verdicts summarise threads of the operator's own line: no policies, so
-- only the service role (the round) reads or writes them (plan C6).
REVOKE ALL ON public.carmen_chat_thread_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.carmen_chat_thread_reviews TO service_role;

-- ─── 2. get_client_thread_activity ──────────────────────────────────────────

-- Up to p_per_thread recent messages (oldest first) of every client group
-- of the lines p_connection_user_ids, since p_since (the caller's read
-- window: collectors/chat/scope.ts), in thread_key order after
-- p_after_thread_key (keyset paging: each page holds whole threads). A
-- thread is a group linked to exactly one client the tenant may act on;
-- direct chats are never read. Clients: the tenant's own and those of
-- agencies shared with it, not ended or inactive.
-- A group linked to another tenant's client is read here unless that tenant
-- reads it itself: its p_collector run succeeded in the last 40 hours (the
-- round skips Saturday) and stored, in watermark.read_lines, a line with
-- traffic in the same group (one reader per group_chat_id).
-- Groups the line owner blocked are skipped. A message stored twice (same
-- Green idMessage, e.g. on two monitored lines in one group) is returned
-- once, as the copy of the line that sent it. A send AIOS stamped with a
-- send_kind is returned only when a person made it from AIOS
-- (p_person_send_kinds, the caller's list: a typed reply, or a report,
-- dashboard or meeting summary sent on request), since it answers the client
-- like a typed reply. Broadcasts, automations, Carmen's sends, staff alerts
-- and scheduled reports (send_ref names one of the tenant's report_schedules)
-- are left out: they are neither a staff reply nor the client's.
-- sender_match_key is the sender's phone match key after mapping an @lid
-- sender through wa_lid_map; an @lid without a mapping returns NULL with
-- sender_lid_unmapped = true.
CREATE OR REPLACE FUNCTION public.get_client_thread_activity(
  p_tenant_id uuid,
  p_connection_user_ids uuid[],
  p_since timestamptz,
  p_collector text,
  p_person_send_kinds text[],
  p_provider public.chat_provider DEFAULT 'green_api',
  p_client_ids uuid[] DEFAULT NULL,
  p_per_thread integer DEFAULT 15,
  p_after_thread_key text DEFAULT NULL
)
RETURNS TABLE (
  thread_key text,
  client_id uuid,
  client_tenant_id uuid,
  client_name text,
  group_id uuid,
  message_id uuid,
  created_at timestamptz,
  direction text,
  sender_match_key text,
  sender_lid_unmapped boolean,
  sent_by_user_id uuid,
  message_text text
)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH clients_in_scope AS (
    SELECT c.id, c.tenant_id, c.name
    FROM public.clients AS c
    WHERE c.status NOT IN ('ended', 'inactive')
      AND (p_client_ids IS NULL OR c.id = ANY (p_client_ids))
      AND (c.tenant_id = p_tenant_id OR EXISTS (
        SELECT 1 FROM public.agency_tenant_access AS ata
        WHERE ata.agency_id = c.agency_id
          AND ata.accessing_tenant_id = p_tenant_id))
  ),
  messages AS (
    SELECT cm.id, cm.created_at, cm.direction, cm.group_id,
           cm.connection_user_id, cm.sender_phone, cm.sent_by_user_id,
           cm.send_kind, cm.send_ref, left(cm.message_text, 500) AS message_text,
           coalesce(cm.raw_provider_data ->> 'idMessage', cm.id::text) AS provider_id,
           (cm.raw_provider_data -> 'senderData' ->> 'sender') LIKE '%@lid' AS from_lid
    FROM public.chat_messages AS cm
    WHERE cm.tenant_id = p_tenant_id
      AND cm.provider = p_provider
      AND cm.connection_user_id = ANY (p_connection_user_ids)
      AND cm.group_id IS NOT NULL
      AND cm.created_at >= p_since
      AND cm.is_blocked = false
  ),
  senders AS (
    SELECT m.*,
           CASE WHEN m.from_lid THEN public.phone_match_key(lid.phone)
                ELSE public.phone_match_key(m.sender_phone) END AS match_key,
           m.from_lid AND lid.phone IS NULL AS lid_unmapped
    FROM messages AS m
    LEFT JOIN public.wa_lid_map AS lid
      ON m.from_lid AND lid.lid = regexp_replace(coalesce(m.sender_phone, ''), '\D', '', 'g')
  ),
  group_clients AS MATERIALIZED (
    SELECT g.id AS group_id, g.group_chat_id,
           public.resolve_whatsapp_group_client(g.id) AS client_id
    FROM (SELECT DISTINCT s.group_id FROM senders AS s) AS active
    JOIN public.whatsapp_groups AS g ON g.id = active.group_id
    WHERE g.tenant_id = p_tenant_id
      AND g.is_blocked = false
  ),
  group_threads AS (
    SELECT gc.group_id, 'group:' || gc.group_chat_id AS thread_key, cs.id AS client_id
    FROM group_clients AS gc
    JOIN clients_in_scope AS cs ON cs.id = gc.client_id
    WHERE cs.tenant_id = p_tenant_id OR NOT EXISTS (
      SELECT 1
      FROM public.carmen_round_state AS rs
      JOIN public.whatsapp_groups AS own
        ON own.tenant_id = rs.tenant_id AND own.group_chat_id = gc.group_chat_id
      JOIN public.chat_messages AS ocm ON ocm.group_id = own.id
      WHERE rs.tenant_id = cs.tenant_id
        AND rs.collector = p_collector
        AND rs.last_run_at >= now() - interval '40 hours'
        AND jsonb_typeof(rs.watermark -> 'read_lines') = 'array'
        AND (rs.watermark -> 'read_lines') ? ocm.connection_user_id::text
        AND ocm.tenant_id = own.tenant_id
        AND ocm.provider = p_provider
        AND ocm.created_at >= p_since)
  ),
  threaded AS (
    SELECT s.*, gt.thread_key, gt.client_id AS thread_client_id
    FROM senders AS s
    JOIN group_threads AS gt ON gt.group_id = s.group_id
  ),
  unblocked AS (
    SELECT t.*
    FROM threaded AS t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.blocked_contacts AS bc
      WHERE bc.tenant_id = p_tenant_id
        AND bc.connection_user_id = t.connection_user_id
        AND bc.group_id = t.group_id)
  ),
  deduped AS (
    SELECT DISTINCT ON (u.thread_key, u.provider_id) u.*
    FROM unblocked AS u
    ORDER BY u.thread_key, u.provider_id, (u.direction = 'outbound') DESC, u.created_at, u.id
  ),
  ranked AS (
    SELECT d.*, row_number() OVER (
      PARTITION BY d.thread_key ORDER BY d.created_at DESC, d.id DESC) AS recency
    FROM deduped AS d
    WHERE d.send_kind IS NULL
       OR (d.send_kind = ANY (p_person_send_kinds)
         AND (d.send_ref IS NULL OR d.send_ref NOT IN (
           SELECT rs.id::text FROM public.report_schedules AS rs
           WHERE rs.tenant_id = p_tenant_id)))
  )
  SELECT r.thread_key, r.thread_client_id, cs.tenant_id, cs.name,
         r.group_id, r.id, r.created_at, r.direction, r.match_key,
         r.lid_unmapped, r.sent_by_user_id, r.message_text
  FROM ranked AS r
  JOIN clients_in_scope AS cs ON cs.id = r.thread_client_id
  WHERE r.recency <= least(greatest(coalesce(p_per_thread, 15), 1), 50)
    AND (p_after_thread_key IS NULL OR r.thread_key > p_after_thread_key)
  ORDER BY r.thread_key, r.created_at, r.id
$$;

REVOKE ALL ON FUNCTION public.get_client_thread_activity(uuid, uuid[], timestamptz, text, text[], public.chat_provider, uuid[], integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_thread_activity(uuid, uuid[], timestamptz, text, text[], public.chat_provider, uuid[], integer, text)
  TO service_role;

-- ─── 3. get_unlinked_client_groups ──────────────────────────────────────────

-- Groups of the tenant with at least p_min_messages messages on the given
-- lines since p_since (the caller's read window), linked to no client in the
-- tenant or a related one, whose name contains the name (3+ characters) of
-- exactly one client the tenant may act on as whole words (spaces and
-- punctuation separate words, so 'אור' never matches 'אורית'). Only the
-- group's name, id and message count leave; never its messages.
CREATE OR REPLACE FUNCTION public.get_unlinked_client_groups(
  p_tenant_id uuid,
  p_connection_user_ids uuid[],
  p_since timestamptz,
  p_provider public.chat_provider DEFAULT 'green_api',
  p_min_messages integer DEFAULT 3
)
RETURNS TABLE (
  group_id uuid,
  group_chat_id text,
  group_name text,
  client_id uuid,
  client_name text,
  message_count integer,
  last_message_at timestamptz
)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH traffic AS (
    SELECT cm.group_id, count(*)::integer AS message_count, max(cm.created_at) AS last_message_at
    FROM public.chat_messages AS cm
    WHERE cm.tenant_id = p_tenant_id
      AND cm.provider = p_provider
      AND cm.connection_user_id = ANY (p_connection_user_ids)
      AND cm.group_id IS NOT NULL
      AND cm.created_at >= p_since
      AND cm.is_blocked = false
    GROUP BY cm.group_id
    HAVING count(*) >= greatest(coalesce(p_min_messages, 3), 1)
  ),
  candidates AS (
    SELECT g.id, g.group_chat_id, g.group_name, t.message_count, t.last_message_at
    FROM traffic AS t
    JOIN public.whatsapp_groups AS g ON g.id = t.group_id
    WHERE g.tenant_id = p_tenant_id
      AND g.is_blocked = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.whatsapp_groups AS same
        CROSS JOIN LATERAL public.whatsapp_group_client_ids(same.id) AS linked(client_id)
        WHERE same.group_chat_id = g.group_chat_id
          AND public.whatsapp_group_link_tenant_ok(same.tenant_id, p_tenant_id))
  ),
  named_clients AS (
    SELECT c.id, c.name,
           ' ' || btrim(regexp_replace(lower(c.name), '[[:space:][:punct:]׳״–—]+', ' ', 'g')) || ' ' AS words
    FROM public.clients AS c
    WHERE c.status NOT IN ('ended', 'inactive')
      AND length(btrim(c.name)) >= 3
      AND (c.tenant_id = p_tenant_id OR EXISTS (
        SELECT 1 FROM public.agency_tenant_access AS ata
        WHERE ata.agency_id = c.agency_id
          AND ata.accessing_tenant_id = p_tenant_id))
  ),
  matches AS (
    SELECT cand.id AS group_id, nc.id AS client_id, nc.name AS client_name
    FROM candidates AS cand
    JOIN named_clients AS nc
      ON btrim(nc.words) <> ''
     AND position(nc.words IN ' ' || btrim(regexp_replace(lower(cand.group_name),
           '[[:space:][:punct:]׳״–—]+', ' ', 'g')) || ' ') > 0
  ),
  single AS (
    SELECT m.group_id, (array_agg(m.client_id))[1] AS client_id,
           (array_agg(m.client_name))[1] AS client_name
    FROM matches AS m
    GROUP BY m.group_id
    HAVING count(DISTINCT m.client_id) = 1
  )
  SELECT cand.id, cand.group_chat_id, cand.group_name, s.client_id, s.client_name,
         cand.message_count, cand.last_message_at
  FROM candidates AS cand
  JOIN single AS s ON s.group_id = cand.id
  ORDER BY cand.last_message_at DESC
$$;

REVOKE ALL ON FUNCTION public.get_unlinked_client_groups(uuid, uuid[], timestamptz, public.chat_provider, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unlinked_client_groups(uuid, uuid[], timestamptz, public.chat_provider, integer)
  TO service_role;

-- ─── 4. carmen_finding_resolve ──────────────────────────────────────────────

-- Close live findings the collector p_collector raised and saw end. Item
-- keys: kind, fingerprint, resolution ('answered' only; any other item is
-- skipped with a NOTICE), details (an object logged on the 'resolved' event,
-- e.g. the response time). Planned messages of a closed finding are
-- cancelled. Returns the findings closed.
CREATE OR REPLACE FUNCTION public.carmen_finding_resolve(
  p_tenant_id uuid,
  p_round_id uuid,
  p_collector text,
  p_items jsonb
)
RETURNS TABLE (finding_id uuid, short_code integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_skipped integer;
BEGIN
  SELECT count(*) INTO v_skipped
  FROM jsonb_to_recordset(
    CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
  ) AS x(resolution text)
  WHERE x.resolution IS DISTINCT FROM 'answered';
  IF v_skipped > 0 THEN
    RAISE NOTICE 'carmen_finding_resolve: tenant %, collector %: % item(s) skipped, resolution is not answered',
      p_tenant_id, p_collector, v_skipped;
  END IF;

  RETURN QUERY
  WITH items AS (
    SELECT x.kind, x.fingerprint, x.resolution,
           CASE WHEN jsonb_typeof(x.details) = 'object' THEN x.details ELSE '{}'::jsonb END AS details
    FROM jsonb_to_recordset(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    ) AS x(kind text, fingerprint text, resolution text, details jsonb)
    WHERE x.resolution = 'answered'
  ), closed AS (
    UPDATE public.carmen_findings AS f
    SET status = 'resolved', resolution = i.resolution, resolved_at = now(),
        next_action_at = NULL, round_id = p_round_id
    FROM items AS i
    WHERE f.tenant_id = p_tenant_id
      AND f.collector = p_collector
      AND f.kind = i.kind
      AND f.fingerprint = i.fingerprint
      AND f.status IN ('open', 'notified', 'acknowledged', 'snoozed')
    RETURNING f.id, f.short_code, i.resolution, i.details
  ), cancelled AS (
    UPDATE public.carmen_finding_deliveries AS d
    SET status = 'cancelled'
    FROM closed AS c
    WHERE d.tenant_id = p_tenant_id AND d.finding_id = c.id
      AND d.status = 'planned'
  ), logged AS (
    INSERT INTO public.carmen_finding_events (tenant_id, finding_id, event, details)
    SELECT p_tenant_id, c.id, 'resolved',
           c.details || jsonb_build_object('resolution', c.resolution)
    FROM closed AS c
  )
  SELECT c.id, c.short_code FROM closed AS c;
END;
$$;

REVOKE ALL ON FUNCTION public.carmen_finding_resolve(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_finding_resolve(uuid, uuid, text, jsonb)
  TO service_role;
