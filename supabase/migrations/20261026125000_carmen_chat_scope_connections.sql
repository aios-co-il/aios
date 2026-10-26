-- AIO-231: Carmen's chat tools read WhatsApp rows with the service role, so
-- RLS does not limit them. They now apply the same connection rule as the Chat
-- page. That rule lived inline in get_chat_contacts; it moves into
-- chat_allowed_connection_user_ids, which run-ai-agent calls server-side.
-- get_chat_contacts is re-created with the same signature and body, except
-- that it calls the helper, so it returns the same rows as before
-- (supabase/functions/_shared/carmen/chat-scope-sql.test.mjs checks the body;
-- supabase/ops/verify_chat_allowed_connections.sql compares the helper with
-- the old inline rule on a live database).

-- Connection owners (tenant_integrations.user_id) whose WhatsApp threads this
-- user may read in this tenant: their own line, a line explicitly shared with
-- them, org-wide lines, and every line for a super admin. Returns an empty
-- array when either argument is NULL. Service role only.
CREATE OR REPLACE FUNCTION public.chat_allowed_connection_user_ids(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(DISTINCT owners.owner_id), ARRAY[]::uuid[])
  FROM (
    SELECT p_user_id AS owner_id
    UNION
    SELECT ti.user_id
    FROM public.tenant_integrations ti
    WHERE ti.tenant_id = p_tenant_id
      AND ti.user_id IS NOT NULL
      AND (
        COALESCE(public.is_super_admin(p_user_id), false)
        OR ti.user_id = p_user_id
        OR ti.connection_visibility = 'org'
        OR EXISTS (
          SELECT 1
          FROM public.integration_user_permissions iup
          WHERE iup.integration_id = ti.id
            AND iup.user_id = p_user_id
        )
      )
  ) owners
  WHERE p_tenant_id IS NOT NULL
    AND p_user_id IS NOT NULL
    AND owners.owner_id IS NOT NULL;
$$;

-- Owned by postgres like get_chat_contacts, which calls it with owner rights.
ALTER FUNCTION public.chat_allowed_connection_user_ids(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.chat_allowed_connection_user_ids(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_allowed_connection_user_ids(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.chat_allowed_connection_user_ids(uuid, uuid) IS
  'WhatsApp connection owners a user may read in a tenant (the get_chat_contacts rule). Service role only; used by Carmen chat tools (AIO-231).';

-- Same signature, return type and body as the baseline, except the inline
-- connection rule, which is now a call to the helper above. CREATE OR REPLACE
-- keeps the owner and the existing grants. get_chat_contacts runs as its owner
-- (postgres), so it may call the service-role-only helper.
CREATE OR REPLACE FUNCTION "public"."get_chat_contacts"("p_tenant_id" "uuid", "p_connection_user_ids" "uuid"[], "p_provider" "public"."chat_provider") RETURNS TABLE("contact_id" "uuid", "contact_type" "text", "name" "text", "contact_name" "text", "phone" "text", "email" "text", "agency_id" "uuid", "agency_name" "text", "unread_count" bigint, "last_message_at" timestamp with time zone, "is_blocked" boolean, "manychat_subscriber_id" "text", "active_chat_provider" "public"."chat_provider", "whatsapp_avatar_url" "text", "sender_phone" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_tenant_id uuid;
  current_user_id uuid;
  is_admin boolean;
  allowed_user_ids uuid[];
  user_ids uuid[];
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  is_admin := COALESCE(public.is_super_admin(current_user_id), false);
  current_tenant_id := public.get_user_tenant_id(current_user_id);

  -- Only a super admin may ask for a tenant other than their own.
  IF p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM current_tenant_id THEN
    IF NOT is_admin THEN
      RETURN;
    END IF;
    current_tenant_id := p_tenant_id;
  END IF;

  IF current_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Connection owners this caller may read: their own line, a line explicitly shared
  -- with them, and org-wide lines.
  allowed_user_ids := public.chat_allowed_connection_user_ids(current_tenant_id, current_user_id);

  user_ids := CASE
    WHEN p_connection_user_ids IS NULL THEN ARRAY[current_user_id]
    ELSE ARRAY(
      SELECT unnest(p_connection_user_ids)
      INTERSECT
      SELECT unnest(COALESCE(allowed_user_ids, ARRAY[current_user_id]))
    )
  END;

  IF array_length(user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT
      c.id AS contact_id,
      'client'::text AS contact_type,
      c.name AS name,
      c.contact_name AS contact_name,
      c.phone AS phone,
      c.email AS email,
      c.agency_id AS agency_id,
      a.name AS agency_name,
      COALESCE((
        SELECT COUNT(*)::bigint
        FROM public.chat_messages cm
        WHERE cm.client_id = c.id
          AND cm.direction = 'inbound'
          AND cm.read_at IS NULL
          AND cm.is_blocked = false
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
      ), 0) AS unread_count,
      (
        SELECT MAX(cm.created_at)
        FROM public.chat_messages cm
        WHERE cm.client_id = c.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      ) AS last_message_at,
      false AS is_blocked,
      c.manychat_subscriber_id AS manychat_subscriber_id,
      COALESCE(p_provider, (
        SELECT cm.provider
        FROM public.chat_messages cm
        WHERE cm.client_id = c.id
          AND cm.connection_user_id = ANY(user_ids)
          AND cm.is_blocked = false
        ORDER BY cm.created_at DESC
        LIMIT 1
      )) AS active_chat_provider,
      c.whatsapp_avatar_url AS whatsapp_avatar_url,
      c.phone AS sender_phone
    FROM public.clients c
    JOIN public.agencies a ON c.agency_id = a.id
    WHERE c.tenant_id = current_tenant_id
      AND EXISTS (
        SELECT 1
        FROM public.chat_messages cm
        WHERE cm.client_id = c.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_contacts bc
        WHERE bc.client_id = c.id
          AND bc.connection_user_id = current_user_id
          AND bc.tenant_id = current_tenant_id
      )

    UNION ALL

    SELECT
      l.id AS contact_id,
      'lead'::text AS contact_type,
      l.company_name AS name,
      l.contact_name AS contact_name,
      l.phone AS phone,
      l.email AS email,
      l.agency_id AS agency_id,
      a.name AS agency_name,
      COALESCE((
        SELECT COUNT(*)::bigint
        FROM public.chat_messages cm
        WHERE cm.lead_id = l.id
          AND cm.direction = 'inbound'
          AND cm.read_at IS NULL
          AND cm.is_blocked = false
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
      ), 0) AS unread_count,
      (
        SELECT MAX(cm.created_at)
        FROM public.chat_messages cm
        WHERE cm.lead_id = l.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      ) AS last_message_at,
      false AS is_blocked,
      l.manychat_subscriber_id AS manychat_subscriber_id,
      COALESCE(p_provider, (
        SELECT cm.provider
        FROM public.chat_messages cm
        WHERE cm.lead_id = l.id
          AND cm.connection_user_id = ANY(user_ids)
          AND cm.is_blocked = false
        ORDER BY cm.created_at DESC
        LIMIT 1
      )) AS active_chat_provider,
      l.whatsapp_avatar_url AS whatsapp_avatar_url,
      l.phone AS sender_phone
    FROM public.leads l
    LEFT JOIN public.agencies a ON l.agency_id = a.id
    WHERE l.tenant_id = current_tenant_id
      AND EXISTS (
        SELECT 1
        FROM public.chat_messages cm
        WHERE cm.lead_id = l.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_contacts bc
        WHERE bc.lead_id = l.id
          AND bc.connection_user_id = current_user_id
          AND bc.tenant_id = current_tenant_id
      )

    UNION ALL

    SELECT
      g.id AS contact_id,
      'group'::text AS contact_type,
      g.group_name AS name,
      NULL::text AS contact_name,
      NULL::text AS phone,
      NULL::text AS email,
      g.agency_id AS agency_id,
      a.name AS agency_name,
      COALESCE((
        SELECT COUNT(*)::bigint
        FROM public.chat_messages cm
        WHERE cm.group_id = g.id
          AND cm.direction = 'inbound'
          AND cm.read_at IS NULL
          AND cm.is_blocked = false
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
      ), 0) AS unread_count,
      (
        SELECT MAX(cm.created_at)
        FROM public.chat_messages cm
        WHERE cm.group_id = g.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      ) AS last_message_at,
      false AS is_blocked,
      NULL::text AS manychat_subscriber_id,
      COALESCE(p_provider, (
        SELECT cm.provider
        FROM public.chat_messages cm
        WHERE cm.group_id = g.id
          AND cm.connection_user_id = ANY(user_ids)
          AND cm.is_blocked = false
        ORDER BY cm.created_at DESC
        LIMIT 1
      )) AS active_chat_provider,
      g.whatsapp_avatar_url AS whatsapp_avatar_url,
      NULL::text AS sender_phone
    FROM public.whatsapp_groups g
    LEFT JOIN public.agencies a ON g.agency_id = a.id
    WHERE g.tenant_id = current_tenant_id
      AND g.is_blocked = false
      AND EXISTS (
        SELECT 1
        FROM public.chat_messages cm
        WHERE cm.group_id = g.id
          AND cm.connection_user_id = ANY(user_ids)
          AND (p_provider IS NULL OR cm.provider = p_provider)
          AND cm.is_blocked = false
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_contacts bc
        WHERE bc.group_id = g.id
          AND bc.connection_user_id = current_user_id
          AND bc.tenant_id = current_tenant_id
      )

    UNION ALL

    -- Threads with a number that is not linked to a client, lead or group yet.
    SELECT
      md5(cm.sender_phone)::uuid AS contact_id,
      'unknown'::text AS contact_type,
      COALESCE((array_agg(NULLIF(cm.sender_name, '') ORDER BY cm.created_at DESC))[1], cm.sender_phone, 'Unknown') AS name,
      NULL::text AS contact_name,
      cm.sender_phone AS phone,
      NULL::text AS email,
      NULL::uuid AS agency_id,
      NULL::text AS agency_name,
      COUNT(*) FILTER (
        WHERE cm.direction = 'inbound'
          AND cm.read_at IS NULL
          AND cm.is_blocked = false
      )::bigint AS unread_count,
      MAX(cm.created_at) AS last_message_at,
      false AS is_blocked,
      NULL::text AS manychat_subscriber_id,
      COALESCE(p_provider, (array_agg(cm.provider ORDER BY cm.created_at DESC))[1]) AS active_chat_provider,
      (array_agg((cm.raw_provider_data->>'senderProfileImage')::text ORDER BY cm.created_at DESC))[1] AS whatsapp_avatar_url,
      cm.sender_phone AS sender_phone
    FROM public.chat_messages cm
    WHERE cm.tenant_id = current_tenant_id
      AND cm.client_id IS NULL
      AND cm.lead_id IS NULL
      AND cm.group_id IS NULL
      AND cm.sender_phone IS NOT NULL
      AND cm.connection_user_id = ANY(user_ids)
      AND (p_provider IS NULL OR cm.provider = p_provider)
      AND cm.is_blocked = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_contacts bc
        WHERE bc.sender_phone = cm.sender_phone
          AND bc.connection_user_id = current_user_id
          AND bc.tenant_id = current_tenant_id
      )
    GROUP BY cm.sender_phone
  ) sub
  ORDER BY sub.last_message_at DESC NULLS LAST;
END;
$$;
