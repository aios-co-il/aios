-- Abuse limits and loud failures on Carmen's phone line (AIO-511).
--
-- caller_match_key: the caller's number as public.phone_match_key reads it, so
-- carmen-phone counts one number's calls to an org in the last hour however
-- the number was formatted (limits in carmen-phone/limits.ts).
--
-- rate_limited: the call came over that limit. Carmen still answers, but the
-- call takes no messages and sends no summary.
--
-- summary_error: why the call's summary reached no team member. The webhook
-- then clears summary_sent_at, so a redelivered webhook sends it again.
--
-- Only the service role writes calls; RLS and grants are unchanged.

ALTER TABLE public.carmen_phone_calls
  ADD COLUMN IF NOT EXISTS caller_match_key text
    GENERATED ALWAYS AS (public.phone_match_key(caller_phone)) STORED,
  ADD COLUMN IF NOT EXISTS rate_limited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary_error text;

COMMENT ON COLUMN public.carmen_phone_calls.rate_limited IS
  'The caller was over the hourly call limit: no messages, no summary (AIO-511).';

COMMENT ON COLUMN public.carmen_phone_calls.summary_error IS
  'Why the call summary reached no team member; cleared when it is sent (AIO-511).';

CREATE INDEX IF NOT EXISTS idx_carmen_phone_calls_tenant_caller_started
  ON public.carmen_phone_calls (tenant_id, caller_match_key, started_at DESC);
