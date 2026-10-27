-- Group updates to the client card (AIO-254, plan component C20).
--
-- Once a day (19:30 Asia/Jerusalem, a slot of the manager round, no new
-- cron) Carmen reads what was said in each client's WhatsApp group since the
-- last digest and, when it matters and nobody updated the card, drafts one
-- card entry (a card_stale_group finding). A staff member approves it with
-- "אשר <code>", or, in team mode with kinds.card_stale_group.card_write on,
-- Carmen writes it herself. The card entry goes through
-- record_client_card_entry (source group_digest, update_type group_summary,
-- source_ref '<group_id>:<last_message_id>', counts_as_contact false).
--
-- Nothing is sent or written by this migration.
--
-- 1. get_client_group_digest_messages: the recent messages of every WhatsApp
--    group linked to exactly one client the tenant can see, one row per group.
--    Links are clients.whatsapp_group_id, team_channel_whatsapp_links and
--    carmen_client_group_access (read only; the same three sources as plan
--    component C4), counted only from the tenant itself or tenants related to
--    it by agency_tenant_access, and matched by group_chat_id, so a group
--    shared by several tenants is read once and only from the calling
--    tenant's own stored copy. A group linked to two clients is skipped.
--    Direct chats never leave the function. Sender phones leave only as
--    phone_match_key (an @lid sender through wa_lid_map), for the staff check.
-- 2. carmen_finding_resolve_card_written: closes a live finding whose drafted
--    entry is now on the card, by the person who approved it or by Carmen.
-- 3. carmen_round_llm_spend: month-to-date LLM spend of a tenant and today's
--    spend of the round's own sources, for the round's LLM allowance (plan
--    C7). AIO-252 reads the same function; keep its signature.
--
-- All three are service-role only.

-- ─── 1. Linked group messages ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_client_group_digest_messages(
  p_tenant_id uuid,
  p_since timestamptz,
  p_client_ids uuid[] DEFAULT NULL,
  p_per_group integer DEFAULT 60
)
RETURNS TABLE (
  client_id uuid,
  client_name text,
  group_id uuid,
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
  -- The tenant's own group rows linked to exactly one client.
  owned AS (
    SELECT g.id AS group_id,
           g.group_name,
           (array_agg(DISTINCT lk.client_id))[1] AS client_id
    FROM public.whatsapp_groups AS g
    JOIN links AS lk ON lk.group_chat_id = g.group_chat_id
    WHERE g.tenant_id = p_tenant_id
      AND NOT g.is_blocked
    GROUP BY g.id, g.group_name
    HAVING count(DISTINCT lk.client_id) = 1
  ),
  -- ...whose client the tenant owns or reaches through a shared agency.
  scoped AS (
    SELECT o.group_id, o.group_name, o.client_id, c.name AS client_name
    FROM owned AS o
    JOIN public.clients AS c ON c.id = o.client_id
    WHERE (p_client_ids IS NULL OR o.client_id = ANY (p_client_ids))
      AND (c.tenant_id = p_tenant_id OR EXISTS (
        SELECT 1
        FROM public.agency_tenant_access AS ata
        WHERE ata.agency_id = c.agency_id
          AND ata.accessing_tenant_id = p_tenant_id))
  ),
  windowed AS (
    SELECT m.id, m.group_id, m.created_at, m.direction, m.sender_phone,
           m.sent_by_user_id, m.message_text, m.provider, m.connection_user_id
    FROM public.chat_messages AS m
    JOIN scoped AS s ON s.group_id = m.group_id
    -- Groups are stored only by the two WhatsApp lines; naming them lets
    -- idx_chat_messages_provider (tenant_id, provider, created_at) serve the
    -- window instead of each group's whole history.
    WHERE m.tenant_id = p_tenant_id
      AND m.provider IN ('green_api', 'manus_wa')
      AND m.created_at > p_since
      AND NOT m.is_blocked
  ),
  -- Carmen's line and David's line may both store a group: read one copy,
  -- the connection that stored the most of the window.
  streams AS (
    SELECT w.group_id, w.provider, w.connection_user_id,
           row_number() OVER (
             PARTITION BY w.group_id
             ORDER BY count(*) DESC, w.provider::text,
                      w.connection_user_id::text NULLS LAST
           ) AS rank
    FROM windowed AS w
    GROUP BY w.group_id, w.provider, w.connection_user_id
  ),
  recent AS (
    SELECT w.*,
           row_number() OVER (
             PARTITION BY w.group_id ORDER BY w.created_at DESC, w.id DESC
           ) AS age
    FROM windowed AS w
    JOIN streams AS st
      ON st.group_id = w.group_id
     AND st.rank = 1
     AND st.provider = w.provider
     AND st.connection_user_id IS NOT DISTINCT FROM w.connection_user_id
  )
  SELECT s.client_id,
         s.client_name,
         s.group_id,
         s.group_name,
         jsonb_agg(
           jsonb_build_object(
             'id', r.id,
             'at', r.created_at,
             'out', r.direction = 'outbound' OR r.sent_by_user_id IS NOT NULL,
             'key', public.phone_match_key(
               CASE WHEN r.sender_phone LIKE '%@lid%' THEN lm.phone ELSE r.sender_phone END),
             'text', left(r.message_text, 500)
           )
           ORDER BY r.created_at, r.id
         ) AS messages
  FROM recent AS r
  JOIN scoped AS s ON s.group_id = r.group_id
  LEFT JOIN public.wa_lid_map AS lm
    ON r.sender_phone LIKE '%@lid%'
   AND lm.lid = regexp_replace(split_part(r.sender_phone, '@', 1), '\D', '', 'g')
  WHERE r.age <= greatest(coalesce(p_per_group, 60), 1)
  GROUP BY s.client_id, s.client_name, s.group_id, s.group_name
$$;

COMMENT ON FUNCTION public.get_client_group_digest_messages(uuid, timestamptz, uuid[], integer) IS
  'Recent messages (newest p_per_group, oldest first) of each WhatsApp group linked to exactly one client the tenant can see, from the tenant''s own stored copy. Groups only; senders as phone_match_key. Service role only (AIO-254).';

-- ─── 2. Close a finding whose draft is on the card ──────────────────────────

-- Resolves a live finding as fixed once its drafted entry (p_entry_id, on the
-- finding's client in this tenant) is on the card: by p_actor_user_id when a
-- person approved it, by Carmen when NULL. Planned messages are cancelled and
-- the 'resolved' event names the entry. False when the finding is no longer
-- live (a repeated approval).
CREATE OR REPLACE FUNCTION public.carmen_finding_resolve_card_written(
  p_tenant_id uuid,
  p_finding_id uuid,
  p_entry_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  IF p_actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = p_actor_user_id AND ur.tenant_id = p_tenant_id
    UNION ALL
    SELECT 1 FROM public.tenant_users AS tu
    WHERE tu.user_id = p_actor_user_id AND tu.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'actor_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.carmen_findings AS f
    JOIN public.client_updates AS u
      ON u.client_id = f.client_id AND u.tenant_id = f.tenant_id
    WHERE f.id = p_finding_id
      AND f.tenant_id = p_tenant_id
      AND u.id = p_entry_id
  ) THEN
    RAISE EXCEPTION 'entry_not_on_finding_client' USING ERRCODE = '22023';
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
    (tenant_id, finding_id, event, actor_user_id, details)
  VALUES (p_tenant_id, p_finding_id, 'resolved', p_actor_user_id,
    jsonb_build_object(
      'resolution', 'fixed',
      'via', CASE WHEN p_actor_user_id IS NULL THEN 'card_autowrite' ELSE 'card_approved' END,
      'entry_id', p_entry_id));
  RETURN true;
END;
$$;

-- ─── 3. The round's LLM spend ───────────────────────────────────────────────

-- The tenant's ai_usage_log cost since p_month_start (every source) and since
-- p_day_start for the sources starting with p_source_prefix.
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
    coalesce(sum(l.cost_usd), 0)::numeric,
    coalesce(sum(l.cost_usd) FILTER (
      WHERE l.created_at >= p_day_start
        AND left(l.source, length(p_source_prefix)) = p_source_prefix), 0)::numeric
  FROM public.ai_usage_log AS l
  WHERE l.tenant_id = p_tenant_id
    AND l.created_at >= least(p_month_start, p_day_start)
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_client_group_digest_messages(uuid, timestamptz, uuid[], integer)',
    'public.carmen_finding_resolve_card_written(uuid, uuid, uuid, uuid)',
    'public.carmen_round_llm_spend(uuid, timestamptz, timestamptz, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;
