-- Carmen's phone line (AIO-511): only a super admin registers or changes a number.
--
-- One ElevenLabs agent answers every org, and the phone webhook finds the org by
-- the dialled number, which is unique across orgs. If owners could add numbers,
-- one who registered another org's number first would get that org's calls,
-- transcripts and messages and lock the real owner out. Owners still read and
-- remove their org's numbers.

-- Only a super admin adds a number.
DROP POLICY IF EXISTS carmen_phone_lines_insert ON public.carmen_phone_lines;
CREATE POLICY carmen_phone_lines_insert
  ON public.carmen_phone_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

-- Only a super admin changes a number.
DROP POLICY IF EXISTS carmen_phone_lines_update ON public.carmen_phone_lines;
CREATE POLICY carmen_phone_lines_update
  ON public.carmen_phone_lines
  FOR UPDATE TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

-- Owners of the org, and super admins, remove a number.
DROP POLICY IF EXISTS carmen_phone_lines_delete ON public.carmen_phone_lines;
CREATE POLICY carmen_phone_lines_delete
  ON public.carmen_phone_lines
  FOR DELETE TO authenticated
  USING (
    public.carmen_manager_is_owner(tenant_id)
    OR public.is_super_admin((SELECT auth.uid()))
  );
