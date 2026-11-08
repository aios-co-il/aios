-- How Carmen talks with callers outside the team (AIO-511).
--
-- One row per org and caller kind: a known client (matched by phone) or an
-- unknown caller. The org writes what Carmen may and may not discuss, what she
-- says about the service, and whether she takes a message or books a meeting.
-- No row means the built-in defaults in
-- supabase/functions/_shared/carmen/caller-policy/policy.ts, so nothing changes
-- on deploy. Her phone line reads it with the service role.
--
-- Members of the org read its policies; owners, agency owners and a super
-- admin acting in the org write them (carmen_manager_is_owner).

CREATE TABLE IF NOT EXISTS public.carmen_caller_policies (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  caller_kind text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  allowed_topics text[] NOT NULL DEFAULT '{}',
  forbidden_topics text[] NOT NULL DEFAULT '{}',
  may_take_message boolean NOT NULL DEFAULT true,
  may_book_meeting boolean NOT NULL DEFAULT false,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, caller_kind),
  CONSTRAINT carmen_caller_policies_kind_chk
    CHECK (caller_kind IN ('client', 'unknown')),
  CONSTRAINT carmen_caller_policies_instructions_chk
    CHECK (char_length(instructions) <= 4000),
  CONSTRAINT carmen_caller_policies_topics_chk
    CHECK (
      cardinality(allowed_topics) <= 50
      AND cardinality(forbidden_topics) <= 50
    )
);

COMMENT ON TABLE public.carmen_caller_policies IS
  'What Carmen may say to clients and unknown callers, per org; no row = defaults (AIO-511).';

-- Keeps updated_at current on every change.
DROP TRIGGER IF EXISTS trg_carmen_caller_policies_updated_at
  ON public.carmen_caller_policies;
CREATE TRIGGER trg_carmen_caller_policies_updated_at
  BEFORE UPDATE ON public.carmen_caller_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.carmen_caller_policies ENABLE ROW LEVEL SECURITY;

-- Members of the org, and super admins, read its policies.
DROP POLICY IF EXISTS carmen_caller_policies_select
  ON public.carmen_caller_policies;
CREATE POLICY carmen_caller_policies_select
  ON public.carmen_caller_policies
  FOR SELECT TO authenticated
  USING (
    public.user_is_tenant_member(tenant_id)
    OR public.is_super_admin((SELECT auth.uid()))
  );

-- Owners of the org (or a super admin acting in it) add a policy.
DROP POLICY IF EXISTS carmen_caller_policies_insert
  ON public.carmen_caller_policies;
CREATE POLICY carmen_caller_policies_insert
  ON public.carmen_caller_policies
  FOR INSERT TO authenticated
  WITH CHECK (public.carmen_manager_is_owner(tenant_id));

-- Owners of the org (or a super admin acting in it) change a policy.
DROP POLICY IF EXISTS carmen_caller_policies_update
  ON public.carmen_caller_policies;
CREATE POLICY carmen_caller_policies_update
  ON public.carmen_caller_policies
  FOR UPDATE TO authenticated
  USING (public.carmen_manager_is_owner(tenant_id))
  WITH CHECK (public.carmen_manager_is_owner(tenant_id));

-- Owners of the org (or a super admin acting in it) remove a policy (back to the defaults).
DROP POLICY IF EXISTS carmen_caller_policies_delete
  ON public.carmen_caller_policies;
CREATE POLICY carmen_caller_policies_delete
  ON public.carmen_caller_policies
  FOR DELETE TO authenticated
  USING (public.carmen_manager_is_owner(tenant_id));

REVOKE ALL ON TABLE public.carmen_caller_policies FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carmen_caller_policies TO authenticated;
GRANT ALL ON public.carmen_caller_policies TO service_role;
