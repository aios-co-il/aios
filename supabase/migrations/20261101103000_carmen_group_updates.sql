-- Group updates to the client card (AIO-254).
--
-- Once a day (19:30 Asia/Jerusalem, a slot of the manager round, no new
-- cron) Carmen reads what was said in each client's WhatsApp group since the
-- last digest and, when it matters and nobody updated the card, drafts one
-- card entry (a card_stale_group finding). A staff member approves it with
-- "אשר <code>" in a private chat with Carmen, or, in team mode with
-- kinds.card_stale_group.card_write on, Carmen writes it herself. The card
-- entry goes through record_client_card_entry (source group_digest,
-- update_type group_summary, source_ref '<group_id>:<last_message_id>',
-- counts_as_contact false).
--
-- Nothing is sent or written by this migration.
--
-- 1. get_client_group_digest_messages: the recent messages of every WhatsApp
--    group linked to exactly one client whose card the tenant may write, as
--    stored by the lines the round passes (the tenant's monitored Green API
--    lines, the same lines AIO-252's chat collector reads).
-- 2. carmen_finding_role_of: who may act on a finding, for any person. The
--    findings feed's rule (carmen_finding_viewer_role, carmen_manager_is_owner,
--    AIO-251) now reads it for auth.uid(), so the feed and the "אשר <code>"
--    approval apply one rule: whoever sees a finding may approve its draft.
-- 3. carmen_finding_resolve_card_written: closes a live finding whose drafted
--    entry is now on the card, by a person the rule allows or by Carmen.
-- 4. carmen_round_llm_spend: copied verbatim from AIO-252
--    (20261027101000_carmen_chat_sla.sql), so whichever of the two lands
--    last leaves the same definition.
--
-- The new functions are service-role only; the two AIO-251 functions keep
-- their grants.
--
-- Indexes: none added; chat_messages is a hot webhook table. The reads are
-- written for idx_chat_messages_provider and idx_chat_messages_group;
-- supabase/ops/verify_carmen_group_updates_plans.sql checks their plans.

-- ─── 1. Linked group messages ───────────────────────────────────────────────

-- The newest p_per_group messages (returned oldest first) of every WhatsApp
-- group of the tenant linked to exactly one client, one row per group, as
-- stored by the lines p_connection_user_ids since p_since (never more than 7
-- days back). Direct chats never leave the function.
-- - Clients: the tenant's own and those of agencies shared with it
--   read_write (record_client_card_entry's rule), not ended or inactive.
-- - Links: clients.whatsapp_group_id, team_channel_whatsapp_links and
--   carmen_client_group_access (read only) of the tenant or tenants
--   related to it by agency_tenant_access, matched by group_chat_id. Only
--   links to a client in scope count, so another tenant's link to its own
--   client cannot make a group ambiguous. A group linked to two clients in
--   scope is skipped.
-- - One reader per group_chat_id (as get_client_thread_activity, AIO-252): a
--   group of another tenant's client is left to that tenant while its
--   p_collector run succeeded in the last 40 hours and read
--   (watermark.read_lines) a line with traffic in the same group.
-- - Groups the tenant or the line owner blocked are skipped. A message two
--   of the lines both stored (same Green idMessage) is returned once, as the
--   copy of the line that sent it.
-- - Senders leave only as phone_match_key. Both webhooks store a group
--   sender as digits; an @lid sender (Green senderData.sender, Manus
--   _group_author_raw) still stored as its LID digits is mapped through
--   wa_lid_map, and without a mapping its key is null and lid_unmapped true.
--   A message sent from AIOS also names its sender (sent_by, a user id).
-- - Each message carries the provider's id (Green idMessage, else the row
--   id) and each group its group_chat_id and its client's tenant, so a call
--   a message reports is recorded once per client however many tenants or
--   lines stored it, and only a login of the client's own tenant is named.
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
    WHERE c.status NOT IN ('ended', 'inactive')
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
           m.sent_by_user_id, m.message_text,
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

COMMENT ON FUNCTION public.get_client_group_digest_messages(uuid, uuid[], timestamptz, text, public.chat_provider, uuid[], integer) IS
  'Recent messages (newest p_per_group, oldest first) of each WhatsApp group linked to exactly one client whose card the tenant may write, as stored by the given lines; one reader per group_chat_id. Groups only; senders as phone_match_key. Service role only (AIO-254).';

-- ─── 2. Who may act on a finding ────────────────────────────────────────────

-- Owner level of p_user_id in a tenant: owner / agency_owner there, or a
-- super admin acting in that tenant. The acting tenant
-- (get_effective_tenant_id) belongs to the signed-in session, so the super
-- admin path holds only when p_user_id is the caller (auth.uid()).
CREATE OR REPLACE FUNCTION public.carmen_manager_is_owner_of(
  p_user_id uuid,
  p_tenant_id uuid
)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT coalesce(p_user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.user_roles AS ur
      WHERE ur.user_id = p_user_id
        AND ur.tenant_id = p_tenant_id
        AND ur.role IN ('owner', 'agency_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tenant_users AS tu
      WHERE tu.user_id = p_user_id
        AND tu.tenant_id = p_tenant_id
        AND tu.role IN ('owner', 'agency_owner')
    )
    OR (
      p_user_id = auth.uid()
      AND public.is_super_admin(p_user_id)
      AND public.get_effective_tenant_id() = p_tenant_id
    )
  ), false)
$$;

-- p_user_id's role for a finding: 'owner' (every finding of the tenant),
-- 'manager' (team manager of the finding's agency), 'campaigner' (a member of
-- the tenant assigned to the client today, Israel date) or NULL (no access).
CREATE OR REPLACE FUNCTION public.carmen_finding_role_of(
  p_user_id uuid,
  p_tenant_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_agency_id uuid DEFAULT NULL
)
RETURNS text
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
  )
  SELECT CASE
    WHEN public.carmen_manager_is_owner_of(p_user_id, p_tenant_id) THEN 'owner'
    WHEN p_agency_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM member WHERE role = 'team_manager')
      AND EXISTS (
        SELECT 1 FROM public.user_managed_agencies AS uma
        WHERE uma.user_id = p_user_id AND uma.agency_id = p_agency_id
      ) THEN 'manager'
    WHEN p_client_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM member)
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS p
        JOIN public.client_team AS ct ON ct.campaigner_id = p.campaigner_id
        WHERE p.id = p_user_id
          AND ct.client_id = p_client_id
          AND (ct.start_date IS NULL
            OR ct.start_date <= (now() AT TIME ZONE 'Asia/Jerusalem')::date)
          AND (ct.end_date IS NULL
            OR ct.end_date >= (now() AT TIME ZONE 'Asia/Jerusalem')::date)
      ) THEN 'campaigner'
  END
$$;

-- AIO-251's caller rules, now carmen_finding_role_of and
-- carmen_manager_is_owner_of for auth.uid(); signatures, grants and the RLS
-- policies that call them stay as they are.
CREATE OR REPLACE FUNCTION public.carmen_manager_is_owner(p_tenant_id uuid)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT public.carmen_manager_is_owner_of(auth.uid(), p_tenant_id)
$$;

CREATE OR REPLACE FUNCTION public.carmen_finding_viewer_role(
  p_tenant_id uuid,
  p_client_id uuid,
  p_agency_id uuid
)
RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT public.carmen_finding_role_of(auth.uid(), p_tenant_id, p_client_id, p_agency_id)
$$;

-- ─── 3. Close a finding whose draft is on the card ──────────────────────────

-- Resolves a live finding as fixed once its drafted entry (p_entry_id) is on
-- the finding client's card: by p_actor_user_id when a person approved it
-- (refused unless carmen_finding_role_of gives them a role for the finding),
-- by Carmen when NULL. The card is one per client, and
-- record_client_card_entry returns the entry already there even when another
-- tenant wrote it, so the entry is matched by client, not by its writer's
-- tenant. Planned messages are cancelled and the 'resolved' event names the
-- entry. False, with a NOTICE, when the finding is no longer live (a repeated
-- approval, or a person closed it first).
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
DECLARE
  v_client uuid;
  v_agency uuid;
BEGIN
  SELECT f.client_id, f.agency_id INTO v_client, v_agency
  FROM public.carmen_findings AS f
  WHERE f.id = p_finding_id AND f.tenant_id = p_tenant_id;

  IF p_actor_user_id IS NOT NULL AND public.carmen_finding_role_of(
    p_actor_user_id, p_tenant_id, v_client, v_agency) IS NULL THEN
    RAISE EXCEPTION 'actor_may_not_approve' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.carmen_findings AS f
    JOIN public.client_updates AS u ON u.client_id = f.client_id
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
    RAISE NOTICE 'carmen_finding_resolve_card_written: finding % is no longer live', p_finding_id;
    RETURN false;
  END IF;

  UPDATE public.carmen_finding_deliveries AS d
  SET status = 'cancelled'
  WHERE d.tenant_id = p_tenant_id AND d.finding_id = p_finding_id
    AND d.status = 'planned';

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

-- ─── 4. carmen_round_llm_spend ──────────────────────────────────────────────

-- project_month_usd: the project's LLM spend since p_month_start, the sum the
-- health probe guards (ai_usage_log, agent_action_log and marketing_runs of
-- every tenant), because the OpenAI key and its budget are project-wide
-- today (_shared/ai.ts resolveOpenAIKey). day_usd: the tenant round's own
-- spend (ai_usage_log sources starting with p_source_prefix) since
-- p_day_start. Only the two sums leave.
CREATE OR REPLACE FUNCTION public.carmen_round_llm_spend(
  p_tenant_id uuid,
  p_month_start timestamptz,
  p_day_start timestamptz,
  p_source_prefix text
)
RETURNS TABLE (project_month_usd numeric, day_usd numeric)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT
    (SELECT coalesce(sum(l.cost_usd), 0) FROM public.ai_usage_log AS l
      WHERE l.created_at >= p_month_start)
    + (SELECT coalesce(sum(a.cost_usd), 0) FROM public.agent_action_log AS a
      WHERE a.created_at >= p_month_start)
    + (SELECT coalesce(sum(r.cost_usd), 0) FROM public.marketing_runs AS r
      WHERE r.created_at >= p_month_start),
    (SELECT coalesce(sum(l.cost_usd), 0) FROM public.ai_usage_log AS l
      WHERE l.tenant_id = p_tenant_id
        AND l.created_at >= p_day_start
        AND left(l.source, length(p_source_prefix)) = p_source_prefix)
$$;

REVOKE ALL ON FUNCTION public.carmen_round_llm_spend(uuid, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_round_llm_spend(uuid, timestamptz, timestamptz, text)
  TO service_role;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_client_group_digest_messages(uuid, uuid[], timestamptz, text, public.chat_provider, uuid[], integer)',
    'public.carmen_finding_resolve_card_written(uuid, uuid, uuid, uuid)',
    'public.carmen_manager_is_owner_of(uuid, uuid)',
    'public.carmen_finding_role_of(uuid, uuid, uuid, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;
