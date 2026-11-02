-- Reliable WhatsApp → automation dispatch (AIO-204).
--
-- 1. processed_webhook_messages.completed_at: green-api-webhook claims each
--    delivery's idMessage (unique key from 20261021090000) and marks the claim
--    done once the message is stored. An unfinished claim older than the lease
--    (5 min, MESSAGE_CLAIM_LEASE_MS in green-api-webhook/message-claim-lease.ts)
--    belongs to a delivery that died mid-way, so Green API's retry may take it
--    over instead of being dropped as a duplicate; release and completion are
--    fenced on the claim's processed_at. Existing rows (Manus claims, Carmen
--    group fingerprints) keep NULL; only green-api-webhook reads it.
-- 2. trigger-automation inserted every automation_executions row as 'running'
--    and never closed it, which turned its 30s cooldown into "drop every group
--    message within 30s of the previous one". It now writes one finished row per
--    run; this closes the historical 'running' rows as 'abandoned'. Rows from
--    the last 10 minutes are left alone: the old function may still be running.
--    No trigger is defined on automation_executions, so the update fires none.
-- 3. Daily retention for processed_webhook_messages (every provider's claims,
--    14 days) and automation_executions (30 days), as SQL-only pg_cron jobs.
--
-- Nothing is sent or replayed: this changes bookkeeping rows only.

-- 1. processed_webhook_messages: message claim lease ---------------------------
ALTER TABLE public.processed_webhook_messages
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. automation_executions: close stale rows -----------------------------------
UPDATE public.automation_executions
SET status = 'abandoned',
    finished_at = started_at
WHERE status = 'running'
  AND started_at < now() - interval '10 minutes';

-- 3. Retention: (re)schedules both jobs, so a re-run keeps one of each ---------
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'automation retention cron: pg_cron not installed, skipped';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN (
    'cleanup-processed-webhook-messages',
    'cleanup-automation-executions'
  );

  PERFORM cron.schedule(
    'cleanup-processed-webhook-messages',
    '17 3 * * *',
    $job$DELETE FROM public.processed_webhook_messages
         WHERE processed_at < now() - interval '14 days'$job$
  );

  PERFORM cron.schedule(
    'cleanup-automation-executions',
    '27 3 * * *',
    $job$DELETE FROM public.automation_executions
         WHERE started_at < now() - interval '30 days'$job$
  );
END
$$;
