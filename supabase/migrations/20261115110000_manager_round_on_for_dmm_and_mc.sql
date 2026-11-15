-- Manager round: off by default, on for DMM and MarketingCaptain (AIO-598).
-- A tenant with no stored manager mode is now 'off'
-- (DEFAULT_MANAGER_MODE in supabase/functions/_shared/manager-round/modes.ts).
-- These two tenants keep running in 'observe' (record findings, send nothing):
-- their mode is stored explicitly, and only when they have none yet, so a
-- mode an owner already chose is never overwritten. Pinned by id; on a
-- database without these tenants (Staging, Preview) it changes nothing.
-- Fires carmen_manager_settings_guard: no owner check (no auth.uid() here),
-- no notify_since stamp ('observe' does not send), and a ladder reset for
-- the two tenants (they have no planned deliveries in observe).
DO $manager_round_on$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.tenant_heartbeat_settings AS s
  SET pulse_alert_rules = coalesce(s.pulse_alert_rules, '{}'::jsonb)
    || jsonb_build_object(
      'manager',
      CASE WHEN jsonb_typeof(s.pulse_alert_rules -> 'manager') = 'object'
        THEN s.pulse_alert_rules -> 'manager' ELSE '{}'::jsonb END
      || '{"mode": "observe"}'::jsonb)
  WHERE s.tenant_id IN (
      '2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019', -- MarketingCaptain
      '6ad8f321-25db-4a04-8e44-e57a7c8961b2'  -- DMM
    )
    AND (s.pulse_alert_rules -> 'manager' ->> 'mode') IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'manager round turned on (observe) for % tenant(s)', v_rows;
END
$manager_round_on$;
