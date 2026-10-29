-- AIO-228: truthful sync freshness for the ads report tables.
--
-- last_sync_at now moves only after a sync wrote data. Every run, including an
-- empty or failed one, records when it ran and how it ended, so the pulse,
-- health probe and report pages can tell "fresh" from "the last run wrote
-- nothing". The edge functions also mirror both values in integration_settings
-- (like last_sync_at), so readers that only load the settings keep working.
--
-- Shape of last_sync_outcome:
--   {status: ok|empty|partial|failed, rows, levels_ok?, error?, at, source?}
--
-- Schema only: no data change, no backfill. Existing rows start NULL and get a
-- value on their next sync.

ALTER TABLE public.crm_tables
  ADD COLUMN IF NOT EXISTS last_sync_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_outcome jsonb;

COMMENT ON COLUMN public.crm_tables.last_sync_attempt_at IS
  'When the latest sync run finished, whatever its outcome. last_sync_at is the latest run that wrote data.';
COMMENT ON COLUMN public.crm_tables.last_sync_outcome IS
  'Latest sync run: {status ok|empty|partial|failed, rows, levels_ok?, error?, at, source?}. empty/failed means the stored rows were not refreshed.';
