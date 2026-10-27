-- Carmen manager round: client chat SLA and complaints (AIO-252; plan
-- components C17 and C18).
--
-- Read-only over chat_messages. Nothing here sends a message, and nothing
-- reads a thread that is not linked to a client: personal and unlinked
-- threads never leave these functions (an unlinked group's name and message
-- count leave only when the name matches one client, as a link suggestion).
--
-- 1. carmen_chat_thread_reviews: the cached LLM verdict per client thread,
--    valid while the thread's last client message is the one reviewed.
-- 2. get_client_thread_activity: the recent messages of every client-linked
--    thread of the given lines (the round passes the tenant's monitored Green
--    API lines). Groups resolve to one client through
--    whatsapp_group_client_ids (AIO-242, so this migration lands after it);
--    direct chats through chat_messages.client_id or the phone match key of
--    the client or one of its contacts. TypeScript decides who is staff.
-- 3. get_unlinked_client_groups: groups with traffic and no client link whose
--    name matches exactly one client (an owner-level suggestion).
-- 4. carmen_round_llm_spend: the tenant's month-to-date LLM spend and the
--    round's own spend today, for the round's LLM allowance.
-- 5. carmen_finding_resolve: closes live findings a collector saw end
--    ('answered'), with the details (response time) on the 'resolved' event.
--
-- Indexes: none added. The activity read is one range scan of
-- idx_chat_messages_provider (tenant_id, provider, created_at DESC) over at
-- most 7 days, and chat_messages is a hot webhook table. Before merge, run
-- this read-only check on Production and attach the output to the PR:
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'chat_messages';
--   SELECT pg_size_pretty(pg_total_relation_size('public.chat_messages'));
--   EXPLAIN SELECT * FROM public.get_client_thread_activity(
--     '<tenant>'::uuid, ARRAY['<green line owner>']::uuid[], now() - interval '7 days');
-- A plan without a sequential scan of chat_messages keeps this as is.
-- Otherwise a new index ships alone in its own migration as
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS (one statement, outside a
-- transaction), or as a plain CREATE INDEX merged at a low-traffic hour.

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
  'Cached LLM verdict per client group thread of the manager round (AIO-252): reused while last_reviewed_message_id is still the thread''s last client message. Written by carmen-manager-round (service role).';

ALTER TABLE public.carmen_chat_thread_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.carmen_chat_thread_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.carmen_chat_thread_reviews TO authenticated;
GRANT ALL ON public.carmen_chat_thread_reviews TO service_role;

-- Verdicts summarise threads of the operator's own line: owner level only.
DROP POLICY IF EXISTS "Carmen chat reviews for the tenant owner level" ON public.carmen_chat_thread_reviews;
CREATE POLICY "Carmen chat reviews for the tenant owner level" ON public.carmen_chat_thread_reviews
  FOR SELECT TO authenticated
  USING (public.carmen_manager_is_owner(tenant_id));

-- ─── 2. get_client_thread_activity ──────────────────────────────────────────

-- Up to p_per_thread recent messages (oldest first) of every client thread
-- of the lines p_connection_user_ids, since p_since (never more than 7 days
-- back). A thread is a group linked to exactly one client the tenant may act
-- on, or a direct chat whose counterpart is such a client or one of its
-- contacts. Clients: the tenant's own and those of agencies shared with it,
-- not ended or inactive. A group linked to another tenant's client is read
-- only when that tenant has no Green API traffic of its own in the same
-- group (one reader per group_chat_id). Threads the line owner blocked are
-- skipped, and a message stored twice (same Green idMessage) is returned
-- once. sender_match_key is the sender's phone match key after mapping an
-- @lid sender through wa_lid_map; an @lid without a mapping returns NULL with
-- sender_lid_unmapped = true.
CREATE OR REPLACE FUNCTION public.get_client_thread_activity(
  p_tenant_id uuid,
  p_connection_user_ids uuid[],
  p_since timestamptz,
  p_provider public.chat_provider DEFAULT 'green_api',
  p_client_ids uuid[] DEFAULT NULL,
  p_per_thread integer DEFAULT 15
)
RETURNS TABLE (
  thread_key text,
  thread_kind text,
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
    SELECT c.id, c.tenant_id, c.name, c.phone
    FROM public.clients AS c
    WHERE c.status NOT IN ('ended', 'inactive')
      AND (p_client_ids IS NULL OR c.id = ANY (p_client_ids))
      AND (c.tenant_id = p_tenant_id OR EXISTS (
        SELECT 1 FROM public.agency_tenant_access AS ata
        WHERE ata.agency_id = c.agency_id
          AND ata.accessing_tenant_id = p_tenant_id))
  ),
  client_keys AS (
    SELECT DISTINCT k.client_id, k.match_key
    FROM (
      SELECT cs.id AS client_id, public.phone_match_key(cs.phone) AS match_key
      FROM clients_in_scope AS cs
      UNION ALL
      SELECT cc.client_id, public.phone_match_key(cc.phone)
      FROM public.client_contacts AS cc
      JOIN clients_in_scope AS cs ON cs.id = cc.client_id
    ) AS k
    WHERE k.match_key IS NOT NULL
  ),
  messages AS (
    SELECT cm.id, cm.created_at, cm.direction, cm.group_id, cm.client_id,
           cm.connection_user_id, cm.sender_phone, cm.sent_by_user_id,
           left(cm.message_text, 500) AS message_text,
           coalesce(cm.raw_provider_data ->> 'idMessage', cm.id::text) AS provider_id,
           (CASE WHEN cm.group_id IS NULL
              THEN cm.raw_provider_data -> 'senderData' ->> 'chatId'
              ELSE cm.raw_provider_data -> 'senderData' ->> 'sender'
            END) LIKE '%@lid' AS from_lid
    FROM public.chat_messages AS cm
    WHERE cm.tenant_id = p_tenant_id
      AND cm.provider = p_provider
      AND cm.connection_user_id = ANY (p_connection_user_ids)
      AND cm.created_at >= greatest(p_since, now() - interval '7 days')
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
    FROM (SELECT DISTINCT s.group_id FROM senders AS s WHERE s.group_id IS NOT NULL) AS active
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
      FROM public.whatsapp_groups AS own
      JOIN public.chat_messages AS ocm ON ocm.group_id = own.id
      WHERE own.tenant_id = cs.tenant_id
        AND own.group_chat_id = gc.group_chat_id
        AND ocm.provider = p_provider
        AND ocm.created_at >= greatest(p_since, now() - interval '7 days'))
  ),
  -- A direct chat's client: the one client the stored rows are linked to
  -- (none when a linked client is out of scope or there are several), else
  -- the one client whose phone or contact phone matches the counterpart.
  dm_threads AS (
    SELECT s.connection_user_id, s.match_key,
           CASE
             WHEN count(DISTINCT s.client_id) = 1 THEN (
               SELECT cs.id FROM clients_in_scope AS cs
               WHERE cs.id = (array_agg(s.client_id) FILTER (WHERE s.client_id IS NOT NULL))[1])
             WHEN count(DISTINCT s.client_id) = 0 THEN (
               SELECT CASE WHEN count(DISTINCT k.client_id) = 1
                 THEN (array_agg(k.client_id))[1] END
               FROM client_keys AS k WHERE k.match_key = s.match_key)
           END AS client_id
    FROM senders AS s
    WHERE s.group_id IS NULL AND s.match_key IS NOT NULL
    GROUP BY s.connection_user_id, s.match_key
  ),
  threaded AS (
    SELECT s.*, gt.thread_key, 'group'::text AS thread_kind, gt.client_id AS thread_client_id
    FROM senders AS s
    JOIN group_threads AS gt ON gt.group_id = s.group_id
    UNION ALL
    SELECT s.*, 'dm:' || s.connection_user_id || ':' || s.match_key, 'dm', dt.client_id
    FROM senders AS s
    JOIN dm_threads AS dt
      ON dt.connection_user_id = s.connection_user_id AND dt.match_key = s.match_key
    WHERE s.group_id IS NULL AND dt.client_id IS NOT NULL
  ),
  unblocked AS (
    SELECT t.*
    FROM threaded AS t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.blocked_contacts AS bc
      WHERE bc.tenant_id = p_tenant_id
        AND bc.connection_user_id = t.connection_user_id
        AND (bc.group_id = t.group_id
          OR (t.group_id IS NULL AND (bc.client_id = t.thread_client_id
            OR bc.sender_phone = t.sender_phone))))
  ),
  deduped AS (
    SELECT DISTINCT ON (u.thread_key, u.provider_id) u.*
    FROM unblocked AS u
    ORDER BY u.thread_key, u.provider_id, u.created_at, u.id
  ),
  ranked AS (
    SELECT d.*, row_number() OVER (
      PARTITION BY d.thread_key ORDER BY d.created_at DESC, d.id DESC) AS recency
    FROM deduped AS d
  )
  SELECT r.thread_key, r.thread_kind, r.thread_client_id, cs.tenant_id, cs.name,
         r.group_id, r.id, r.created_at, r.direction, r.match_key,
         r.lid_unmapped, r.sent_by_user_id, r.message_text
  FROM ranked AS r
  JOIN clients_in_scope AS cs ON cs.id = r.thread_client_id
  WHERE r.recency <= least(greatest(coalesce(p_per_thread, 15), 1), 50)
  ORDER BY r.thread_key, r.created_at, r.id
$$;

REVOKE ALL ON FUNCTION public.get_client_thread_activity(uuid, uuid[], timestamptz, public.chat_provider, uuid[], integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_thread_activity(uuid, uuid[], timestamptz, public.chat_provider, uuid[], integer)
  TO service_role;

-- ─── 3. get_unlinked_client_groups ──────────────────────────────────────────

-- Groups of the tenant with at least p_min_messages messages on the given
-- lines since p_since (at most 7 days back), linked to no client in the
-- tenant or a related one, whose name contains the name (3+ characters) of
-- exactly one client the tenant may act on. Only the group's name, id and
-- message count leave; never its messages.
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
      AND cm.created_at >= greatest(p_since, now() - interval '7 days')
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
  matches AS (
    SELECT cand.id AS group_id, c.id AS client_id, c.name AS client_name
    FROM candidates AS cand
    JOIN public.clients AS c
      ON length(btrim(c.name)) >= 3
     AND position(lower(btrim(c.name)) IN lower(cand.group_name)) > 0
    WHERE c.status NOT IN ('ended', 'inactive')
      AND (c.tenant_id = p_tenant_id OR EXISTS (
        SELECT 1 FROM public.agency_tenant_access AS ata
        WHERE ata.agency_id = c.agency_id
          AND ata.accessing_tenant_id = p_tenant_id))
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

-- ─── 4. carmen_round_llm_spend ──────────────────────────────────────────────

-- The tenant's LLM spend logged in ai_usage_log since p_month_start (every
-- source), and the round's own spend (sources starting with p_source_prefix)
-- since p_day_start.
CREATE OR REPLACE FUNCTION public.carmen_round_llm_spend(
  p_tenant_id uuid,
  p_month_start timestamptz,
  p_day_start timestamptz,
  p_source_prefix text
)
RETURNS TABLE (month_usd numeric, day_usd numeric)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT
    coalesce(sum(l.cost_usd) FILTER (WHERE l.created_at >= p_month_start), 0),
    coalesce(sum(l.cost_usd) FILTER (
      WHERE l.created_at >= p_day_start
        AND left(l.source, length(p_source_prefix)) = p_source_prefix), 0)
  FROM public.ai_usage_log AS l
  WHERE l.tenant_id = p_tenant_id
    AND l.created_at >= least(p_month_start, p_day_start)
$$;

REVOKE ALL ON FUNCTION public.carmen_round_llm_spend(uuid, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_round_llm_spend(uuid, timestamptz, timestamptz, text)
  TO service_role;

-- ─── 5. carmen_finding_resolve ──────────────────────────────────────────────

-- Close live findings the collector p_collector raised and saw end. Item
-- keys: kind, fingerprint, resolution ('answered' only), details (an object
-- logged on the 'resolved' event, e.g. the response time). Planned messages
-- of a closed finding are cancelled. Returns the findings closed.
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
BEGIN
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
    WHERE d.finding_id = c.id AND d.status = 'planned'
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
