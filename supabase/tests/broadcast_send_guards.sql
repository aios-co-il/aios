-- Automation send guards (20261021120000_broadcast_send_guards): synthetic
-- automation / broadcasts inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_auto uuid;
  v_step text := 'qa-step-' || gen_random_uuid();
  r1 record;
  r2 record;
  r3 record;
  v_idle uuid;
  v_capped uuid;
  v_ok uuid;
  v_ids uuid[];
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  INSERT INTO public.automations (name, trigger_type, action_type, configuration, active)
  VALUES ('QA ROLLBACK send guard', 'lead_created', 'webhook', '{}', true)
  RETURNING id INTO v_auto;

  -- Reservation: one send per interval per (automation, step).
  SELECT * INTO r1 FROM public.broadcast_reserve_automation_send(
    v_tenant, v_auto, v_step, 1, 'QA ROLLBACK', 'email', 'resend');
  SELECT * INTO r2 FROM public.broadcast_reserve_automation_send(
    v_tenant, v_auto, v_step, 1, 'QA ROLLBACK', 'email', 'resend');
  IF NOT r1.reserved OR r2.reserved OR r2.broadcast_id <> r1.broadcast_id THEN
    RAISE EXCEPTION 'reserve: second call within the interval must return the first draft (% / %)', r1, r2;
  END IF;
  SELECT * INTO r3 FROM public.broadcast_reserve_automation_send(
    v_tenant, v_auto, v_step, 0, 'QA ROLLBACK', 'email', 'resend');
  IF NOT r3.reserved OR r3.broadcast_id = r1.broadcast_id THEN
    RAISE EXCEPTION 'reserve: interval 0 must always reserve a new draft';
  END IF;
  IF (SELECT status FROM public.broadcasts WHERE id = r1.broadcast_id) <> 'draft' THEN
    RAISE EXCEPTION 'reserve: reserved broadcast is not a draft';
  END IF;

  -- Dispatch candidates: only sending broadcasts that can send now.
  INSERT INTO public.broadcasts (tenant_id, name, channel, provider, status, started_at)
  VALUES (v_tenant, 'QA ROLLBACK idle', 'email', 'resend', 'sending', now() - interval '3 days')
  RETURNING id INTO v_idle;
  INSERT INTO public.broadcasts (tenant_id, name, channel, provider, status, started_at, daily_cap)
  VALUES (v_tenant, 'QA ROLLBACK capped', 'email', 'resend', 'sending', now() - interval '3 days', 1)
  RETURNING id INTO v_capped;
  INSERT INTO public.broadcasts (tenant_id, name, channel, provider, status, started_at)
  VALUES (v_tenant, 'QA ROLLBACK ok', 'email', 'resend', 'sending', now() - interval '3 days')
  RETURNING id INTO v_ok;

  INSERT INTO public.broadcast_recipients (broadcast_id, tenant_id, entity_type, email, status, sent_at)
  VALUES
    (v_idle, v_tenant, 'manual', 'idle@example.invalid', 'sent', now() - interval '2 days'),
    (v_capped, v_tenant, 'manual', 'capped-sent@example.invalid', 'sent', now()),
    (v_capped, v_tenant, 'manual', 'capped-pending@example.invalid', 'pending', NULL),
    (v_ok, v_tenant, 'manual', 'ok@example.invalid', 'pending', NULL);

  SELECT array_agg(id) INTO v_ids FROM public.broadcast_dispatch_candidates(100000);
  IF NOT (v_ok = ANY (coalesce(v_ids, '{}'))) THEN
    RAISE EXCEPTION 'dispatch: broadcast with pending recipients is missing';
  END IF;
  IF v_idle = ANY (coalesce(v_ids, '{}')) THEN
    RAISE EXCEPTION 'dispatch: idle broadcast (no pending recipients) was selected';
  END IF;
  IF v_capped = ANY (coalesce(v_ids, '{}')) THEN
    RAISE EXCEPTION 'dispatch: broadcast at its daily cap was selected';
  END IF;

  RAISE NOTICE 'broadcast_send_guards: all checks passed';
END;
$test$;
ROLLBACK;
