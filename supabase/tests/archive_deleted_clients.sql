-- Deleted clients are archived (20261103110500_archive_deleted_clients): a
-- client delete copies the client row, its tenant's communication log, another
-- tenant's log on that client (shared agency) and its SEO monthly update into
-- archive.orphan_rows with reason client_deleted, as they were, before the
-- delete cascades and removes the logs and the update. anon and authenticated
-- cannot execute the trigger function. Without the migration the archive is
-- empty and the test fails. Synthetic tenants and rows, full rollback, so it
-- runs on a scratch database, a Preview branch or Staging.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_log uuid := gen_random_uuid();
  v_other_log uuid := gen_random_uuid();
  v_seo uuid := gen_random_uuid();
  v_status text;
  v_count bigint;
  v_tag text := left(gen_random_uuid()::text, 8);
BEGIN
  IF to_regprocedure('public.archive_deleted_client()') IS NULL THEN
    RAISE EXCEPTION 'archive deleted clients: public.archive_deleted_client() is missing';
  END IF;
  IF has_function_privilege('anon', 'public.archive_deleted_client()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.archive_deleted_client()', 'EXECUTE') THEN
    RAISE EXCEPTION 'archive deleted clients: anon or authenticated can execute the trigger function';
  END IF;

  -- Fixture: a tenant with an agency and a client, its log and SEO update, and a second tenant's
  -- log on the same client.
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_tenant, 'QA archive ' || v_tag, 'qa-archive-' || v_tag),
    (v_other_tenant, 'QA archive other ' || v_tag, 'qa-archive-other-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_tenant, 'QA agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name) VALUES (v_client, v_tenant, v_agency, 'QA archived client');
  INSERT INTO public.communication_logs (id, tenant_id, client_id) VALUES
    (v_log, v_tenant, v_client),
    (v_other_log, v_other_tenant, v_client);
  SELECT (enum_range(NULL::public.seo_monthly_status))[1]::text INTO v_status;
  INSERT INTO public.seo_monthly_updates (id, tenant_id, client_id, month, status)
  VALUES (v_seo, v_tenant, v_client, date '2026-10-01', v_status::public.seo_monthly_status);

  DELETE FROM public.clients WHERE id = v_client;

  -- The cascade still removes the logs and the update.
  IF EXISTS (SELECT 1 FROM public.communication_logs WHERE id IN (v_log, v_other_log))
     OR EXISTS (SELECT 1 FROM public.seo_monthly_updates WHERE id = v_seo) THEN
    RAISE EXCEPTION 'archive deleted clients: the cascade left a log or an SEO update';
  END IF;

  -- Each deleted row is in the archive once, as it was before the delete.
  SELECT count(*) INTO v_count
  FROM archive.orphan_rows AS a
  WHERE a.reason = 'client_deleted'
    AND (
      (a.source_table = 'clients' AND a.row_id = v_client AND a.row ->> 'name' = 'QA archived client')
      OR (a.source_table = 'communication_logs' AND a.row_id = v_log
          AND (a.row ->> 'tenant_id')::uuid = v_tenant AND (a.row ->> 'client_id')::uuid = v_client)
      OR (a.source_table = 'communication_logs' AND a.row_id = v_other_log
          AND (a.row ->> 'tenant_id')::uuid = v_other_tenant AND (a.row ->> 'client_id')::uuid = v_client)
      OR (a.source_table = 'seo_monthly_updates' AND a.row_id = v_seo AND (a.row ->> 'client_id')::uuid = v_client)
    );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'archive deleted clients: expected 4 archived rows (client, 2 logs, SEO update), found %', v_count;
  END IF;
END
$test$;
SELECT 'archive deleted clients: client, both tenants'' logs and SEO update archived' AS result;
ROLLBACK;
