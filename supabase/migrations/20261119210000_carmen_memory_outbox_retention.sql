-- Carmen memory outbox: delete processed rows after 7 days.
-- carmen-memory-worker copies each outbox row into carmen_memory_pointers /
-- carmen_memory_episodes and stamps processed_at; nothing reads a processed row
-- again. None were ever deleted: Production held ~641k processed rows (~1.1 GB),
-- most from the September–October backfills. Carmen's memory lives in the
-- pointer and episode tables, which this migration does not touch.

-- 1. One-time cleanup ----------------------------------------------------------
-- Keeps unprocessed rows and rows processed in the last 7 days (~6.6k on
-- Production), truncates and reinserts them, so the disk is freed at once with
-- no ~635k-row DELETE and VACUUM FULL. One DO block is one transaction. The
-- exclusive lock makes the five outbox triggers (clients, campaigners, tasks,
-- chat_messages, ai_conversations) wait the moment this takes instead of
-- losing an event; ids are kept and the sequence is not reset.
DO $cleanup$
DECLARE
  v_kept integer;
BEGIN
  LOCK TABLE public.carmen_memory_outbox IN ACCESS EXCLUSIVE MODE;

  CREATE TEMP TABLE outbox_keep AS
    SELECT * FROM public.carmen_memory_outbox
    WHERE processed_at IS NULL OR processed_at >= now() - interval '7 days';
  GET DIAGNOSTICS v_kept = ROW_COUNT;

  TRUNCATE public.carmen_memory_outbox;
  INSERT INTO public.carmen_memory_outbox SELECT * FROM outbox_keep;
  DROP TABLE outbox_keep;

  RAISE NOTICE 'carmen memory outbox cleanup: kept % rows', v_kept;
END
$cleanup$;

-- 2. Nightly retention (re)scheduled, so a re-run keeps one job ----------------
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'carmen memory outbox retention: pg_cron not installed, skipped';
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'cleanup-carmen-memory-outbox';

  -- Unprocessed rows stay however old: the worker still owes them.
  perform cron.schedule(
    'cleanup-carmen-memory-outbox',
    '47 3 * * *',
    $job$delete from public.carmen_memory_outbox
         where processed_at < now() - interval '7 days'$job$
  );
end
$$;
