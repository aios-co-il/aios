-- Manager round: skip paused clients (AIO-591).
-- The round's client reads kept every client that was not ended, so a paused
-- client (מושהה) still had its chats and groups read. Each read now keeps only
-- active and onboarding clients. The bodies are otherwise unchanged from
-- 20261101101000_carmen_chat_sla and 20261101103000_carmen_group_updates;
-- CREATE OR REPLACE keeps their owner, grants and comments.

-- get_client_thread_activity: reads only active and onboarding clients.
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
    WHERE c.status IN ('active', 'onboarding')
      AND (p_client_ids IS NULL OR c.id = ANY (p_client_ids))
      AND (c.tenant_id = p_tenant_id OR EXISTS (
        SELECT 1 FROM public.agency_tenant_access AS ata
        WHERE ata.agency_id = c.agency_id
          AND ata.accessing_tenant_id = p_tenant_id))
  ),
  -- Phone match key -> its one client (the client's or a client contact's
  -- phone), computed once per call. A key on two clients matches neither.
  key_clients AS MATERIALIZED (
    SELECT k.match_key, (array_agg(k.client_id))[1] AS client_id
    FROM (
      SELECT cs.id AS client_id, public.phone_match_key(cs.phone) AS match_key
      FROM clients_in_scope AS cs
      UNION
      SELECT cc.client_id, public.phone_match_key(cc.phone)
      FROM public.client_contacts AS cc
      JOIN clients_in_scope AS cs ON cs.id = cc.client_id
    ) AS k
    WHERE k.match_key IS NOT NULL
    GROUP BY k.match_key
    HAVING count(DISTINCT k.client_id) = 1
  ),
  messages AS (
    SELECT cm.id, cm.created_at, cm.direction, cm.group_id,
           cm.connection_user_id, cm.sender_phone, cm.sent_by_user_id,
           cm.send_kind, cm.send_ref, left(cm.message_text, 500) AS message_text,
           coalesce(cm.raw_provider_data ->> 'idMessage', cm.id::text) AS provider_id,
           -- A reply stored from outgoingMessageStatus has no senderData.
           (CASE WHEN cm.group_id IS NULL
              THEN coalesce(cm.raw_provider_data -> 'senderData' ->> 'chatId',
                            cm.raw_provider_data ->> 'chatId')
              ELSE cm.raw_provider_data -> 'senderData' ->> 'sender'
            END) LIKE '%@lid' AS from_lid
    FROM public.chat_messages AS cm
    WHERE cm.tenant_id = p_tenant_id
      AND cm.provider = p_provider
      AND cm.connection_user_id = ANY (p_connection_user_ids)
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
    SELECT s.*, gt.thread_key, 'group'::text AS thread_kind, gt.client_id AS thread_client_id
    FROM senders AS s
    JOIN group_threads AS gt ON gt.group_id = s.group_id
    UNION ALL
    -- A direct chat: only with a phone on a client card (key_clients).
    SELECT s.*, 'dm:' || s.connection_user_id || ':' || s.match_key, 'dm', kc.client_id
    FROM senders AS s
    JOIN key_clients AS kc ON kc.match_key = s.match_key
    WHERE s.group_id IS NULL
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
  SELECT r.thread_key, r.thread_kind, r.thread_client_id, cs.tenant_id, cs.name,
         r.group_id, r.id, r.created_at, r.direction, r.match_key,
         r.lid_unmapped, r.sent_by_user_id, r.message_text
  FROM ranked AS r
  JOIN clients_in_scope AS cs ON cs.id = r.thread_client_id
  WHERE r.recency <= least(greatest(coalesce(p_per_thread, 15), 1), 50)
    AND (p_after_thread_key IS NULL OR r.thread_key > p_after_thread_key)
  ORDER BY r.thread_key, r.created_at, r.id
$$;

-- get_unlinked_client_groups: reads only active and onboarding clients.
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
    WHERE c.status IN ('active', 'onboarding')
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

-- get_client_group_digest_messages: reads only active and onboarding clients.
CREATE OR REPLACE FUNCTION public.get_client_group_digest_messages(
  p_tenant_id uuid,
  p_connection_user_ids uuid[],
  p_since timestamptz,
  p_collector text,
  p_provider public.chat_provider DEFAULT 'green_api',
  p_client_ids uuid[] DEFAULT NULL,
  p_per_group integer DEFAULT 60
)
RETURNS TABLE (
  client_id uuid,
  client_name text,
  client_tenant_id uuid,
  group_id uuid,
  group_chat_id text,
  group_name text,
  messages jsonb
)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH related_tenants AS (
    SELECT p_tenant_id AS tenant_id
    UNION
    SELECT ata.source_tenant_id
    FROM public.agency_tenant_access AS ata
    WHERE ata.accessing_tenant_id = p_tenant_id
    UNION
    SELECT ata.accessing_tenant_id
    FROM public.agency_tenant_access AS ata
    WHERE ata.source_tenant_id = p_tenant_id
  ),
  links AS (
    SELECT c.id AS client_id, g.group_chat_id
    FROM public.clients AS c
    JOIN public.whatsapp_groups AS g ON g.id = c.whatsapp_group_id
    WHERE c.tenant_id IN (SELECT rt.tenant_id FROM related_tenants AS rt)
    UNION
    SELECT l.client_id, g.group_chat_id
    FROM public.team_channel_whatsapp_links AS l
    JOIN public.whatsapp_groups AS g ON g.id = l.whatsapp_group_id
    WHERE l.client_id IS NOT NULL
      AND l.tenant_id IN (SELECT rt.tenant_id FROM related_tenants AS rt)
    UNION
    SELECT a.client_id, g.group_chat_id
    FROM public.carmen_client_group_access AS a
    JOIN public.whatsapp_groups AS g ON g.id = a.whatsapp_group_id
    WHERE a.tenant_id IN (SELECT rt.tenant_id FROM related_tenants AS rt)
  ),
  -- Links to an active client whose card the tenant may write.
  scoped_links AS (
    SELECT lk.group_chat_id, c.id AS client_id
    FROM links AS lk
    JOIN public.clients AS c ON c.id = lk.client_id
    WHERE c.status IN ('active', 'onboarding')
      AND (c.tenant_id = p_tenant_id OR EXISTS (
        SELECT 1
        FROM public.agency_tenant_access AS ata
        WHERE ata.accessing_tenant_id = p_tenant_id
          AND ata.source_tenant_id = c.tenant_id
          AND ata.agency_id = c.agency_id
          AND ata.access_level = 'read_write'))
  ),
  -- The tenant's own group rows linked to exactly one such client.
  owned AS (
    SELECT g.id AS group_id,
           g.group_chat_id,
           g.group_name,
           (array_agg(DISTINCT sl.client_id))[1] AS client_id
    FROM public.whatsapp_groups AS g
    JOIN scoped_links AS sl ON sl.group_chat_id = g.group_chat_id
    WHERE g.tenant_id = p_tenant_id
      AND NOT g.is_blocked
    GROUP BY g.id, g.group_chat_id, g.group_name
    HAVING count(DISTINCT sl.client_id) = 1
  ),
  -- ...minus the groups of another tenant's client that tenant reads itself.
  scoped AS (
    SELECT o.group_id, o.group_chat_id, o.group_name, c.id AS client_id,
           c.name AS client_name, c.tenant_id AS client_tenant_id
    FROM owned AS o
    JOIN public.clients AS c ON c.id = o.client_id
    WHERE (p_client_ids IS NULL OR o.client_id = ANY (p_client_ids))
      AND (c.tenant_id = p_tenant_id OR NOT EXISTS (
        SELECT 1
        FROM public.carmen_round_state AS rs
        JOIN public.whatsapp_groups AS own
          ON own.tenant_id = rs.tenant_id AND own.group_chat_id = o.group_chat_id
        JOIN public.chat_messages AS ocm ON ocm.group_id = own.id
        WHERE rs.tenant_id = c.tenant_id
          AND rs.collector = p_collector
          AND rs.last_run_at >= now() - interval '40 hours'
          AND jsonb_typeof(rs.watermark -> 'read_lines') = 'array'
          AND (rs.watermark -> 'read_lines') ? ocm.connection_user_id::text
          AND ocm.tenant_id = own.tenant_id
          AND ocm.provider = p_provider
          AND ocm.created_at > greatest(p_since, now() - interval '7 days')))
  ),
  windowed AS (
    SELECT m.id, m.group_id, m.created_at, m.direction, m.sender_phone,
           m.sent_by_user_id, m.send_kind, m.message_text,
           m.connection_user_id,
           m.direction = 'outbound' AND m.provider = 'green_api'
             AND (m.raw_provider_data ->> 'typeWebhook' = 'outgoingMessageReceived'
               OR (m.raw_provider_data ->> 'typeWebhook' = 'outgoingMessageStatus'
                 AND coalesce(m.raw_provider_data ->> 'sendByApi', 'false') <> 'true'))
             AS typed_on_phone,
           coalesce(m.raw_provider_data ->> 'idMessage', m.id::text) AS provider_id,
           coalesce(m.raw_provider_data -> 'senderData' ->> 'sender',
                    m.raw_provider_data ->> '_group_author_raw') AS author_raw
    FROM public.chat_messages AS m
    JOIN scoped AS s ON s.group_id = m.group_id
    WHERE m.tenant_id = p_tenant_id
      AND m.provider = p_provider
      AND m.connection_user_id = ANY (p_connection_user_ids)
      AND m.created_at > greatest(p_since, now() - interval '7 days')
      AND NOT m.is_blocked
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_contacts AS bc
        WHERE bc.tenant_id = p_tenant_id
          AND bc.connection_user_id = m.connection_user_id
          AND bc.group_id = m.group_id)
  ),
  -- The sender is still a LID when its stored digits are the @lid author's.
  senders AS (
    SELECT w.*,
           coalesce(w.author_raw LIKE '%@lid%'
             AND regexp_replace(coalesce(w.sender_phone, ''), '\D', '', 'g')
               = regexp_replace(split_part(w.author_raw, '@', 1), '\D', '', 'g'),
             false) AS from_lid
    FROM windowed AS w
  ),
  keyed AS (
    SELECT s.*,
           CASE WHEN s.from_lid THEN public.phone_match_key(lm.phone)
                ELSE public.phone_match_key(s.sender_phone) END AS match_key,
           s.from_lid AND lm.phone IS NULL AS lid_unmapped
    FROM senders AS s
    LEFT JOIN public.wa_lid_map AS lm
      ON s.from_lid
     AND lm.lid = regexp_replace(s.sender_phone, '\D', '', 'g')
  ),
  deduped AS (
    SELECT DISTINCT ON (k.group_id, k.provider_id) k.*
    FROM keyed AS k
    ORDER BY k.group_id, k.provider_id, (k.direction = 'outbound') DESC,
             k.created_at, k.id
  ),
  recent AS (
    SELECT d.*,
           row_number() OVER (
             PARTITION BY d.group_id ORDER BY d.created_at DESC, d.id DESC
           ) AS age
    FROM deduped AS d
  )
  SELECT s.client_id,
         s.client_name,
         s.client_tenant_id,
         s.group_id,
         s.group_chat_id,
         s.group_name,
         jsonb_agg(
           jsonb_build_object(
             'id', r.id,
             'provider_id', r.provider_id,
             'at', r.created_at,
             'out', r.direction = 'outbound' OR r.sent_by_user_id IS NOT NULL,
             'sent_by', r.sent_by_user_id,
             'send_kind', r.send_kind,
             'typed_on_phone', coalesce(r.typed_on_phone, false),
             'line_user', r.connection_user_id,
             'key', r.match_key,
             'lid_unmapped', r.lid_unmapped,
             'text', left(r.message_text, 500)
           )
           ORDER BY r.created_at, r.id
         ) AS messages
  FROM recent AS r
  JOIN scoped AS s ON s.group_id = r.group_id
  WHERE r.age <= least(greatest(coalesce(p_per_group, 60), 1), 200)
  GROUP BY s.client_id, s.client_name, s.client_tenant_id, s.group_id,
           s.group_chat_id, s.group_name
$$;
