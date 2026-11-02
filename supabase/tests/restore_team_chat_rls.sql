-- Team chat access rules (20261102101000_restore_team_chat_rls): synthetic
-- tenants, people, channels and WhatsApp lines inside one transaction that is
-- rolled back. Personas: a channel admin (creator of the tenant's channels), a
-- channel member, a tenant member who is only in public channels, another
-- tenant's channel admin, a super admin and anon.
BEGIN;
DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
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
  v_member_line uuid;
  v_group uuid;
  v_member_group uuid;
  v_phone text := '9725' || lpad((floor(random() * 1e8))::bigint::text, 8, '0');
  v_member_phone text := '9726' || lpad((floor(random() * 1e8))::bigint::text, 8, '0');
  v_bridged uuid;
  v_new_channel uuid;
  v_message uuid;
  v_file uuid;
  v_invite text;
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
    (v_other_tenant, 'QA team chat other', 'qa-team-chat-other-' || v_tag);
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_tenant, v_admin, 'member'), (v_tenant, v_member, 'member'),
    (v_tenant, v_outsider, 'member'), (v_other_tenant, v_other, 'member');
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (v_admin, v_tenant), (v_member, v_tenant), (v_outsider, v_tenant), (v_other, v_other_tenant);
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
  INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content) VALUES
    (v_private, v_tenant, v_admin, 'QA bridged from WhatsApp') RETURNING id INTO v_bridged;
  INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content) VALUES
    (v_public, v_tenant, v_admin, 'QA public message');
  INSERT INTO public.team_chat_files (tenant_id, channel_id, uploaded_by, file_name, file_url, client_id)
  VALUES (v_tenant, v_side, v_member, 'qa-side.pdf', 'https://example.invalid/s', v_client);

  -- ── Channel admin ───────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SET LOCAL ROLE authenticated;

  -- Creates a channel and its members the way TeamChat does, then deletes it.
  INSERT INTO public.team_channels (tenant_id, name, created_by, is_private)
  VALUES (v_tenant, 'QA new', v_admin, true) RETURNING id INTO v_new_channel;
  INSERT INTO public.team_channel_members (channel_id, user_id, role, tenant_id) VALUES
    (v_new_channel, v_admin, 'admin', v_tenant), (v_new_channel, v_member, 'member', v_tenant);
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

  DELETE FROM public.team_channel_members WHERE channel_id = v_side AND user_id = v_outsider;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'admin: removed a member of a channel they do not administer'; END IF;
  DELETE FROM public.team_channel_members WHERE channel_id = v_foreign;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'admin: removed a member of another tenant''s channel'; END IF;

  INSERT INTO public.team_channel_invites (channel_id, tenant_id, created_by)
  VALUES (v_private, v_tenant, v_admin) RETURNING token INTO v_invite;

  -- WhatsApp: a group and a direct chat on the admin's own line link; the
  -- member's line is not readable by the admin, so its chats do not.
  INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_group_id, display_name)
  VALUES (v_private, v_tenant, v_group, 'QA admin group');
  INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_chat_id, display_name)
  VALUES (v_private, v_tenant, v_phone || '@c.us', 'QA direct');
  FOREACH v_case SLICE 1 IN ARRAY ARRAY[
    ['admin: linked a group of a line they cannot read', format(
      'INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_group_id) VALUES (%L, %L, %L)',
      v_private, v_tenant, v_member_group)],
    ['admin: linked a direct chat of a line they cannot read', format(
      'INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_chat_id) VALUES (%L, %L, %L)',
      v_private, v_tenant, v_member_phone || '@c.us')],
    ['admin: linked a chat no line carries', format(
      'INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_chat_id) VALUES (%L, %L, %L)',
      v_private, v_tenant, '972500000000@c.us')]
  ] LOOP
    BEGIN
      EXECUTE v_case[2];
      RAISE EXCEPTION '%', v_case[1];
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%row-level security%' THEN RAISE; END IF;
    END;
  END LOOP;

  -- Files: uploads to both channels, linked to the client like LinkFileToEntityDialog.
  INSERT INTO public.team_chat_files (tenant_id, channel_id, uploaded_by, file_name, file_url)
  VALUES (v_tenant, v_private, v_admin, 'qa-private.pdf', 'https://example.invalid/p') RETURNING id INTO v_file;
  UPDATE public.team_chat_files SET client_id = v_client WHERE id = v_file;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'admin: the uploader must link their file to a client'; END IF;
  INSERT INTO public.team_chat_files (tenant_id, channel_id, uploaded_by, file_name, file_url, client_id)
  VALUES (v_tenant, v_public, v_admin, 'qa-public.pdf', 'https://example.invalid/g', v_client);
  -- The client card (ClientLinkedFiles): the admin's two files, and the side
  -- channel's file although the admin is not in it (public channel).
  SELECT count(*) INTO v_n FROM public.team_chat_files WHERE tenant_id = v_tenant AND client_id = v_client;
  IF v_n <> 3 THEN RAISE EXCEPTION 'admin: sees % client files, expected 3', v_n; END IF;
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
  IF NOT EXISTS (SELECT 1 FROM public.team_messages WHERE id = v_bridged) THEN
    RAISE EXCEPTION 'member: cannot read the WhatsApp message bridged into their channel';
  END IF;
  INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content)
  VALUES (v_private, v_tenant, v_member, 'QA member post') RETURNING id INTO v_message;
  INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content, parent_message_id)
  VALUES (v_private, v_tenant, v_member, 'QA member reply', v_bridged);
  INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content)
  VALUES (v_public, v_tenant, v_member, 'QA member public post');
  SELECT count(*) INTO v_n FROM public.team_messages WHERE channel_id = v_private;
  IF v_n <> 3 THEN RAISE EXCEPTION 'member: reads % messages in the private channel, expected 3', v_n; END IF;
  UPDATE public.team_messages SET content = 'QA member post (edited)', is_edited = true WHERE id = v_message;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'member: cannot edit their own message'; END IF;

  SELECT count(*) INTO v_n FROM public.team_channel_whatsapp_links WHERE channel_id = v_private;
  IF v_n <> 2 THEN RAISE EXCEPTION 'member: sees % links of their channel, expected 2', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_channel_invites WHERE token = v_invite) THEN
    RAISE EXCEPTION 'member: cannot see their channel''s invite link';
  END IF;
  SELECT count(*) INTO v_n FROM public.team_chat_files WHERE tenant_id = v_tenant AND client_id = v_client;
  IF v_n <> 3 THEN RAISE EXCEPTION 'member: sees % client files, expected 3', v_n; END IF;

  INSERT INTO public.team_message_read_status (channel_id, user_id) VALUES (v_private, v_member)
  ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at;
  INSERT INTO public.team_message_read_status (channel_id, user_id, last_read_message_id) VALUES (v_private, v_member, v_message)
  ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id;
  INSERT INTO public.team_channel_categories (tenant_id, name) VALUES (v_tenant, 'QA category');

  UPDATE public.team_channel_members SET role = 'admin' WHERE channel_id = v_private AND user_id = v_member;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'member: made themselves admin'; END IF;

  -- The member is admin of the side channel and owns their line: that link works.
  INSERT INTO public.team_channel_whatsapp_links (channel_id, tenant_id, whatsapp_group_id)
  VALUES (v_side, v_tenant, v_member_group);

  FOREACH v_case SLICE 1 IN ARRAY ARRAY[
    ['member: posted as someone else', format(
      'INSERT INTO public.team_messages (channel_id, tenant_id, sender_id, content) VALUES (%L, %L, %L, %L)',
      v_private, v_tenant, v_admin, 'QA spoofed')],
    ['member: moved their message into a channel they are not in', format(
      'UPDATE public.team_messages SET channel_id = %L WHERE id = %L', v_foreign, v_message)],
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
      'INSERT INTO public.team_message_read_status (channel_id, user_id) VALUES (%L, %L)', v_public, v_outsider)],
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

  -- ── Super admin ─────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_super::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM public.team_channels WHERE id = ANY (v_fixture_channels);
  IF v_n <> 4 OR NOT EXISTS (SELECT 1 FROM public.team_messages WHERE id = v_bridged)
    OR NOT EXISTS (SELECT 1 FROM public.team_chat_files WHERE channel_id = v_private) THEN
    RAISE EXCEPTION 'super admin: must see every channel, message and file';
  END IF;
  UPDATE public.team_channels SET description = 'QA by super admin' WHERE id = v_private;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'super admin: must edit a channel'; END IF;
  UPDATE public.team_channel_members SET notify_enabled = true WHERE channel_id = v_private AND user_id = v_member;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'super admin: must edit member settings'; END IF;
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
END;
$test$;
SELECT 'Team chat: members, admins, outsiders, other tenants, super admins and anon passed' AS result;
ROLLBACK;
