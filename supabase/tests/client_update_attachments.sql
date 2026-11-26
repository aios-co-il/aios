-- Client update attachments (20261126190000_client_update_attachments): the
-- bucket is private; the author of an entry attaches files only at the path
-- that entry owns, of a type and size the bucket accepts; whoever can read the
-- entry (its org, or an org its agency is shared with) reads the files; a user
-- of another tenant, or a colleague who cannot see that client, reads,
-- uploads and deletes nothing; deleting the entry removes its rows.
-- Synthetic users, tenants, clients and objects inside one transaction that is
-- rolled back.
BEGIN;

-- Signs in as the user; the caller then switches to the authenticated role.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$fn$;

-- Attachment rows of one entry the signed-in user can read.
CREATE FUNCTION pg_temp.qa_visible_rows(p_update uuid)
RETURNS integer
LANGUAGE sql
AS $fn$
  SELECT count(*)::integer FROM public.client_update_attachments WHERE update_id = p_update
$fn$;

-- Files under one entry's folder the signed-in user can read.
CREATE FUNCTION pg_temp.qa_visible_files(p_prefix text)
RETURNS integer
LANGUAGE sql
AS $fn$
  SELECT count(*)::integer FROM storage.objects
  WHERE bucket_id = 'client-update-attachments' AND name LIKE p_prefix || '%'
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_author uuid := gen_random_uuid();
  v_colleague uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_partner uuid := gen_random_uuid();
  v_own uuid;
  v_other uuid;
  v_partner_tenant uuid;
  v_agency uuid;
  v_client uuid;
  v_client_b uuid;
  v_update uuid;
  v_update_b uuid;
  v_carmen_update uuid;
  v_att uuid := gen_random_uuid();
  v_path text;
  v_prefix text;
  v_rows integer;
  v_i integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'client-update-attachments' AND public
  ) THEN
    RAISE EXCEPTION 'the client-update-attachments bucket must be private';
  END IF;
  IF has_function_privilege('authenticated', 'public.client_update_attachments_guard()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.client_update_attachments_guard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'client_update_attachments_guard() is executable through the API';
  END IF;
  IF has_table_privilege('anon', 'public.client_update_attachments', 'SELECT')
    OR has_table_privilege('authenticated', 'public.client_update_attachments', 'UPDATE') THEN
    RAISE EXCEPTION 'anon may read, or authenticated may edit, client_update_attachments';
  END IF;

  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-cua-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_author, v_colleague, v_outsider, v_partner]) AS u;

  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-cua-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK other', 'qa-cua-other-' || v_tag) RETURNING id INTO v_other;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK partner', 'qa-cua-partner-' || v_tag) RETURNING id INTO v_partner_tenant;

  -- The author owns the client's org; the colleague is a campaigner there
  -- with no client assigned; the outsider owns an unrelated org; the partner
  -- owns an org the agency is shared with read_only.
  INSERT INTO public.tenant_users (user_id, tenant_id, role) VALUES
    (v_author, v_own, 'owner'),
    (v_colleague, v_own, 'member'),
    (v_outsider, v_other, 'owner'),
    (v_partner, v_partner_tenant, 'owner');
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (v_author, v_own),
    (v_colleague, v_own),
    (v_outsider, v_other),
    (v_partner, v_partner_tenant)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (v_author, 'owner', v_own),
    (v_colleague, 'campaigner', v_own),
    (v_outsider, 'owner', v_other),
    (v_partner, 'owner', v_partner_tenant);

  INSERT INTO public.agencies (name, tenant_id)
  VALUES ('QA ROLLBACK agency', v_own) RETURNING id INTO v_agency;
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES ('QA ROLLBACK client', v_own, v_agency) RETURNING id INTO v_client;
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES ('QA ROLLBACK client b', v_own, v_agency) RETURNING id INTO v_client_b;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (v_own, v_agency, v_partner_tenant, 'read_only');

  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, update_type)
  VALUES (v_client, v_own, v_author, 'QA ROLLBACK ' || v_tag, 'general')
  RETURNING id INTO v_update;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, update_type)
  VALUES (v_client_b, v_own, v_author, 'QA ROLLBACK b ' || v_tag, 'general')
  RETURNING id INTO v_update_b;
  INSERT INTO public.client_updates (client_id, tenant_id, user_id, content, update_type, source)
  VALUES (v_client, v_own, v_author, 'QA ROLLBACK carmen ' || v_tag, 'general', 'carmen')
  RETURNING id INTO v_carmen_update;

  v_prefix := v_own || '/' || v_client || '/' || v_update || '/';
  v_path := v_prefix || v_att || '.pdf';

  -- ── The author ────────────────────────────────────────────────────────
  PERFORM pg_temp.qa_sign_in(v_author);
  SET LOCAL ROLE authenticated;

  -- A row naming another org and client still lands on the entry's own.
  INSERT INTO public.client_update_attachments
    (id, update_id, tenant_id, client_id, storage_path, file_name, mime_type, size_bytes)
  VALUES (v_att, v_update, v_other, v_client_b, v_path, 'הצעת מחיר.pdf', 'application/pdf', 1000);
  IF NOT EXISTS (
    SELECT 1 FROM public.client_update_attachments
    WHERE id = v_att AND tenant_id = v_own AND client_id = v_client AND created_by = v_author
  ) THEN
    RAISE EXCEPTION 'the attachment must take the entry''s tenant and client and its uploader';
  END IF;

  -- Refused: a path under another client, an SVG, a file over the limit.
  BEGIN
    INSERT INTO public.client_update_attachments (update_id, storage_path, file_name, mime_type, size_bytes)
    VALUES (v_update, v_own || '/' || v_client_b || '/' || v_update || '/x.pdf', 'x.pdf', 'application/pdf', 10);
    RAISE EXCEPTION 'a path outside the entry''s folder must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.client_update_attachments (id, update_id, storage_path, file_name, mime_type, size_bytes)
    SELECT g, v_update, v_prefix || g || '.svg', 'x.svg', 'image/svg+xml', 10
    FROM gen_random_uuid() AS g;
    RAISE EXCEPTION 'an SVG must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.client_update_attachments (id, update_id, storage_path, file_name, mime_type, size_bytes)
    SELECT g, v_update, v_prefix || g || '.pdf', 'big.pdf', 'application/pdf', 20971521
    FROM gen_random_uuid() AS g;
    RAISE EXCEPTION 'a file over 20MB must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Refused: attaching to an entry Carmen wrote.
  BEGIN
    INSERT INTO public.client_update_attachments (id, update_id, storage_path, file_name, mime_type, size_bytes)
    SELECT g, v_carmen_update, v_own || '/' || v_client || '/' || v_carmen_update || '/' || g || '.pdf',
      'x.pdf', 'application/pdf', 10
    FROM gen_random_uuid() AS g;
    RAISE EXCEPTION 'attaching to a non-human entry must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Rows are never edited.
  BEGIN
    UPDATE public.client_update_attachments SET file_name = 'renamed.pdf' WHERE id = v_att;
    RAISE EXCEPTION 'an attachment row must not be editable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Uploads: the registered path is allowed, any other path is refused.
  INSERT INTO storage.objects (bucket_id, name) VALUES ('client-update-attachments', v_path);
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('client-update-attachments', v_prefix || 'unregistered.pdf');
    RAISE EXCEPTION 'an upload to an unregistered path must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF pg_temp.qa_visible_rows(v_update) <> 1 OR pg_temp.qa_visible_files(v_prefix) <> 1 THEN
    RAISE EXCEPTION 'the author must read their attachment and its file';
  END IF;

  -- At most 10 files per entry.
  FOR v_i IN 1..9 LOOP
    INSERT INTO public.client_update_attachments (id, update_id, storage_path, file_name, mime_type, size_bytes)
    SELECT g, v_update_b, v_own || '/' || v_client_b || '/' || v_update_b || '/' || g || '.png',
      'p.png', 'image/png', 10
    FROM gen_random_uuid() AS g;
  END LOOP;
  INSERT INTO public.client_update_attachments (id, update_id, storage_path, file_name, mime_type, size_bytes)
  SELECT g, v_update_b, v_own || '/' || v_client_b || '/' || v_update_b || '/' || g || '.png',
    'p.png', 'image/png', 10
  FROM gen_random_uuid() AS g;
  BEGIN
    INSERT INTO public.client_update_attachments (id, update_id, storage_path, file_name, mime_type, size_bytes)
    SELECT g, v_update_b, v_own || '/' || v_client_b || '/' || v_update_b || '/' || g || '.png',
      'p.png', 'image/png', 10
    FROM gen_random_uuid() AS g;
    RAISE EXCEPTION 'an eleventh file must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RESET ROLE;

  -- ── Another tenant's owner ───────────────────────────────────────────
  PERFORM pg_temp.qa_sign_in(v_outsider);
  SET LOCAL ROLE authenticated;
  IF pg_temp.qa_visible_rows(v_update) <> 0 OR pg_temp.qa_visible_files(v_prefix) <> 0 THEN
    RAISE EXCEPTION 'another tenant must read no attachment row or file';
  END IF;
  BEGIN
    INSERT INTO public.client_update_attachments (id, update_id, storage_path, file_name, mime_type, size_bytes)
    SELECT g, v_update, v_prefix || g || '.pdf', 'x.pdf', 'application/pdf', 10
    FROM gen_random_uuid() AS g;
    RAISE EXCEPTION 'another tenant must not attach to the entry';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('client-update-attachments', v_prefix || 'outsider.pdf');
    RAISE EXCEPTION 'another tenant must not upload into the entry''s folder';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE bucket_id = 'client-update-attachments' AND name = v_path;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'another tenant must delete no file, deleted %', v_rows;
  END IF;
  DELETE FROM public.client_update_attachments WHERE id = v_att;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.client_update_attachments WHERE id = v_att) THEN
    RAISE EXCEPTION 'another tenant must not delete the attachment row';
  END IF;

  -- ── A colleague who cannot see the client ────────────────────────────
  PERFORM pg_temp.qa_sign_in(v_colleague);
  SET LOCAL ROLE authenticated;
  IF pg_temp.qa_visible_rows(v_update) <> 0 OR pg_temp.qa_visible_files(v_prefix) <> 0 THEN
    RAISE EXCEPTION 'a colleague who cannot see the client must read no attachment';
  END IF;
  RESET ROLE;

  -- ── The org the agency is shared with (read_only) ────────────────────
  PERFORM pg_temp.qa_sign_in(v_partner);
  SET LOCAL ROLE authenticated;
  IF pg_temp.qa_visible_rows(v_update) <> 1 OR pg_temp.qa_visible_files(v_prefix) <> 1 THEN
    RAISE EXCEPTION 'a reader of the shared card must read the attachment and its file';
  END IF;
  RESET ROLE;

  -- ── The author deletes the file, then the entry ──────────────────────
  PERFORM pg_temp.qa_sign_in(v_author);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE bucket_id = 'client-update-attachments' AND name = v_path;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'the author must delete their file, deleted %', v_rows;
  END IF;
  DELETE FROM public.client_updates WHERE id = v_update;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'the author must delete their entry, deleted %', v_rows;
  END IF;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.client_update_attachments WHERE update_id = v_update) THEN
    RAISE EXCEPTION 'deleting the entry must delete its attachment rows';
  END IF;

  RAISE NOTICE 'client_update_attachments: all checks passed';
END
$test$;

ROLLBACK;
