-- The pulse's report_off_spending alert (20261107100000_pulse_report_off_spending_rule):
-- its log row is accepted, since that row is the alert's dedupe, and an unknown
-- rule is still refused. A synthetic tenant inside one transaction that is rolled back.
BEGIN;

DO $test$
DECLARE
  v_tenant uuid;
BEGIN
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK pulse', 'qa-pulse-off-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_tenant;

  -- The new rule's log row is accepted.
  INSERT INTO public.pulse_instant_alert_log (tenant_id, rule_type, message, fingerprint)
  VALUES (v_tenant, 'report_off_spending', 'qa', 'report_off_spending:c:t');

  -- Any other rule name is still refused.
  BEGIN
    INSERT INTO public.pulse_instant_alert_log (tenant_id, rule_type, message)
    VALUES (v_tenant, 'qa_unknown_rule', 'qa');
    RAISE EXCEPTION 'an unknown rule_type was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$test$;

ROLLBACK;
