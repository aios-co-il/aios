-- Each client's full days without results before the pulse alerts (AIO-502).
--
-- A lead or sales campaign that spends with 0 leads or sales over the client's
-- last N full days is a pulse exception (buildPulseCampaignRows,
-- _shared/pulse/no-results-window.ts). N was 7 for everyone; the default keeps
-- that, so a client nobody sets behaves as before. The still-spending check
-- (3 full days) and the new-campaign quiet days stay fixed in code.
--
-- The column is on the client row, so its existing RLS applies: whoever may
-- update a client may set it, and the pulse reads it with the service role.
-- No data changes: every existing client gets the default 7.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pulse_no_results_days smallint NOT NULL DEFAULT 7;

-- Holds the value to the 1–30 full days the pulse's 35-day read covers.
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_pulse_no_results_days_chk;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_pulse_no_results_days_chk
  CHECK (pulse_no_results_days BETWEEN 1 AND 30);

COMMENT ON COLUMN public.clients.pulse_no_results_days IS
  'Full days a lead or sales campaign may spend with 0 results before the pulse alerts (1-30, default 7; AIO-502).';
