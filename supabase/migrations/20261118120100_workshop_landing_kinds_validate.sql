-- Validates the workshop_artifacts kind check that 20261118120000 replaced (AIO-607). In its own
-- migration so the scan of existing rows runs after the replacement has committed, under a lock
-- that lets the board keep reading and writing. Safe to re-run.
ALTER TABLE public.workshop_artifacts VALIDATE CONSTRAINT workshop_artifacts_kind_check;
