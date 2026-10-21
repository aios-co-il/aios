-- Carmen brain permissions: NULL brain_access means "no brain restriction".
--
-- 20261019120000 added brain_access NOT NULL DEFAULT '{}', and '{}' means
-- "no brains". Any row written without brain_access (for example one that
-- only sets dev_escalation_tier) would lose Carmen. From now on such rows
-- keep every brain; the settings screen always writes an explicit object.

ALTER TABLE public.carmen_command_center_access
  ALTER COLUMN brain_access DROP NOT NULL,
  ALTER COLUMN brain_access SET DEFAULT NULL;

-- Rows filled by the old default go back to unrestricted. When this ran,
-- no environment had a row deliberately set to "no brains".
UPDATE public.carmen_command_center_access
  SET brain_access = NULL
  WHERE brain_access = '{}'::jsonb;

ALTER TABLE public.carmen_command_center_access
  DROP CONSTRAINT IF EXISTS carmen_cc_access_brain_access_object_chk;
ALTER TABLE public.carmen_command_center_access
  ADD CONSTRAINT carmen_cc_access_brain_access_object_chk
  CHECK (brain_access IS NULL OR jsonb_typeof(brain_access) = 'object');

COMMENT ON COLUMN public.carmen_command_center_access.brain_access IS
  'Brain slug -> "full" | "bugfix". Missing slug = no access. NULL = every brain.';
