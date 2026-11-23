-- Carmen memory outbox retention: 20261119210000_carmen_memory_outbox_retention.
-- Synthetic rows inside one transaction that is rolled back; the retention
-- statement is read from cron.job when pg_cron is installed.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_command text;
BEGIN
  INSERT INTO public.tenants (id, name, slug)
  VALUES (v_tenant, 'QA ROLLBACK outbox retention', 'qa-or-' || left(v_tenant::text, 8));

  INSERT INTO public.carmen_memory_outbox (tenant_id, entity_type, entity_id, op, payload, processed_at, created_at)
  VALUES
    (v_tenant, 'task', 'qa-old-done', 'INSERT', '{}', now() - interval '8 days', now() - interval '9 days'),
    (v_tenant, 'task', 'qa-recent-done', 'INSERT', '{}', now() - interval '6 days', now() - interval '6 days'),
    (v_tenant, 'task', 'qa-old-pending', 'INSERT', '{}', NULL, now() - interval '60 days');

  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'retention: pg_cron not installed, scheduled job not checked';
    RETURN;
  END IF;
  SELECT command INTO v_command FROM cron.job
  WHERE jobname = 'cleanup-carmen-memory-outbox' AND schedule = '47 3 * * *';
  IF v_command IS NULL THEN
    RAISE EXCEPTION 'retention: cleanup-carmen-memory-outbox must run daily at 03:47';
  END IF;
  EXECUTE v_command;

  IF (SELECT array_agg(entity_id ORDER BY entity_id) FROM public.carmen_memory_outbox WHERE tenant_id = v_tenant)
     IS DISTINCT FROM ARRAY['qa-old-pending', 'qa-recent-done'] THEN
    RAISE EXCEPTION 'retention: only rows processed over 7 days ago may go, got %',
      (SELECT array_agg(entity_id ORDER BY entity_id) FROM public.carmen_memory_outbox WHERE tenant_id = v_tenant);
  END IF;
END
$test$;
ROLLBACK;
