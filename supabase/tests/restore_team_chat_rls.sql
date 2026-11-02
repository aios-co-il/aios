-- Team chat access rules (20261102113300_restore_team_chat_rls): synthetic
-- tenants, people, channels and WhatsApp lines inside one transaction that is
-- rolled back. Personas: a channel admin (creator of the tenant's channels), a
-- channel member, a tenant member who is only in public channels, another
-- tenant's channel admin, a super admin acting in a tenant of their own, and
-- anon. Inserts use no RETURNING, so each INSERT policy decides on its own.
BEGIN;
DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_super_tenant uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_super uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  -- Private: admin and member. Public: admin, member and outsider. Side
  -- (public): member as admin, outsider; the admin is not in it. Foreign:
  -- the other tenant's channel.
  v_private uuid := gen_random_uuid();
  v_public uuid := gen_random_uuid();
  v_side uuid := gen_random_uuid();
  v_foreign uuid := gen_random_uuid();
  v_fixture_channels uuid[];
  v_new_channel uuid := gen_random_uuid();
  v_super_channel uuid := gen_random_uuid();
  v_member_line uuid;
  v_group uuid;
  v_member_group uuid;
  v_phone text := '9725' || lpad((floor(random() * 1e8))::bigint::text, 8, '0');
  v_member_phone text := '9726' || lpad((floor(random() * 1e8))::bigint::text, 8, '0');
  v_bridged uuid := gen_random_uuid();
  v_message uuid := gen_random_uuid();
  v_message_gone uuid := gen_random_uuid();
  v_file uuid := gen_random_uuid();
  v_file_gone uuid := gen_random_uuid();
  v_invite uuid := gen_random_uuid();
  v_link uuid := gen_random_uuid();
  v_category uuid := gen_random_uuid();
  v_category_gone uuid := gen_random_uuid();
  v_case text[];
  v_n integer;
BEGIN
  v_fixture_channels := ARRAY[v_private, v_public, v_side, v_foreign];

  -- ── Fixtures (as postgres) ──────────────────────────────────────────────
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-team-chat-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_admin, v_member, v_outsider, v_other, v_super]) AS u;
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_tenant, 'QA team chat', 'qa-team-chat-' || v_tag),
    (v_other_tenant, 'QA team chat other', 'qa-team-chat-other-' || v_tag),
    (v_super_tenant, 'QA team chat super', 'qa-team-chat-super-' || v_tag);
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_tenant, v_admin, 'member'), (v_tenant, v_member, 'member'),
    (v_tenant, v_outsider, 'member'), (v_other_tenant, v_other, 'member'),
    (v_super_tenant, v_super, 'owner');
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (v_admin, v_tenant), (v_member, v_tenant), (v_outsider, v_tenant),
    (v_other, v_other_tenant), (v_super, v_super_tenant);
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (v_super, 'super_admin', NULL);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_tenant, 'QA');
  INSERT INTO public.clients (id, tenant_id, agency_id, name, status)
  VALUES (v_client, v_tenant, v_agency, 'QA client', 'active');

  INSERT INTO public.team_channels (id, tenant_id, name, created_by, is_private) VALUES
    (v_private, v_tenant, 'QA private', v_admin, true),
    (v_public, v_tenant, 'QA public', v_admin, false),
    (v_side, v_tenant, 'QA side', v_member, false),
    (v_foreign, v_other_tenant, 'QA foreign', v_other, true);
  INSERT INTO public.team_channel_members (channel_id, user_id, role, tenant_id) VALUES
    (v_private, v_admin, 'admin', v_tenant), (v_private, v_member, 'member', v_tenant),
    (v_public, v_admin, 'admin', v_tenant), (v_public, v_member, 'member', v_tenant),
    (v_public, v_outsider, 'member', v_tenant),
    (v_side, v_member, 'admin', v_tenant), (v_side, v_outsider, 'member', v_tenant),
    (v_foreign, v_other, 'admin', v_other_tenant);

  -- WhatsApp lines of the admin and the member (private, not shared), a group
  -- and a direct chat on each, and one message green-api-webhook bridged into
  -- the private channel (service role, sender = the line's user).
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, user_id, connection_visibility, is_active)
  VALUES (v_tenant, 'green_api', v_admin, 'private', true);
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, user_id, connection_visibility, is_active)
  VALUES (v_tenant, 'green_api', v_member, 'private', true) RETURNING id INTO v_member_line;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-tc-' || v_tag || '@g.us', 'QA admin group') RETURNING id INTO v_group;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, 'qa-tc-m-' || v_tag || '@g.us', 'QA member group') RETURNING id INTO v_member_group;
  INSERT INTO public.chat_messages (tenant_id, provider, connection_user_id, direction, message_text, sender_phone, group_id)
  VALUES
    (v_tenant, 'green_api', v_admin, 'inbound', 'QA group', '972521111111', v_group),
    (v_tenant, 'green_api', v_member, 'inbound', 'QA member group', '972521111111', v_member_group),
    (v_tenant, 'green_api', v_admin, 'inbound', 'QA direct', v_phone, NULL),
    (v_tenant, 'green_api', v_member, 'inbound', 'QA member direct', v_member_phone, NULL);
  INSERT INTO public.team_messages (id, channel_id, tenant_id, sender_id, content) VALUES
    (v_bridged, v_private, v_tenant, v_admin, 'QA bridged from WhatsApp'),
    (gen_random_uuid(), v_public, v_tenant, v_admin, 'QA public message');
  INSERT INTO public.team_chat_files (tenant_id, channel_id, uploaded_by, file_name, file_url, client_id)
  VALUES (v_tenant, v_side, v_member, 'qa-side.pdf', 'https://example.invalid/s', v_client);
  INSERT INTO public.team_message_read_status (channel_id, user_id) VALUES (v_public, v_outsider);

  -- ── Channel admin ───────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SET LOCAL ROLE authenticated;

  -- Creates a channel and its members the way TeamChat does, removes the
  -- member, then deletes the channel.
  INSERT INTO public.team_channels (id, tenant_id, name, created_by, is_private)
  VALUES (v_new_channel, v_tenant, 'QA new', v_admin, true);
  INSERT INTO public.team_channel_members (channel_id, user_id, role, tenant_id) VALUES
    (v_new_channel, v_admin, 'admin', v_tenant), (v_new_channel, v_member, 'member', v_tenant);
  DELETE FROM public.team_channel_members WHERE channel_id = v_new_channel AND user_id = v_member;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'admin: a channel admin must remove a member of their channel'; END IF;
  DELETE FROM public.team_channels WHERE id = v_new_channel;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'admin: the creator must delete their channel'; END IF;

  UPDATE public.team_channels SET name = 'QA private renamed' WHERE id = v_private;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'admin: a channel admin must edit the channel'; END IF;
  UPDATE public.team_channel_members SET notify_enabled = false
  WHERE channel_id = v_private AND user_id = v_member;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'admin: a channel admin must edit member settings'; END IF;

  INSERT INTO public.team_channel_invites (id, channel_id, tenant_id, created_by)
  VALUES (v_invite, v_private, v_tenant, v_admin);
  UPDATE public.team_channel_invites SET is_active = false WHERE id = v_invite;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'admin: a channel admin must deactivate an invite'; END IF;
  -- Active again, so the outsider below would see it if active invites were readable by anyone.
  UPDATE public.team_channel_invites SET is_active = true WHERE id = v_invite;

  -- WhatsApp: a group and a direct chat on the admin's own line link; the
  -- member's line is not readable by the admin, so its chats do not.
  INSERT INTO public.team_channel_whatsapp_links (id, channel_id, tenant_id, whatsapp_group_id, display_name)
  VALUES (v_link, v_private, v_tenant, v_group, 'QA admin group');
  INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_chat_id, display_name)
  VALUES (v_private, v_tenant, v_phone || '@c.us', 'QA direct');
  UPDATE public.team_channel_whatsapp_links SET display_name = 'QA renamed', forward_files = false WHERE id = v_link;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'admin: a channel admin must edit a link'; END IF;
  IF NOT public.user_can_link_whatsapp_chat(v_private, v_tenant, v_group, NULL)
    OR public.user_can_link_whatsapp_chat(v_foreign, v_tenant, v_group, NULL)
    OR public.user_can_link_whatsapp_chat(v_private, v_other_tenant, v_group, NULL) THEN
    RAISE EXCEPTION 'admin: the link check must tie the channel and the link to the acting tenant';
  END IF;

  -- Files: uploads to both channels, one linked to the client like LinkFileToEntityDialog.
  INSERT INTO public.team_chat_files (id, tenant_id, channel_id, uploaded_by, file_name, file_url)
  VALUES (v_file, v_tenant, v_private, v_admin, 'qa-private.pdf', 'https://example.invalid/p');
  UPDATE public.team_chat_files SET client_id = v_client WHERE id = v_file;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'admin: the uploader must link their file to a client'; END IF;
  INSERT INTO public.team_chat_files (tenant_id, channel_id, uploaded_by, file_name, file_url, client_id)
  VALUES (v_tenant, v_public, v_admin, 'qa-public.pdf', 'https://example.invalid/g', v_client);
  INSERT INTO public.team_chat_files (id, tenant_id, channel_id, uploaded_by, file_name, file_url)
  VALUES (v_file_gone, v_tenant, v_public, v_admin, 'qa-gone.pdf', 'https://example.invalid/x');
  DELETE FROM public.team_chat_files WHERE id = v_file_gone;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'admin: the uploader must delete their file'; END IF;
  -- The client card (ClientLinkedFiles): the admin's two files, and the side
  -- channel's file although the admin is not in it (public channel).
  SELECT count(*) INTO v_n FROM public.team_chat_files WHERE tenant_id = v_tenant AND client_id = v_client;
  IF v_n <> 3 THEN RAISE EXCEPTION 'admin: sees % client files, expected 3', v_n; END IF;

  FOREACH v_case SLICE 1 IN ARRAY ARRAY[
    ['admin: linked a group of a line they cannot read', format(
      'INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_group_id) VALUES (%L, %L, %L)',
      v_private, v_tenant, v_member_group)],
    ['admin: linked a direct chat of a line they cannot read', format(
      'INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_chat_id) VALUES (%L, %L, %L)',
      v_private, v_tenant, v_member_phone || '@c.us')],
    ['admin: linked a chat no line carries', format(
      'INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_chat_id) VALUES (%L, %L, %L)',
      v_private, v_tenant, '972500000000@c.us')],
    ['admin: pointed a link at a group of a line they cannot read', format(
      'UPDATE public.team_channel_whatsapp_links SET whatsapp_group_id = %L WHERE id = %L', v_member_group, v_link)],
    -- No WHERE: the SELECT policy does not screen the new row, so the UPDATE policy's check decides alone.
    ['admin: moved invites to another tenant', format(
      'UPDATE public.team_channel_invites SET tenant_id = %L', v_other_tenant)],
    ['admin: moved channel members to another tenant', format(
      'UPDATE public.team_channel_members SET tenant_id = %L', v_other_tenant)],
    ['admin: moved their files to another tenant', format(
      'UPDATE public.team_chat_files SET tenant_id = %L', v_other_tenant)]
  ] LOOP
    BEGIN
      EXECUTE v_case[2];
      RAISE EXCEPTION '%', v_case[1];
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%row-level security%' THEN RAISE; END IF;
    END;
  END LOOP;

  FOREACH v_case SLICE 1 IN ARRAY ARRAY[
    ['admin: removed a member of a channel they do not administer', format(
      'DELETE FROM public.team_channel_members WHERE channel_id = %L AND user_id = %L', v_side, v_outsider)],
    ['admin: removed a member of another tenant''s channel', format(
      'DELETE FROM public.team_channel_members WHERE channel_id = %L', v_foreign)]
  ] LOOP
    EXECUTE v_case[2];
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 0 THEN RAISE EXCEPTION '%', v_case[1]; END IF;
  END LOOP;
  RESET ROLE;

  -- The member shares their line with the admin: now the admin may link its group.
  INSERT INTO public.integration_user_permissions (integration_id, user_id, granted_by)
  VALUES (v_member_line, v_admin, v_member);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_group_id)
  VALUES (v_private, v_tenant, v_member_group);
  DELETE FROM public.team_channel_whatsapp_links WHERE channel_id = v_private AND whatsapp_group_id = v_member_group;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'admin: a channel admin must remove a link'; END IF;
  RESET ROLE;

  -- ── Channel member ──────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM public.team_channels WHERE id = ANY (v_fixture_channels);
  IF v_n <> 3 THEN RAISE EXCEPTION 'member: sees % channels, expected their 3', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.team_channel_members WHERE channel_id = v_private;
  IF v_n <> 2 THEN RAISE EXCEPTION 'member: sees % members of their channel, expected 2', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_messages WHERE id = v_bridged) THEN
    RAISE EXCEPTION 'member: cannot read the WhatsApp message bridged into their channel';
  END IF;
  INSERT INTO public.team_messages (id, channel_id, tenant_id, sender_id, content)
  VALUES (v_message, v_private, v_tenant, v_member, 'QA member post');
  INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content, parent_message_id)
  VALUES (v_private, v_tenant, v_member, 'QA member reply', v_bridged);
  INSERT INTO public.team_messages (id, channel_id, tenant_id, sender_id, content)
  VALUES (v_message_gone, v_public, v_tenant, v_member, 'QA member public post');
  SELECT count(*) INTO v_n FROM public.team_messages WHERE channel_id = v_private;
  IF v_n <> 3 THEN RAISE EXCEPTION 'member: reads % messages in the private channel, expected 3', v_n; END IF;
  UPDATE public.team_messages SET content = 'QA member post (edited)', is_edited = true WHERE id = v_message;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'member: cannot edit their own message'; END IF;
  DELETE FROM public.team_messages WHERE id = v_message_gone;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'member: cannot delete their own message'; END IF;

  SELECT count(*) INTO v_n FROM public.team_channel_whatsapp_links WHERE channel_id = v_private;
  IF v_n <> 2 THEN RAISE EXCEPTION 'member: sees % links of their channel, expected 2', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_channel_invites WHERE id = v_invite) THEN
    RAISE EXCEPTION 'member: cannot see their channel''s invite link';
  END IF;
  SELECT count(*) INTO v_n FROM public.team_chat_files WHERE tenant_id = v_tenant AND client_id = v_client;
  IF v_n <> 3 THEN RAISE EXCEPTION 'member: sees % client files, expected 3', v_n; END IF;

  -- Read markers: own only, as TeamChat writes them.
  INSERT INTO public.team_message_read_status (channel_id, user_id) VALUES (v_private, v_member);
  INSERT INTO public.team_message_read_status (channel_id, user_id, last_read_message_id) VALUES (v_private, v_member, v_message)
  ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id;
  UPDATE public.team_message_read_status SET last_read_at = now() WHERE channel_id = v_private AND user_id = v_member;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'member: cannot move their own read marker'; END IF;
  -- No WHERE, so only the UPDATE policy limits the rows.
  UPDATE public.team_message_read_status SET last_read_at = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'member: moved % read markers, expected only their own', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.team_message_read_status
  WHERE user_id IN (v_member, v_outsider) AND channel_id IN (v_private, v_public);
  IF v_n <> 1 THEN RAISE EXCEPTION 'member: sees % read markers, expected only their own', v_n; END IF;

  INSERT INTO public.team_channel_categories (id, tenant_id, name) VALUES
    (v_category, v_tenant, 'QA category'), (v_category_gone, v_tenant, 'QA category to delete');
  UPDATE public.team_channel_categories SET sort_order = 1 WHERE id = v_category;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'member: cannot edit a category of their tenant'; END IF;
  DELETE FROM public.team_channel_categories WHERE id = v_category_gone;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'member: cannot delete a category of their tenant'; END IF;

  -- The member is admin of the side channel and owns their line: that link works.
  INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_group_id)
  VALUES (v_side, v_tenant, v_member_group);

  FOREACH v_case SLICE 1 IN ARRAY ARRAY[
    ['member: posted as someone else', format(
      'INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content) VALUES (%L, %L, %L, %L)',
      v_private, v_tenant, v_admin, 'QA spoofed')],
    ['member: moved their message into a channel they are not in', format(
      'UPDATE public.team_messages SET channel_id = %L WHERE id = %L', v_foreign, v_message)],
    ['member: moved their message to another tenant', format(
      'UPDATE public.team_messages SET tenant_id = %L WHERE id = %L', v_other_tenant, v_message)],
    ['member: created a channel as someone else', format(
      'INSERT INTO public.team_channels (tenant_id, name, created_by) VALUES (%L, %L, %L)', v_tenant, 'QA', v_admin)],
    ['member: created a channel in another tenant', format(
      'INSERT INTO public.team_channels (tenant_id, name, created_by) VALUES (%L, %L, %L)', v_other_tenant, 'QA', v_member)],
    ['member: added someone to a channel they do not administer', format(
      'INSERT INTO public.team_channel_members (channel_id, user_id, role, tenant_id) VALUES (%L, %L, %L, %L)',
      v_private, v_outsider, 'member', v_tenant)],
    ['member: linked their line''s group to a channel they do not administer', format(
      'INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_group_id) VALUES (%L, %L, %L)',
      v_private, v_tenant, v_member_group)],
    ['member: created an invite for a channel they do not administer', format(
      'INSERT INTO public.team_channel_invites (channel_id, tenant_id, created_by) VALUES (%L, %L, %L)',
      v_private, v_tenant, v_member)],
    ['member: wrote someone else''s read marker', format(
      'INSERT INTO public.team_message_read_status (channel_id, user_id) VALUES (%L, %L)', v_side, v_outsider)],
    ['member: handed their read markers to someone else (no WHERE: the UPDATE check decides)', format(
      'UPDATE public.team_message_read_status SET user_id = %L', v_outsider)],
    ['member: created a category in another tenant', format(
      'INSERT INTO public.team_channel_categories (tenant_id, name) VALUES (%L, %L)', v_other_tenant, 'QA')],
    ['member: moved a category to another tenant', format(
      'UPDATE public.team_channel_categories SET tenant_id = %L WHERE id = %L', v_other_tenant, v_category)],
    ['member: wrote to the unused reactions table', format(
      'INSERT INTO public.team_message_reactions (message_id, user_id, emoji) VALUES (%L, %L, %L)',
      v_message, v_member, 'x')]
  ] LOOP
    BEGIN
      EXECUTE v_case[2];
      RAISE EXCEPTION '%', v_case[1];
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%row-level security%' THEN RAISE; END IF;
    END;
  END LOOP;

  FOREACH v_case SLICE 1 IN ARRAY ARRAY[
    ['member: made themselves admin', format(
      'UPDATE public.team_channel_members SET role = %L WHERE channel_id = %L AND user_id = %L', 'admin', v_private, v_member)],
    ['member: edited a channel they neither administer nor created', format(
      'UPDATE public.team_channels SET name = %L WHERE id = %L', 'QA', v_private)],
    ['member: deleted a channel they did not create', format(
      'DELETE FROM public.team_channels WHERE id = %L', v_private)],
    ['member: edited someone else''s message', format(
      'UPDATE public.team_messages SET content = %L WHERE id = %L', 'QA', v_bridged)],
    ['member: deleted someone else''s message', format(
      'DELETE FROM public.team_messages WHERE id = %L', v_bridged)],
    ['member: edited a link of a channel they do not administer', format(
      'UPDATE public.team_channel_whatsapp_links SET display_name = %L WHERE id = %L', 'QA', v_link)],
    ['member: removed a link of a channel they do not administer', format(
      'DELETE FROM public.team_channel_whatsapp_links WHERE channel_id = %L', v_private)],
    ['member: deactivated an invite of a channel they do not administer', format(
      'UPDATE public.team_channel_invites SET is_active = false WHERE id = %L', v_invite)],
    ['member: edited someone else''s file', format(
      'UPDATE public.team_chat_files SET file_name = %L WHERE id = %L', 'QA', v_file)],
    ['member: deleted someone else''s file', format(
      'DELETE FROM public.team_chat_files WHERE id = %L', v_file)]
  ] LOOP
    EXECUTE v_case[2];
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 0 THEN RAISE EXCEPTION '%', v_case[1]; END IF;
  END LOOP;
  RESET ROLE;

  -- ── Tenant member outside the private channel ───────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM public.team_channels WHERE id = ANY (v_fixture_channels) AND NOT is_private;
  IF v_n <> 2 OR EXISTS (SELECT 1 FROM public.team_channels WHERE id = ANY (v_fixture_channels) AND is_private) THEN
    RAISE EXCEPTION 'outsider: must see their 2 public channels and no private one';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_messages WHERE channel_id = v_public)
    OR EXISTS (SELECT 1 FROM public.team_messages WHERE channel_id = v_private) THEN
    RAISE EXCEPTION 'outsider: must read the public channel and not the private one';
  END IF;
  -- The client card: both public-channel files, not the private one.
  SELECT count(*) INTO v_n FROM public.team_chat_files WHERE tenant_id = v_tenant AND client_id = v_client;
  IF v_n <> 2 OR EXISTS (SELECT 1 FROM public.team_chat_files WHERE channel_id = v_private) THEN
    RAISE EXCEPTION 'outsider: sees a private-channel file (% client files)', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.team_channel_whatsapp_links WHERE channel_id = v_private)
    OR EXISTS (SELECT 1 FROM public.team_channel_invites WHERE channel_id = v_private) THEN
    RAISE EXCEPTION 'outsider: sees the private channel''s links or invites';
  END IF;

  FOREACH v_case SLICE 1 IN ARRAY ARRAY[
    ['outsider: joined the private channel', format(
      'INSERT INTO public.team_channel_members (channel_id, user_id, role, tenant_id) VALUES (%L, %L, %L, %L)',
      v_private, v_outsider, 'member', v_tenant)],
    ['outsider: joined the private channel as admin', format(
      'INSERT INTO public.team_channel_members (channel_id, user_id, role, tenant_id) VALUES (%L, %L, %L, %L)',
      v_private, v_outsider, 'admin', v_tenant)],
    ['outsider: posted in the private channel', format(
      'INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content) VALUES (%L, %L, %L, %L)',
      v_private, v_tenant, v_outsider, 'QA')],
    ['outsider: recorded a file in the private channel', format(
      'INSERT INTO public.team_chat_files (tenant_id, channel_id, uploaded_by, file_name, file_url) VALUES (%L, %L, %L, %L, %L)',
      v_tenant, v_private, v_outsider, 'qa.pdf', 'https://example.invalid/o')]
  ] LOOP
    BEGIN
      EXECUTE v_case[2];
      RAISE EXCEPTION '%', v_case[1];
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%row-level security%' THEN RAISE; END IF;
    END;
  END LOOP;
  RESET ROLE;

  -- ── Another tenant's channel admin ──────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  SET LOCAL ROLE authenticated;

  IF EXISTS (SELECT 1 FROM public.team_channels WHERE tenant_id = v_tenant)
    OR EXISTS (SELECT 1 FROM public.team_channel_members WHERE tenant_id = v_tenant)
    OR EXISTS (SELECT 1 FROM public.team_messages WHERE tenant_id = v_tenant)
    OR EXISTS (SELECT 1 FROM public.team_chat_files WHERE tenant_id = v_tenant)
    OR EXISTS (SELECT 1 FROM public.team_channel_whatsapp_links WHERE tenant_id = v_tenant)
    OR EXISTS (SELECT 1 FROM public.team_channel_invites WHERE tenant_id = v_tenant)
    OR EXISTS (SELECT 1 FROM public.team_channel_categories WHERE tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'other tenant: sees team chat rows of another tenant';
  END IF;
  DELETE FROM public.team_channel_members WHERE channel_id = v_private;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'other tenant: a channel admin removed members across tenants'; END IF;
  BEGIN
    INSERT INTO public.team_channel_members (channel_id, user_id, role, tenant_id)
    VALUES (v_private, v_other, 'admin', v_tenant);
    RAISE EXCEPTION 'other tenant: joined another tenant''s channel';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%row-level security%' THEN RAISE; END IF;
  END;
  RESET ROLE;

  -- ── Super admin, acting in their own tenant ─────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_super::text, true);
  SET LOCAL ROLE authenticated;

  -- Reads every tenant.
  SELECT count(*) INTO v_n FROM public.team_channels WHERE id = ANY (v_fixture_channels);
  IF v_n <> 4 OR NOT EXISTS (SELECT 1 FROM public.team_messages WHERE id = v_bridged)
    OR NOT EXISTS (SELECT 1 FROM public.team_chat_files WHERE id = v_file)
    OR NOT EXISTS (SELECT 1 FROM public.team_channel_members WHERE channel_id = v_private)
    OR NOT EXISTS (SELECT 1 FROM public.team_channel_categories WHERE id = v_category)
    OR NOT EXISTS (SELECT 1 FROM public.team_channel_invites WHERE id = v_invite)
    OR NOT EXISTS (SELECT 1 FROM public.team_channel_whatsapp_links WHERE id = v_link) THEN
    RAISE EXCEPTION 'super admin: must read every tenant''s channels, members, messages, files, categories, invites and links';
  END IF;

  -- Writes in the tenant they act in, like any member.
  INSERT INTO public.team_channels (id, tenant_id, name, created_by) VALUES (v_super_channel, v_super_tenant, 'QA super', v_super);
  INSERT INTO public.team_channel_members (channel_id, user_id, role, tenant_id)
  VALUES (v_super_channel, v_super, 'admin', v_super_tenant);
  IF public.user_can_link_whatsapp_chat(v_private, v_tenant, v_group, NULL) THEN
    RAISE EXCEPTION 'super admin: the link check passed for a tenant they do not act in';
  END IF;

  -- Never writes into another tenant: insert, move, edit or delete.
  FOREACH v_case SLICE 1 IN ARRAY ARRAY[
    ['super admin: created a channel in another tenant', format(
      'INSERT INTO public.team_channels (tenant_id, name, created_by) VALUES (%L, %L, %L)', v_tenant, 'QA', v_super)],
    ['super admin: moved their channel to another tenant', format(
      'UPDATE public.team_channels SET tenant_id = %L WHERE id = %L', v_tenant, v_super_channel)],
    ['super admin: added a member in another tenant', format(
      'INSERT INTO public.team_channel_members (channel_id, user_id, role, tenant_id) VALUES (%L, %L, %L, %L)',
      v_private, v_super, 'admin', v_tenant)],
    ['super admin: created a category in another tenant', format(
      'INSERT INTO public.team_channel_categories (tenant_id, name) VALUES (%L, %L)', v_tenant, 'QA')],
    ['super admin: created an invite in another tenant', format(
      'INSERT INTO public.team_channel_invites (channel_id, tenant_id, created_by) VALUES (%L, %L, %L)',
      v_private, v_tenant, v_super)],
    ['super admin: linked a WhatsApp group in another tenant', format(
      'INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_group_id) VALUES (%L, %L, %L)',
      v_private, v_tenant, v_group)],
    ['super admin: recorded a file in another tenant', format(
      'INSERT INTO public.team_chat_files (tenant_id, channel_id, uploaded_by, file_name, file_url) VALUES (%L, %L, %L, %L, %L)',
      v_tenant, v_private, v_super, 'qa.pdf', 'https://example.invalid/sa')],
    ['super admin: posted in another tenant', format(
      'INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content) VALUES (%L, %L, %L, %L)',
      v_private, v_tenant, v_super, 'QA')]
  ] LOOP
    BEGIN
      EXECUTE v_case[2];
      RAISE EXCEPTION '%', v_case[1];
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%row-level security%' THEN RAISE; END IF;
    END;
  END LOOP;

  FOREACH v_case SLICE 1 IN ARRAY ARRAY[
    ['super admin: edited another tenant''s channel', format(
      'UPDATE public.team_channels SET description = %L WHERE id = %L', 'QA', v_private)],
    ['super admin: deleted another tenant''s channel', format(
      'DELETE FROM public.team_channels WHERE id = %L', v_private)],
    ['super admin: edited member settings in another tenant', format(
      'UPDATE public.team_channel_members SET notify_enabled = true WHERE channel_id = %L', v_private)],
    ['super admin: removed members in another tenant', format(
      'DELETE FROM public.team_channel_members WHERE channel_id = %L', v_private)],
    ['super admin: edited another tenant''s category', format(
      'UPDATE public.team_channel_categories SET name = %L WHERE id = %L', 'QA', v_category)],
    ['super admin: deleted another tenant''s category', format(
      'DELETE FROM public.team_channel_categories WHERE id = %L', v_category)],
    ['super admin: edited another tenant''s invite', format(
      'UPDATE public.team_channel_invites SET is_active = false WHERE id = %L', v_invite)],
    ['super admin: edited another tenant''s link', format(
      'UPDATE public.team_channel_whatsapp_links SET display_name = %L WHERE id = %L', 'QA', v_link)],
    ['super admin: removed another tenant''s link', format(
      'DELETE FROM public.team_channel_whatsapp_links WHERE id = %L', v_link)],
    ['super admin: edited another tenant''s file', format(
      'UPDATE public.team_chat_files SET file_name = %L WHERE id = %L', 'QA', v_file)],
    ['super admin: deleted another tenant''s file', format(
      'DELETE FROM public.team_chat_files WHERE id = %L', v_file)],
    ['super admin: edited another tenant''s message', format(
      'UPDATE public.team_messages SET content = %L WHERE id = %L', 'QA', v_bridged)],
    ['super admin: deleted another tenant''s message', format(
      'DELETE FROM public.team_messages WHERE id = %L', v_bridged)]
  ] LOOP
    EXECUTE v_case[2];
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 0 THEN RAISE EXCEPTION '%', v_case[1]; END IF;
  END LOOP;
  RESET ROLE;

  -- ── Leaving ─────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.team_channel_members WHERE channel_id = v_public AND user_id = v_member;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'member: cannot leave a channel'; END IF;
  RESET ROLE;

  -- ── Anon ────────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  IF EXISTS (SELECT 1 FROM public.team_channels)
    OR EXISTS (SELECT 1 FROM public.team_channel_members)
    OR EXISTS (SELECT 1 FROM public.team_channel_categories)
    OR EXISTS (SELECT 1 FROM public.team_channel_invites)
    OR EXISTS (SELECT 1 FROM public.team_channel_whatsapp_links)
    OR EXISTS (SELECT 1 FROM public.team_chat_files)
    OR EXISTS (SELECT 1 FROM public.team_message_attachments)
    OR EXISTS (SELECT 1 FROM public.team_message_reactions)
    OR EXISTS (SELECT 1 FROM public.team_message_read_status)
    OR EXISTS (SELECT 1 FROM public.team_messages) THEN
    RAISE EXCEPTION 'anon: reads team chat rows';
  END IF;
  BEGIN
    INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content)
    VALUES (v_public, v_tenant, v_admin, 'QA anon');
    RAISE EXCEPTION 'anon: posted a message';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%row-level security%' THEN RAISE; END IF;
  END;
  RESET ROLE;

  -- ── Grants of the helpers ───────────────────────────────────────────────
  IF has_function_privilege('anon', 'public.is_channel_admin(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.is_public_team_channel(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.user_can_link_whatsapp_chat(uuid,uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.is_channel_admin(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.is_public_team_channel(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.user_can_link_whatsapp_chat(uuid,uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.is_channel_admin(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.is_public_team_channel(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.user_can_link_whatsapp_chat(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: the helpers must run for authenticated and service_role, not anon';
  END IF;
END;
$test$;
SELECT 'Team chat: members, admins, outsiders, other tenants, super admins and anon passed' AS result;
ROLLBACK;
