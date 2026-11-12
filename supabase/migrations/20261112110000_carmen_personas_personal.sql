-- Personal agents stay personal (AIO-576).
--
-- A member's edit of a built-in character (Carmen, Mini Me, AIOS) becomes
-- their own version (owner_user_id set) instead of changing it for the whole
-- org. Org-level rows (owner_user_id NULL: an org edit of a built-in, or a
-- character shared with the org) are written only by the org's owners and by
-- super admins, as tenant_settings are. Members still read the org's rows and
-- their own, and write their own.
--
-- Rows already stored keep their owner: an org-level row a member saved before
-- this change stays org-level, and only an owner or super admin can now change
-- or remove it. Safe to re-run.

ALTER TABLE public.carmen_personas
  DROP CONSTRAINT IF EXISTS carmen_personas_builtin_chk;
ALTER TABLE public.carmen_personas
  ADD CONSTRAINT carmen_personas_builtin_chk
  CHECK (builtin_key IS NULL OR builtin_key IN ('carmen', 'minime', 'aios'));

-- One org edit of each built-in, and one personal version of it per user.
DROP INDEX IF EXISTS public.carmen_personas_tenant_builtin_key;
CREATE UNIQUE INDEX IF NOT EXISTS carmen_personas_tenant_builtin_key
  ON public.carmen_personas (tenant_id, builtin_key)
  WHERE builtin_key IS NOT NULL AND owner_user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS carmen_personas_tenant_owner_builtin_key
  ON public.carmen_personas (tenant_id, owner_user_id, builtin_key)
  WHERE builtin_key IS NOT NULL AND owner_user_id IS NOT NULL;

-- Members add their own characters; owners and super admins also add the org's.
DROP POLICY IF EXISTS carmen_personas_insert ON public.carmen_personas;
CREATE POLICY carmen_personas_insert
  ON public.carmen_personas
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.user_is_tenant_member(tenant_id)
      AND owner_user_id = (SELECT auth.uid()))
    OR (owner_user_id IS NULL AND (
      public.is_super_admin((SELECT auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.tenant_id = carmen_personas.tenant_id
          AND tu.user_id = (SELECT auth.uid())
          AND tu.role = 'owner'
      )
    ))
  );

-- Members edit their own characters; owners and super admins also edit the org's.
DROP POLICY IF EXISTS carmen_personas_update ON public.carmen_personas;
CREATE POLICY carmen_personas_update
  ON public.carmen_personas
  FOR UPDATE TO authenticated
  USING (
    (public.user_is_tenant_member(tenant_id)
      AND owner_user_id = (SELECT auth.uid()))
    OR (owner_user_id IS NULL AND (
      public.is_super_admin((SELECT auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.tenant_id = carmen_personas.tenant_id
          AND tu.user_id = (SELECT auth.uid())
          AND tu.role = 'owner'
      )
    ))
  )
  WITH CHECK (
    (public.user_is_tenant_member(tenant_id)
      AND owner_user_id = (SELECT auth.uid()))
    OR (owner_user_id IS NULL AND (
      public.is_super_admin((SELECT auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.tenant_id = carmen_personas.tenant_id
          AND tu.user_id = (SELECT auth.uid())
          AND tu.role = 'owner'
      )
    ))
  );

-- Members remove their own characters; owners and super admins also remove the org's.
DROP POLICY IF EXISTS carmen_personas_delete ON public.carmen_personas;
CREATE POLICY carmen_personas_delete
  ON public.carmen_personas
  FOR DELETE TO authenticated
  USING (
    (public.user_is_tenant_member(tenant_id)
      AND owner_user_id = (SELECT auth.uid()))
    OR (owner_user_id IS NULL AND (
      public.is_super_admin((SELECT auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.tenant_id = carmen_personas.tenant_id
          AND tu.user_id = (SELECT auth.uid())
          AND tu.role = 'owner'
      )
    ))
  );

COMMENT ON TABLE public.carmen_personas IS
  'Assistant characters: org-level rows (owner_user_id NULL, written by owners and super admins) and users'' own, including their versions of the built-ins (AIO-570, AIO-576).';
