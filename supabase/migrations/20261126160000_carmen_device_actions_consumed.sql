-- Carmen device actions (AIO-686): when the server used a step's outcome.
--
-- run-ai-agent resumes a paused run from one carmen_device_actions row. It sets
-- consumed_at and clears the page text (result) in one guarded UPDATE, keyed by
-- the row's id, org, user and status and only while consumed_at is null, so a
-- second continuation of the same step finds nothing to resume and the page
-- text is gone once the run has continued.
--
-- The column is the service role's alone: signed-in users hold SELECT on ten
-- named columns only (20261126143000_carmen_device_actions.sql), so this one is
-- unreadable from a browser without a grant here.
--
-- Triggers fired: none. Existing rows keep consumed_at null. Safe to re-run.

ALTER TABLE public.carmen_device_actions
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

COMMENT ON COLUMN public.carmen_device_actions.consumed_at IS
  'When run-ai-agent resumed the run from this step; null until then. Set once (AIO-686).';
