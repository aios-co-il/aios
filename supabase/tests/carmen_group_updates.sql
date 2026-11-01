-- Group updates to the client card (20261101103000_carmen_group_updates):
-- get_client_group_digest_messages over synthetic tenants, lines and group
-- rows stored the way the webhooks store them (digits-only sender_phone, the
-- raw sender in raw_provider_data), inside one transaction that is rolled
-- back. Tenants: the reader, an owner tenant with one agency shared
-- read_write and one read_only with the reader, and nothing else.
-- carmen_group_updates_resolve.sql covers the other two functions.
BEGIN;
DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_reader uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_shared_agency uuid := gen_random_uuid();
  v_ro_agency uuid := gen_random_uuid();
  v_private_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_client2 uuid := gen_random_uuid();
  v_ended uuid := gen_random_uuid();
  v_shared_client uuid := gen_random_uuid();
  v_ro_client uuid := gen_random_uuid();
  v_owner_client uuid := gen_random_uuid();
  v_line uuid := gen_random_uuid();
  v_org_line uuid := gen_random_uuid();
  v_private_line uuid := gen_random_uuid();
  v_manus_line uuid := gen_random_uuid();
  v_owner_line uuid := gen_random_uuid();
  v_lid text := '9' || lpad((floor(random() * 1e14))::bigint::text, 14, '0');
  v_lid_unmapped text := '8' || lpad((floor(random() * 1e14))::bigint::text, 14, '0');
  v_phone text := '9725' || lpad((floor(random() * 1e8))::bigint::text, 8, '0');
  v_group uuid;
  v_group2 uuid;
  v_owner_copy uuid;
  v_blocked uuid;
  v_ended_group uuid;
  v_ro_group uuid;
  v_shared uuid;
  v_owner_shared uuid;
  v_row record;
  v_texts text;
  v_rows integer;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_reader, 'QA reader', 'qa-r6-reader-' || v_tag), (v_owner, 'QA owner', 'qa-r6-owner-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES
    (v_agency, v_reader, 'QA'), (v_shared_agency, v_owner, 'QA'),
    (v_ro_agency, v_owner, 'QA'), (v_private_agency, v_owner, 'QA');
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (v_owner, v_shared_agency, v_reader, 'read_write'), (v_owner, v_ro_agency, v_reader, 'read_only');
  INSERT INTO public.clients (id, tenant_id, agency_id, name, status) VALUES
    (v_client, v_reader, v_agency, 'QA client', 'active'),
    (v_client2, v_reader, v_agency, 'QA client 2', 'active'),
    (v_ended, v_reader, v_agency, 'QA ended', 'ended'),
    (v_shared_client, v_owner, v_shared_agency, 'QA shared', 'active'),
    (v_ro_client, v_owner, v_ro_agency, 'QA read only', 'active'),
    (v_owner_client, v_owner, v_private_agency, 'QA owner only', 'active');
  INSERT INTO public.wa_lid_map (lid, phone, source) VALUES (v_lid, v_phone, 'qa');

  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_reader, 'qa-r6-g-' || v_tag || '@g.us', 'QA group') RETURNING id INTO v_group;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_owner, 'qa-r6-g-' || v_tag || '@g.us', 'QA group') RETURNING id INTO v_owner_copy;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_reader, 'qa-r6-two-' || v_tag || '@g.us', 'QA two') RETURNING id INTO v_group2;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_reader, 'qa-r6-b-' || v_tag || '@g.us', 'QA blocked') RETURNING id INTO v_blocked;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_reader, 'qa-r6-e-' || v_tag || '@g.us', 'QA ended') RETURNING id INTO v_ended_group;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_reader, 'qa-r6-ro-' || v_tag || '@g.us', 'QA read only') RETURNING id INTO v_ro_group;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_reader, 'qa-r6-s-' || v_tag || '@g.us', 'QA shared') RETURNING id INTO v_shared;
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_owner, 'qa-r6-s-' || v_tag || '@g.us', 'QA shared') RETURNING id INTO v_owner_shared;
  -- The owner tenant links its own copy of the reader's group to a client the
  -- reader cannot see: that must not make the reader's group ambiguous.
  INSERT INTO public.carmen_client_group_access (tenant_id, client_id, whatsapp_group_id) VALUES
    (v_reader, v_client, v_group), (v_owner, v_owner_client, v_owner_copy),
    (v_reader, v_client, v_group2), (v_reader, v_client2, v_group2),
    (v_reader, v_client, v_blocked), (v_reader, v_ended, v_ended_group),
    (v_reader, v_ro_client, v_ro_group), (v_reader, v_shared_client, v_shared),
    (v_owner, v_shared_client, v_owner_shared);
  INSERT INTO public.blocked_contacts (tenant_id, connection_user_id, group_id)
  VALUES (v_reader, v_line, v_blocked);

  INSERT INTO public.chat_messages (tenant_id, provider, connection_user_id, direction,
    message_text, sender_phone, group_id, client_id, created_at, raw_provider_data)
  VALUES
    (v_reader, 'green_api', v_line, 'inbound', 'QA first', '972521111111', v_group, NULL,
      now() - interval '5 hours', jsonb_build_object('idMessage', 'qa1-' || v_tag,
        'senderData', jsonb_build_object('sender', '972521111111@c.us'))),
    (v_reader, 'green_api', v_line, 'inbound', 'QA lid', v_lid, v_group, NULL,
      now() - interval '4 hours', jsonb_build_object('idMessage', 'qa2-' || v_tag,
        'senderData', jsonb_build_object('sender', v_lid || '@lid'))),
    (v_reader, 'green_api', v_line, 'inbound', 'QA unmapped', v_lid_unmapped, v_group, NULL,
      now() - interval '3 hours', jsonb_build_object('idMessage', 'qa3-' || v_tag,
        'senderData', jsonb_build_object('sender', v_lid_unmapped || '@lid'))),
    -- One message on two monitored lines: the sender's (outbound) copy wins.
    (v_reader, 'green_api', v_line, 'inbound', 'QA org reply (copy)', '972509990000', v_group, NULL,
      now() - interval '2 hours', jsonb_build_object('idMessage', 'qa4-' || v_tag,
        'senderData', jsonb_build_object('sender', '972509990000@c.us'))),
    (v_reader, 'green_api', v_org_line, 'outbound', 'QA org reply', '972509990000', v_group, NULL,
      now() - interval '2 hours', jsonb_build_object('idMessage', 'qa4-' || v_tag,
        'senderData', jsonb_build_object('sender', '972509990000@c.us'))),
    -- Never returned: a private line, too old, a direct chat, Carmen's Manus line.
    (v_reader, 'green_api', v_private_line, 'inbound', 'QA PRIVATE', '972521111111', v_group, NULL,
      now() - interval '1 hour', jsonb_build_object('idMessage', 'qa5-' || v_tag)),
    (v_reader, 'green_api', v_line, 'inbound', 'QA TOO OLD', '972521111111', v_group, NULL,
      now() - interval '9 days', jsonb_build_object('idMessage', 'qa6-' || v_tag)),
    (v_reader, 'green_api', v_line, 'inbound', 'QA DM', '972521111111', NULL, v_client,
      now() - interval '1 hour', '{}'::jsonb),
    (v_reader, 'manus_wa', v_manus_line, 'inbound', 'QA manus resolved', '972531234567', v_group, NULL,
      now() - interval '1 hour', jsonb_build_object('_group_author_raw', v_lid_unmapped || '@lid')),
    (v_reader, 'manus_wa', v_manus_line, 'inbound', 'QA manus lid', v_lid, v_group, NULL,
      now() - interval '50 minutes', jsonb_build_object('_group_author_raw', v_lid || '@lid')),
    -- Traffic in groups that must stay out, and in the shared group (both copies).
    (v_reader, 'green_api', v_line, 'inbound', 'QA AMBIGUOUS', '972521111111', v_group2, NULL, now() - interval '1 hour', '{}'::jsonb),
    (v_reader, 'green_api', v_line, 'inbound', 'QA BLOCKED', '972521111111', v_blocked, NULL, now() - interval '1 hour', '{}'::jsonb),
    (v_reader, 'green_api', v_line, 'inbound', 'QA ENDED', '972521111111', v_ended_group, NULL, now() - interval '1 hour', '{}'::jsonb),
    (v_reader, 'green_api', v_line, 'inbound', 'QA READ ONLY', '972521111111', v_ro_group, NULL, now() - interval '1 hour', '{}'::jsonb),
    (v_reader, 'green_api', v_line, 'inbound', 'QA shared', '972521111111', v_shared, NULL, now() - interval '1 hour', '{}'::jsonb),
    (v_owner, 'green_api', v_owner_line, 'inbound', 'QA shared (owner)', '972521111111', v_owner_shared, NULL, now() - interval '1 hour', '{}'::jsonb);

  -- The linked group: monitored lines only, oldest first, senders as keys.
  SELECT * INTO v_row
  FROM public.get_client_group_digest_messages(v_reader, ARRAY[v_line, v_org_line], now() - interval '30 days', 'qa_group')
  WHERE group_id = v_group;
  IF v_row.client_id IS DISTINCT FROM v_client THEN
    RAISE EXCEPTION 'digest: the group belongs to its one client in scope, got %', v_row.client_id;
  END IF;
  IF v_row.client_tenant_id IS DISTINCT FROM v_reader
     OR v_row.group_chat_id IS NULL
     OR v_row.messages -> 0 ->> 'provider_id' IS DISTINCT FROM 'qa1-' || v_tag
     OR (v_row.messages -> 3 ->> 'typed_on_phone')::boolean IS NOT FALSE
     OR v_row.messages -> 3 ->> 'line_user' IS DISTINCT FROM v_org_line::text THEN
    RAISE EXCEPTION 'digest: the client''s tenant, the group chat and the provider id leave, got %', v_row;
  END IF;
  SELECT string_agg(m ->> 'text', ',' ORDER BY ord) INTO v_texts
  FROM jsonb_array_elements(v_row.messages) WITH ORDINALITY AS x(m, ord);
  IF v_texts IS DISTINCT FROM 'QA first,QA lid,QA unmapped,QA org reply' THEN
    RAISE EXCEPTION 'digest: monitored lines only, one copy per message, got %', v_texts;
  END IF;
  IF v_row.messages -> 0 ->> 'key' IS DISTINCT FROM '521111111'
     OR v_row.messages -> 1 ->> 'key' IS DISTINCT FROM public.phone_match_key(v_phone)
     OR v_row.messages -> 2 ->> 'key' IS NOT NULL
     OR (v_row.messages -> 2 ->> 'lid_unmapped')::boolean IS NOT TRUE
     OR (v_row.messages -> 1 ->> 'lid_unmapped')::boolean IS NOT FALSE
     OR (v_row.messages -> 3 ->> 'out')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'digest: an @lid sender is mapped or flagged unmapped, got %', v_row.messages;
  END IF;
  IF v_row.messages::text LIKE '%' || v_lid || '%' OR v_row.messages::text LIKE '%972521111111%' THEN
    RAISE EXCEPTION 'digest: no raw phone or LID may leave the function';
  END IF;

  -- Manus stores a resolved author as the phone and an unresolved one as the LID.
  SELECT * INTO v_row
  FROM public.get_client_group_digest_messages(v_reader, ARRAY[v_manus_line], now() - interval '1 day', 'qa_group', 'manus_wa')
  WHERE group_id = v_group;
  IF v_row.messages -> 0 ->> 'key' IS DISTINCT FROM '531234567'
     OR v_row.messages -> 1 ->> 'key' IS DISTINCT FROM public.phone_match_key(v_phone) THEN
    RAISE EXCEPTION 'digest: Manus authors must resolve, got %', v_row.messages;
  END IF;

  SELECT string_agg(r.messages::text, ' ') INTO v_texts
  FROM public.get_client_group_digest_messages(v_reader, ARRAY[v_line, v_org_line], now() - interval '1 day', 'qa_group') AS r;
  IF v_texts LIKE '%QA DM%' OR v_texts LIKE '%QA AMBIGUOUS%' OR v_texts LIKE '%QA BLOCKED%'
     OR v_texts LIKE '%QA ENDED%' OR v_texts LIKE '%QA READ ONLY%' THEN
    RAISE EXCEPTION 'digest: direct, ambiguous, blocked, ended or read-only groups leaked: %', v_texts;
  END IF;
  SELECT count(*) INTO v_rows
  FROM public.get_client_group_digest_messages(v_reader, ARRAY[v_line], now() - interval '1 day', 'qa_group', 'green_api', ARRAY[gen_random_uuid()]);
  IF v_rows <> 0 THEN RAISE EXCEPTION 'digest: p_client_ids must scope the groups'; END IF;
  IF EXISTS (SELECT 1 FROM public.get_client_group_digest_messages(v_reader, ARRAY[gen_random_uuid()], now() - interval '1 day', 'qa_group')) THEN
    RAISE EXCEPTION 'digest: a line not passed must read nothing';
  END IF;

  -- One reader per group_chat_id: the shared client's own tenant reads it.
  SELECT count(*) INTO v_rows
  FROM public.get_client_group_digest_messages(v_reader, ARRAY[v_line], now() - interval '1 day', 'qa_group') AS r
  WHERE r.group_id = v_shared;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'shared group: the reader reads it while its owner does not'; END IF;
  INSERT INTO public.carmen_round_state (tenant_id, collector, last_run_at, watermark)
  VALUES (v_owner, 'qa_group', now() - interval '1 hour', jsonb_build_object('read_lines', jsonb_build_array(v_owner_line)));
  SELECT count(*) INTO v_rows
  FROM public.get_client_group_digest_messages(v_reader, ARRAY[v_line], now() - interval '1 day', 'qa_group') AS r
  WHERE r.group_id = v_shared;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'shared group: the owner tenant reads it, the reader must not'; END IF;
  UPDATE public.carmen_round_state SET last_run_at = now() - interval '3 days'
  WHERE tenant_id = v_owner AND collector = 'qa_group';
  SELECT count(*) INTO v_rows
  FROM public.get_client_group_digest_messages(v_reader, ARRAY[v_line], now() - interval '1 day', 'qa_group') AS r
  WHERE r.group_id = v_shared;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'shared group: a stale owner run must not hide it'; END IF;

  -- The owner tenant never sees the reader's own client.
  IF EXISTS (SELECT 1 FROM public.get_client_group_digest_messages(v_owner, ARRAY[v_owner_line, v_line], now() - interval '1 day', 'qa_group') AS r
             WHERE r.client_id IN (v_client, v_client2)) THEN
    RAISE EXCEPTION 'isolation: another tenant''s client leaked';
  END IF;

  IF has_function_privilege('anon', 'public.get_client_group_digest_messages(uuid, uuid[], timestamptz, text, public.chat_provider, uuid[], integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_client_group_digest_messages(uuid, uuid[], timestamptz, text, public.chat_provider, uuid[], integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_client_group_digest_messages(uuid, uuid[], timestamptz, text, public.chat_provider, uuid[], integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: get_client_group_digest_messages is service role only';
  END IF;

  RAISE NOTICE 'carmen_group_updates: all checks passed';
END;
$test$;
ROLLBACK;
