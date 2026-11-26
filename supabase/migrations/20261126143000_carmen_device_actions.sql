-- Carmen device actions (AIO-667): one row per step Carmen asks the user's
-- browser to do, the only record of that step.
--
-- The server writes a row (pending, short-lived) when the model calls a
-- browser_* tool and ends the turn. The Chrome extension's panel receives only
-- the row's id, claims the row through the carmen-device-action edge function
-- with the user's own session, acts on what the claim returned, and completes
-- the row with what happened. The server then reads the result from the row.
-- Nothing inserts a row yet: the server side ships in a later change.
--
-- status follows DEVICE_ACTION_STATUS and decision follows DEVICE_CARD_RULES
-- (supabase/functions/_shared/carmen/device/contract.ts and card-rule.ts);
-- carmen-device-action/table-lists.test.ts fails when a list here and its list
-- there differ. arguments and result hold what the tool's schema and result
-- type allow, checked by the server and the edge function; result never holds
-- text that was typed into a page. observed_origin and observed_path are the
-- tab's address as the panel saw it when it acted.
--
-- A signed-in user reads only their own rows, in an org they belong to; a
-- super admin only in the org they act in (get_user_tenant_id), because the
-- edge function uses this read as its check before it writes for the caller,
-- and TENANT_ISOLATION.md lets a super admin write only there. Signed-in users
-- hold no INSERT, UPDATE or DELETE: every write is the server's or the edge
-- function's, with the service role. The table is not in the Realtime
-- publication: the site learns of an action from the turn's stream and of its
-- result from the panel's message.
--
-- A row goes with its org, its user or its conversation (ON DELETE CASCADE),
-- and 90 days after it was created (cron job cleanup-carmen-device-actions,
-- daily at 04:07 UTC).
--
-- Triggers fired: none. No existing row or table changes. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.carmen_device_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  -- The chat request the step belongs to; carmen_run_cancellations stops it by this id.
  run_id uuid NOT NULL,
  -- A name in DEVICE_TOOLS.
  tool text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  observed_origin text,
  observed_path text,
  -- The card rule the panel applied: refused, asked the user, or ran without a card.
  decision text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  -- A pending row is claimed before this moment or not at all.
  expires_at timestamptz NOT NULL,
  CONSTRAINT carmen_device_actions_tool_chk
    CHECK (char_length(tool) BETWEEN 1 AND 64),
  CONSTRAINT carmen_device_actions_status_chk
    CHECK (status IN ('pending', 'claimed', 'done', 'refused', 'denied', 'target_changed', 'expired', 'cancelled', 'outcome_unknown')),
  CONSTRAINT carmen_device_actions_decision_chk
    CHECK (decision IS NULL OR decision IN ('never', 'ask', 'free'))
);

COMMENT ON TABLE public.carmen_device_actions IS
  'One row per step Carmen asks the user''s browser to do: written by the server, claimed and completed by the extension''s panel through carmen-device-action (AIO-667).';

-- The server reads one run's rows when the turn continues.
CREATE INDEX IF NOT EXISTS idx_carmen_device_actions_run
  ON public.carmen_device_actions (tenant_id, user_id, run_id);

-- The retention job deletes by age.
CREATE INDEX IF NOT EXISTS idx_carmen_device_actions_created
  ON public.carmen_device_actions (created_at);

ALTER TABLE public.carmen_device_actions ENABLE ROW LEVEL SECURITY;

-- Each user reads their own actions in an org they belong to; a super admin reads their own in the org they act in.
DROP POLICY IF EXISTS carmen_device_actions_select ON public.carmen_device_actions;
CREATE POLICY carmen_device_actions_select
  ON public.carmen_device_actions
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      public.user_is_tenant_member(tenant_id)
      OR (
        public.is_super_admin((SELECT auth.uid()))
        AND tenant_id = public.get_user_tenant_id((SELECT auth.uid()))
      )
    )
  );

-- authenticated is revoked first: the default privileges of the public schema give it every command.
REVOKE ALL ON TABLE public.carmen_device_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.carmen_device_actions TO authenticated;
GRANT ALL ON public.carmen_device_actions TO service_role;

-- Daily retention (re)scheduled, so a re-run keeps one job.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'carmen device actions retention: pg_cron not installed, skipped';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'cleanup-carmen-device-actions';

  -- By age alone, whatever the status: a row is never needed after its turn.
  PERFORM cron.schedule(
    'cleanup-carmen-device-actions',
    '7 4 * * *',
    $job$delete from public.carmen_device_actions
         where created_at < now() - interval '90 days'$job$
  );
END
$$;
