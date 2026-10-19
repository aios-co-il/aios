-- Per-user Carmen permissions: which brains a team member may use.
--
-- brain_access maps an agent_brain_routes.slug to a level:
--   "full"   — use the brain freely
--   "bugfix" — use it for bug fixes only (Cursor/Claude coding brains)
-- A slug that is missing means no access to that brain.
-- enabled = false revokes Carmen entirely for that user.
-- Users without a row keep today's behaviour (owners, or a personal API key).

ALTER TABLE public.carmen_command_center_access
  ADD COLUMN IF NOT EXISTS brain_access jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.carmen_command_center_access
  DROP CONSTRAINT IF EXISTS carmen_cc_access_brain_access_object_chk;
ALTER TABLE public.carmen_command_center_access
  ADD CONSTRAINT carmen_cc_access_brain_access_object_chk
  CHECK (jsonb_typeof(brain_access) = 'object');

COMMENT ON COLUMN public.carmen_command_center_access.brain_access IS
  'Brain slug -> "full" | "bugfix". Missing slug = no access.';
COMMENT ON COLUMN public.carmen_command_center_access.enabled IS
  'false = this user may not use Carmen at all.';
