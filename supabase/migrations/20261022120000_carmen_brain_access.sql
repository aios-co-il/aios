-- Per-user Carmen permissions: which brains a team member may use.
--
-- brain_access maps an agent_brain_routes.slug to a level:
--   "full"   — use the brain freely
--   "bugfix" — use it for bug fixes only (Cursor/Claude coding brains)
-- A slug missing from the object means no access to that brain.
-- brain_access NULL means every brain at full access (no brain restriction).
-- enabled = false revokes Carmen entirely for that user.
-- Users without a row keep today's behaviour (owners, or a personal API key).
--
-- Idempotent: an environment that ran an earlier draft of this migration
-- (NOT NULL DEFAULT '{}') is brought to the same final state.

ALTER TABLE public.carmen_command_center_access
  ADD COLUMN IF NOT EXISTS brain_access jsonb,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.carmen_command_center_access
  ALTER COLUMN brain_access DROP NOT NULL,
  ALTER COLUMN brain_access SET DEFAULT NULL;

-- Rows filled by the earlier draft's '{}' default go back to unrestricted.
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
COMMENT ON COLUMN public.carmen_command_center_access.enabled IS
  'false = this user may not use Carmen at all.';

-- "View as" preview: a manager may learn whether a member of their current
-- tenant has a personal API key (which opens Carmen for users without a
-- permissions row). Returns only a boolean; the key itself stays private.
CREATE OR REPLACE FUNCTION public.carmen_member_has_personal_key(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_api_keys k WHERE k.user_id = p_user_id)
    AND (
      public.is_super_admin(auth.uid())
      OR (
        (
          public.has_role(auth.uid(), 'owner'::public.app_role)
          OR public.has_role(auth.uid(), 'agency_owner'::public.app_role)
          OR public.has_role(auth.uid(), 'team_manager'::public.app_role)
        )
        AND EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.user_id = p_user_id
            AND tu.tenant_id = public.get_effective_tenant_id()
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.carmen_member_has_personal_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carmen_member_has_personal_key(uuid) TO authenticated;
