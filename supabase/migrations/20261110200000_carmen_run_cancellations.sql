-- Stop a running Carmen answer (AIO-509).
--
-- The chat's stop button records the run it stops here; run-ai-agent checks for
-- the row before each model round and each tool, and stops the run, so a
-- cancelled request does not go on running tools after the user changed their
-- mind. Each client request carries its own random run_id.
--
-- A signed-in member records a stop for their own runs in their org; run-ai-agent
-- reads with the service role and only honours a stop by the run's own user.

CREATE TABLE IF NOT EXISTS public.carmen_run_cancellations (
  run_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.carmen_run_cancellations IS
  'Runs a user stopped from the chat; run-ai-agent stops them at the next step (AIO-509).';

CREATE INDEX IF NOT EXISTS idx_carmen_run_cancellations_created
  ON public.carmen_run_cancellations (created_at);

ALTER TABLE public.carmen_run_cancellations ENABLE ROW LEVEL SECURITY;

-- A member records a stop as themselves, in an org they belong to.
DROP POLICY IF EXISTS carmen_run_cancellations_insert
  ON public.carmen_run_cancellations;
CREATE POLICY carmen_run_cancellations_insert
  ON public.carmen_run_cancellations
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_tenant_member(tenant_id)
  );

-- A user reads only their own stops.
DROP POLICY IF EXISTS carmen_run_cancellations_select
  ON public.carmen_run_cancellations;
CREATE POLICY carmen_run_cancellations_select
  ON public.carmen_run_cancellations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.carmen_run_cancellations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.carmen_run_cancellations TO authenticated;
GRANT ALL ON public.carmen_run_cancellations TO service_role;
