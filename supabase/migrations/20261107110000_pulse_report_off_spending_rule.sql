-- AIO-501: the pulse alerts when a switched-off report (crm_tables.campaign_active
-- = false) still spends. Its alert is logged in pulse_instant_alert_log under
-- rule_type 'report_off_spending', and that log row is what dedupes it: without
-- this value the insert fails and every run would resend. Schema only; no rows
-- are written and no past alert is replayed.

-- Allows the new rule next to the four existing ones.
ALTER TABLE public.pulse_instant_alert_log
  DROP CONSTRAINT IF EXISTS pulse_instant_alert_log_rule_type_check;

ALTER TABLE public.pulse_instant_alert_log
  ADD CONSTRAINT pulse_instant_alert_log_rule_type_check CHECK (
    rule_type = ANY (ARRAY[
      'no_contact'::text,
      'cpl_spike'::text,
      'connection_lost'::text,
      'campaign_exception'::text,
      'report_off_spending'::text
    ])
  );
