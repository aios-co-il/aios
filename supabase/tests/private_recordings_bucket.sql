-- Private recordings bucket (20261115090000_private_recordings_bucket, AIO-595):
-- the bucket is private, and a member of one tenant cannot read, upload or
-- delete files under another tenant's folder or its summaries/ folder, while
-- reading, uploading and deleting in their own. Synthetic users, tenants and
-- objects inside one transaction that is rolled back.
BEGIN;

-- Signs in as the user; the caller then switches to the authenticated role.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_member uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_own uuid;
  v_foreign uuid;
  v_rows integer;
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'recordings' AND public) THEN
    RAISE EXCEPTION 'the recordings bucket must be private';
  END IF;

  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-recordings-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_member, v_other]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-rec-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK foreign', 'qa-rec-foreign-' || v_tag) RETURNING id INTO v_foreign;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_member, 'member'),
    (v_foreign, v_other, 'owner');

  -- One file of each kind in each tenant, written past RLS like the service role.
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('recordings', v_own || '/qa-' || v_tag || '.webm'),
    ('recordings', 'summaries/' || v_own || '/client_x/qa-' || v_tag || '.docx'),
    ('recordings', v_foreign || '/qa-' || v_tag || '.webm'),
    ('recordings', 'summaries/' || v_foreign || '/client_x/qa-' || v_tag || '.docx');

  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;

  -- Reads: both of the member's own files, none of the other tenant's.
  SELECT count(*) INTO v_rows FROM storage.objects
  WHERE bucket_id = 'recordings' AND name LIKE '%qa-' || v_tag || '%';
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'member must read exactly their 2 own files, read %', v_rows;
  END IF;
  SELECT count(*) INTO v_rows FROM storage.objects
  WHERE bucket_id = 'recordings'
    AND (name LIKE v_foreign || '/%' OR name LIKE 'summaries/' || v_foreign || '/%');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member must read no file of another tenant, read %', v_rows;
  END IF;

  -- Uploads: refused under the other tenant's folder and its summaries/.
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('recordings', v_foreign || '/qa-upload-' || v_tag || '.webm');
    RAISE EXCEPTION 'member: upload into another tenant''s folder must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('recordings', 'summaries/' || v_foreign || '/qa-upload-' || v_tag || '.docx');
    RAISE EXCEPTION 'member: upload into another tenant''s summaries must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Uploads into the member's own folder are allowed.
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('recordings', v_own || '/qa-upload-' || v_tag || '.webm');

  -- Deletes: the other tenant's files are invisible, so nothing is deleted.
  -- Direct deletes are allowed for this transaction only.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'recordings'
    AND (name LIKE v_foreign || '/%' OR name LIKE 'summaries/' || v_foreign || '/%');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'member must delete no file of another tenant, deleted %', v_rows;
  END IF;

  -- The member deletes their own recording.
  DELETE FROM storage.objects
  WHERE bucket_id = 'recordings' AND name = v_own || '/qa-' || v_tag || '.webm';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'member must delete their own recording, deleted %', v_rows;
  END IF;

  RESET ROLE;
  SELECT count(*) INTO v_rows FROM storage.objects
  WHERE bucket_id = 'recordings'
    AND (name LIKE v_foreign || '/%' OR name LIKE 'summaries/' || v_foreign || '/%')
    AND name LIKE '%qa-' || v_tag || '%';
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'the other tenant''s 2 files must remain, found %', v_rows;
  END IF;

  RAISE NOTICE 'private_recordings_bucket: all checks passed';
END
$test$;

ROLLBACK;
