-- Restore the team chat access rules.
--
-- The ten team chat tables have row-level security on and no policies in
-- Production and Staging (the baseline came without them). Signed-in users
-- therefore see no channels or messages, and every save from TeamChat fails.
-- The service role bypasses RLS, so green-api-webhook still inserts WhatsApp
-- messages into team_messages and needs no policy; after this migration the
-- channel's members can read them.
--
-- The rules follow the app (every tenant member has team chat; content is
-- scoped by channel membership; channel settings belong to the channel's
-- admins) and are narrower than the lost originals:
-- - Writes happen only in the tenant the user acts in (get_user_tenant_id).
--   A super admin reads every tenant but writes like any member of the tenant
--   they act in (TENANT_ISOLATION.md); the originals let a super admin edit
--   channels, members and files of any tenant.
-- - team_channel_members: only a channel admin or the channel's creator adds
--   members. The original let anyone join any channel, private ones included.
-- - team_channel_members: an admin removes or edits members of their own
--   channel only. The original compared a column with itself, so an admin of
--   any channel could remove the members of every channel.
-- - team_channels: channel admins edit a channel. The original's admin check
--   never matched, so only super admins could.
-- - team_chat_files: files of a private channel are visible to its members
--   (and the uploader) only, client cards included. Files of public channels
--   stay visible to the tenant, as before.
-- - team_channel_whatsapp_links: members read the channel's links; only the
--   channel's admin links a WhatsApp group or chat, and only one carried by a
--   WhatsApp line they may read (the Chat page's rule,
--   chat_allowed_connection_user_ids). The original let any member bridge any
--   of the tenant's chats into their channel.
-- - team_channel_invites: channel members read their channel's invites; the
--   original let anyone, anon included, list every active token. The invite
--   page reads one token through get_channel_invite_by_token.
-- - team_chat_files and team_messages: only channel members add rows to a
--   channel.
-- - team_message_attachments and team_message_reactions are unused (files
--   live in team_messages.attachments) and stay without policies.
--
-- Policies that check a channel admin call is_channel_admin (SECURITY
-- DEFINER, like is_channel_member) instead of querying team_channel_members:
-- a policy on team_channel_members that reads its own table is reported as
-- infinite recursion once that table's SELECT policy has a subquery, and
-- (select auth.uid()) is one.
--
-- No data changes. Every policy is dropped first, so the migration can run
-- again.

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- True when the user is an admin of the channel in their active tenant (is_channel_member's counterpart).
CREATE OR REPLACE FUNCTION public.is_channel_admin(p_channel_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_channel_members m
    WHERE m.channel_id = p_channel_id
      AND m.user_id = p_user_id
      AND m.role = 'admin'
      AND m.tenant_id = public.get_user_tenant_id(p_user_id)
  );
$$;

-- True when the channel is a public channel of the user's active tenant (non-members cannot read the row).
CREATE OR REPLACE FUNCTION public.is_public_team_channel(p_channel_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_channels c
    WHERE c.id = p_channel_id
      AND NOT COALESCE(c.is_private, false)
      AND c.tenant_id = public.get_user_tenant_id(p_user_id)
  );
$$;

-- True when the channel and the link are in the caller's active tenant and a line the caller
-- may read there (chat_allowed_connection_user_ids) has carried this group or chat id.
CREATE OR REPLACE FUNCTION public.user_can_link_whatsapp_chat(
  p_channel_id uuid,
  p_tenant_id uuid,
  p_whatsapp_group_id uuid,
  p_whatsapp_chat_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_lines uuid[];
BEGIN
  IF v_user IS NULL OR p_tenant_id IS NULL
     OR (p_whatsapp_group_id IS NULL AND COALESCE(p_whatsapp_chat_id, '') = '') THEN
    RETURN false;
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.get_user_tenant_id(v_user)
     OR NOT EXISTS (
       SELECT 1 FROM public.team_channels c WHERE c.id = p_channel_id AND c.tenant_id = p_tenant_id
     ) THEN
    RETURN false;
  END IF;

  v_lines := public.chat_allowed_connection_user_ids(p_tenant_id, v_user);

  IF p_whatsapp_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.whatsapp_groups g
    JOIN public.chat_messages cm ON cm.group_id = g.id
    WHERE g.id = p_whatsapp_group_id
      AND g.tenant_id = p_tenant_id
      AND cm.tenant_id = p_tenant_id
      AND cm.connection_user_id = ANY (v_lines)
  ) THEN
    RETURN false;
  END IF;

  IF COALESCE(p_whatsapp_chat_id, '') <> '' AND NOT EXISTS (
    SELECT 1
    FROM public.chat_messages cm
    WHERE cm.tenant_id = p_tenant_id
      AND cm.connection_user_id = ANY (v_lines)
      AND (
        (cm.group_id IS NULL AND cm.sender_phone = split_part(p_whatsapp_chat_id, '@', 1))
        OR cm.group_id IN (
          SELECT g.id
          FROM public.whatsapp_groups g
          WHERE g.tenant_id = p_tenant_id
            AND g.group_chat_id = p_whatsapp_chat_id
        )
      )
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

ALTER FUNCTION public.is_channel_admin(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.is_public_team_channel(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.user_can_link_whatsapp_chat(uuid, uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_channel_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_public_team_channel(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_can_link_whatsapp_chat(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
-- The policies below run as the signed-in user, so authenticated calls them.
GRANT EXECUTE ON FUNCTION public.is_channel_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_public_team_channel(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_link_whatsapp_chat(uuid, uuid, uuid, text) TO authenticated, service_role;

-- ─── team_channels ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS team_channels_select ON public.team_channels;
DROP POLICY IF EXISTS team_channels_insert ON public.team_channels;
DROP POLICY IF EXISTS team_channels_update ON public.team_channels;
DROP POLICY IF EXISTS team_channels_delete ON public.team_channels;

-- Members and the creator see a channel of their tenant; super admins read every tenant's.
CREATE POLICY team_channels_select ON public.team_channels FOR SELECT TO authenticated
  USING (
    (tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
      AND (public.is_channel_member(id, (SELECT auth.uid())) OR created_by = (SELECT auth.uid())))
    OR public.is_super_admin((SELECT auth.uid()))
  );

-- A member creates a channel in their tenant as its creator.
CREATE POLICY team_channels_insert ON public.team_channels FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND created_by = (SELECT auth.uid()));

-- Channel admins edit their channel; it stays in the tenant.
CREATE POLICY team_channels_update ON public.team_channels FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND public.is_channel_admin(id, (SELECT auth.uid())))
  WITH CHECK (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND public.is_channel_admin(id, (SELECT auth.uid())));

-- The creator deletes their channel in their tenant (members, messages and links cascade).
CREATE POLICY team_channels_delete ON public.team_channels FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND created_by = (SELECT auth.uid()));

-- ─── team_channel_members ───────────────────────────────────────────────────

DROP POLICY IF EXISTS team_channel_members_select ON public.team_channel_members;
DROP POLICY IF EXISTS team_channel_members_insert ON public.team_channel_members;
DROP POLICY IF EXISTS team_channel_members_update ON public.team_channel_members;
DROP POLICY IF EXISTS team_channel_members_delete ON public.team_channel_members;

-- Tenant members see who is in which channel; super admins read every tenant's.
CREATE POLICY team_channel_members_select ON public.team_channel_members FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) OR public.is_super_admin((SELECT auth.uid())));

-- A channel admin or the channel's creator adds members in their tenant (no self-join).
CREATE POLICY team_channel_members_insert ON public.team_channel_members FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
    AND (
      public.is_channel_admin(channel_id, (SELECT auth.uid()))
      OR EXISTS (
        SELECT 1
        FROM public.team_channels c
        WHERE c.id = team_channel_members.channel_id
          AND c.tenant_id = team_channel_members.tenant_id
          AND c.created_by = (SELECT auth.uid())
      )
    )
  );

-- Channel admins edit member settings; admin-only so a member cannot make themselves admin.
CREATE POLICY team_channel_members_update ON public.team_channel_members FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND public.is_channel_admin(channel_id, (SELECT auth.uid())))
  WITH CHECK (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND public.is_channel_admin(channel_id, (SELECT auth.uid())));

-- A member leaves, or an admin removes members of their own channel, in their tenant.
CREATE POLICY team_channel_members_delete ON public.team_channel_members FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
    AND (user_id = (SELECT auth.uid()) OR public.is_channel_admin(channel_id, (SELECT auth.uid())))
  );

-- ─── team_channel_categories ────────────────────────────────────────────────

DROP POLICY IF EXISTS team_channel_categories_select ON public.team_channel_categories;
DROP POLICY IF EXISTS team_channel_categories_write ON public.team_channel_categories;

-- Tenant members see their tenant's channel categories; super admins read every tenant's.
CREATE POLICY team_channel_categories_select ON public.team_channel_categories FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) OR public.is_super_admin((SELECT auth.uid())));

-- Tenant members manage their tenant's channel categories.
CREATE POLICY team_channel_categories_write ON public.team_channel_categories FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())))
  WITH CHECK (tenant_id = public.get_user_tenant_id((SELECT auth.uid())));

-- ─── team_channel_invites ───────────────────────────────────────────────────

DROP POLICY IF EXISTS team_channel_invites_select ON public.team_channel_invites;
DROP POLICY IF EXISTS team_channel_invites_insert ON public.team_channel_invites;
DROP POLICY IF EXISTS team_channel_invites_update ON public.team_channel_invites;

-- Channel members see the channel's invite links; super admins read every tenant's.
CREATE POLICY team_channel_invites_select ON public.team_channel_invites FOR SELECT TO authenticated
  USING (
    (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND public.is_channel_member(channel_id, (SELECT auth.uid())))
    OR public.is_super_admin((SELECT auth.uid()))
  );

-- A channel admin creates an invite link for their channel, as its creator.
CREATE POLICY team_channel_invites_insert ON public.team_channel_invites FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
    AND created_by = (SELECT auth.uid())
    AND public.is_channel_admin(channel_id, (SELECT auth.uid()))
  );

-- A channel admin deactivates their channel's invite links.
CREATE POLICY team_channel_invites_update ON public.team_channel_invites FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND public.is_channel_admin(channel_id, (SELECT auth.uid())))
  WITH CHECK (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND public.is_channel_admin(channel_id, (SELECT auth.uid())));

-- ─── team_channel_whatsapp_links ────────────────────────────────────────────

DROP POLICY IF EXISTS team_channel_whatsapp_links_select ON public.team_channel_whatsapp_links;
DROP POLICY IF EXISTS team_channel_whatsapp_links_insert ON public.team_channel_whatsapp_links;
DROP POLICY IF EXISTS team_channel_whatsapp_links_update ON public.team_channel_whatsapp_links;
DROP POLICY IF EXISTS team_channel_whatsapp_links_delete ON public.team_channel_whatsapp_links;

-- Channel members see which WhatsApp chats feed the channel; super admins read every tenant's.
CREATE POLICY team_channel_whatsapp_links_select ON public.team_channel_whatsapp_links FOR SELECT TO authenticated
  USING (
    (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND public.is_channel_member(channel_id, (SELECT auth.uid())))
    OR public.is_super_admin((SELECT auth.uid()))
  );

-- The channel's admin links a WhatsApp group or chat of their tenant carried by a line they may read.
CREATE POLICY team_channel_whatsapp_links_insert ON public.team_channel_whatsapp_links FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
    AND public.is_channel_admin(channel_id, (SELECT auth.uid()))
    AND public.user_can_link_whatsapp_chat(channel_id, tenant_id, whatsapp_group_id, whatsapp_chat_id)
  );

-- The channel's admin edits a link; the new target needs the same line access.
CREATE POLICY team_channel_whatsapp_links_update ON public.team_channel_whatsapp_links FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND public.is_channel_admin(channel_id, (SELECT auth.uid())))
  WITH CHECK (
    tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
    AND public.is_channel_admin(channel_id, (SELECT auth.uid()))
    AND public.user_can_link_whatsapp_chat(channel_id, tenant_id, whatsapp_group_id, whatsapp_chat_id)
  );

-- The channel's admin removes a link.
CREATE POLICY team_channel_whatsapp_links_delete ON public.team_channel_whatsapp_links FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND public.is_channel_admin(channel_id, (SELECT auth.uid())));

-- ─── team_chat_files ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS team_chat_files_select ON public.team_chat_files;
DROP POLICY IF EXISTS team_chat_files_insert ON public.team_chat_files;
DROP POLICY IF EXISTS team_chat_files_update ON public.team_chat_files;
DROP POLICY IF EXISTS team_chat_files_delete ON public.team_chat_files;

-- Tenant members see public-channel files; private-channel files only members and the uploader; super admins all.
CREATE POLICY team_chat_files_select ON public.team_chat_files FOR SELECT TO authenticated
  USING (
    (tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
      AND (
        public.is_public_team_channel(channel_id, (SELECT auth.uid()))
        OR public.is_channel_member(channel_id, (SELECT auth.uid()))
        OR uploaded_by = (SELECT auth.uid())
      ))
    OR public.is_super_admin((SELECT auth.uid()))
  );

-- A channel member records a file they upload to the channel.
CREATE POLICY team_chat_files_insert ON public.team_chat_files FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
    AND uploaded_by = (SELECT auth.uid())
    AND public.is_channel_member(channel_id, (SELECT auth.uid()))
  );

-- The uploader edits their file record in their tenant, e.g. links it to a client.
CREATE POLICY team_chat_files_update ON public.team_chat_files FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND uploaded_by = (SELECT auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND uploaded_by = (SELECT auth.uid()));

-- The uploader deletes their file record in their tenant.
CREATE POLICY team_chat_files_delete ON public.team_chat_files FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((SELECT auth.uid())) AND uploaded_by = (SELECT auth.uid()));

-- ─── team_message_read_status ───────────────────────────────────────────────

DROP POLICY IF EXISTS team_message_read_status_select ON public.team_message_read_status;
DROP POLICY IF EXISTS team_message_read_status_insert ON public.team_message_read_status;
DROP POLICY IF EXISTS team_message_read_status_update ON public.team_message_read_status;

-- A user reads their own read markers.
CREATE POLICY team_message_read_status_select ON public.team_message_read_status FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- A user records their own read marker.
CREATE POLICY team_message_read_status_insert ON public.team_message_read_status FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- A user moves their own read marker.
CREATE POLICY team_message_read_status_update ON public.team_message_read_status FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ─── team_messages ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS team_messages_select ON public.team_messages;
DROP POLICY IF EXISTS team_messages_insert ON public.team_messages;
DROP POLICY IF EXISTS team_messages_update ON public.team_messages;
DROP POLICY IF EXISTS team_messages_delete ON public.team_messages;

-- Channel members read the channel's messages (WhatsApp-bridged ones included); super admins all.
CREATE POLICY team_messages_select ON public.team_messages FOR SELECT TO authenticated
  USING (public.is_channel_member(channel_id, (SELECT auth.uid())) OR public.is_super_admin((SELECT auth.uid())));

-- A channel member posts in the channel as themselves, in their tenant.
CREATE POLICY team_messages_insert ON public.team_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
    AND public.is_channel_member(channel_id, (SELECT auth.uid()))
  );

-- The sender edits their message in their tenant; it stays theirs and in a channel they belong to.
CREATE POLICY team_messages_update ON public.team_messages FOR UPDATE TO authenticated
  USING (sender_id = (SELECT auth.uid()) AND tenant_id = public.get_user_tenant_id((SELECT auth.uid())))
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
    AND public.is_channel_member(channel_id, (SELECT auth.uid()))
  );

-- The sender deletes their message in their tenant.
CREATE POLICY team_messages_delete ON public.team_messages FOR DELETE TO authenticated
  USING (sender_id = (SELECT auth.uid()) AND tenant_id = public.get_user_tenant_id((SELECT auth.uid())));

-- ─── Check ──────────────────────────────────────────────────────────────────

-- Fails the migration unless the ten tables carry exactly the policies above, each TO authenticated only
-- (permissive policies OR together, so a leftover policy would widen access).
DO $$
DECLARE
  v_expected text[] := ARRAY[
    'team_channels.team_channels_select', 'team_channels.team_channels_insert',
    'team_channels.team_channels_update', 'team_channels.team_channels_delete',
    'team_channel_members.team_channel_members_select', 'team_channel_members.team_channel_members_insert',
    'team_channel_members.team_channel_members_update', 'team_channel_members.team_channel_members_delete',
    'team_channel_categories.team_channel_categories_select', 'team_channel_categories.team_channel_categories_write',
    'team_channel_invites.team_channel_invites_select', 'team_channel_invites.team_channel_invites_insert',
    'team_channel_invites.team_channel_invites_update',
    'team_channel_whatsapp_links.team_channel_whatsapp_links_select',
    'team_channel_whatsapp_links.team_channel_whatsapp_links_insert',
    'team_channel_whatsapp_links.team_channel_whatsapp_links_update',
    'team_channel_whatsapp_links.team_channel_whatsapp_links_delete',
    'team_chat_files.team_chat_files_select', 'team_chat_files.team_chat_files_insert',
    'team_chat_files.team_chat_files_update', 'team_chat_files.team_chat_files_delete',
    'team_message_read_status.team_message_read_status_select',
    'team_message_read_status.team_message_read_status_insert',
    'team_message_read_status.team_message_read_status_update',
    'team_messages.team_messages_select', 'team_messages.team_messages_insert',
    'team_messages.team_messages_update', 'team_messages.team_messages_delete'
  ];
  v_tables text[] := ARRAY[
    'team_channels', 'team_channel_members', 'team_channel_categories', 'team_channel_invites',
    'team_channel_whatsapp_links', 'team_chat_files', 'team_message_attachments',
    'team_message_reactions', 'team_message_read_status', 'team_messages'
  ];
  v_missing text[];
  v_unexpected text[];
  v_wide text;
BEGIN
  SELECT
    ARRAY(SELECT unnest(v_expected) EXCEPT
          SELECT p.tablename || '.' || p.policyname FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = ANY (v_tables)),
    ARRAY(SELECT p.tablename || '.' || p.policyname FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = ANY (v_tables)
          EXCEPT SELECT unnest(v_expected))
  INTO v_missing, v_unexpected;
  IF cardinality(v_missing) > 0 OR cardinality(v_unexpected) > 0 THEN
    RAISE EXCEPTION 'restore_team_chat_rls: missing policies %, unexpected policies %', v_missing, v_unexpected;
  END IF;

  SELECT string_agg(p.tablename || '.' || p.policyname, ', ')
  INTO v_wide
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = ANY (v_tables) AND p.roles <> ARRAY['authenticated']::name[];
  IF v_wide IS NOT NULL THEN
    RAISE EXCEPTION 'restore_team_chat_rls: policies not limited to authenticated: %', v_wide;
  END IF;
END;
$$;
