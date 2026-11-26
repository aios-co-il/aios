-- Private supplier-invoices bucket (20261127090000_private_supplier_invoices_bucket,
-- AIO-608): the bucket is private; a finance writer reads, uploads and deletes
-- files only under the folder of the tenant they act in, and a member without
-- finance reads and uploads nothing. Synthetic users, tenants and objects
-- inside one transaction that is rolled back.
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
  v_owner uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_own uuid;
  v_foreign uuid;
  v_rows integer;
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'supplier-invoices' AND public) THEN
    RAISE EXCEPTION 'the supplier-invoices bucket must be private';
  END IF;

  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-supplier-invoices-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_owner, v_member, v_other]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK own', 'qa-si-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK foreign', 'qa-si-foreign-' || v_tag) RETURNING id INTO v_foreign;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_own, v_owner, 'owner'),
    (v_own, v_member, 'member'),
    (v_foreign, v_other, 'owner');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (v_owner, 'owner', v_own),
    (v_member, 'campaigner', v_own),
    (v_other, 'owner', v_foreign);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (v_owner, v_own), (v_member, v_own), (v_other, v_foreign);

  -- One file in each tenant, written past RLS like the service role.
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('supplier-invoices', v_own || '/supplier/qa-' || v_tag || '.pdf'),
    ('supplier-invoices', v_foreign || '/supplier/qa-' || v_tag || '.pdf');

  -- The member without finance reads nothing and cannot upload.
  PERFORM pg_temp.qa_sign_in(v_member);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM storage.objects
  WHERE bucket_id = 'supplier-invoices' AND name LIKE '%qa-' || v_tag || '%';
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'a member without finance must read no file, read %', v_rows;
  END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('supplier-invoices', v_own || '/supplier/qa-member-' || v_tag || '.pdf');
    RAISE EXCEPTION 'a member without finance must not upload';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  PERFORM pg_temp.qa_sign_in(v_owner);
  SET LOCAL ROLE authenticated;

  -- Reads: the owner's own file, not the other tenant's.
  SELECT count(*) INTO v_rows FROM storage.objects
  WHERE bucket_id = 'supplier-invoices' AND name LIKE '%qa-' || v_tag || '%';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'the owner must read exactly their 1 own file, read %', v_rows;
  END IF;

  -- Uploads: refused under the other tenant's folder, allowed in their own.
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('supplier-invoices', v_foreign || '/supplier/qa-upload-' || v_tag || '.pdf');
    RAISE EXCEPTION 'upload into another tenant''s folder must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('supplier-invoices', v_own || '/supplier/qa-upload-' || v_tag || '.pdf');

  -- Deletes: the other tenant's file is invisible, so nothing is deleted.
  -- Direct deletes are allowed for this transaction only.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'supplier-invoices' AND name LIKE v_foreign || '/%';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'the owner must delete no file of another tenant, deleted %', v_rows;
  END IF;
  DELETE FROM storage.objects
  WHERE bucket_id = 'supplier-invoices'
    AND name = v_own || '/supplier/qa-' || v_tag || '.pdf';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'the owner must delete their own file, deleted %', v_rows;
  END IF;

  RESET ROLE;
  SELECT count(*) INTO v_rows FROM storage.objects
  WHERE bucket_id = 'supplier-invoices' AND name LIKE v_foreign || '/%qa-' || v_tag || '%';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'the other tenant''s file must remain, found %', v_rows;
  END IF;

  RAISE NOTICE 'private_supplier_invoices_bucket: all checks passed';
END
$test$;

ROLLBACK;
