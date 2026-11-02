-- Pulse refresh rate limit (20261030096000_carmen_pulse_refresh): synthetic
-- claims inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  DELETE FROM public.campaign_pulse_refresh_claims WHERE tenant_id = v_tenant;

  -- The first claim wins; a second inside the interval loses.
  IF NOT public.claim_campaign_pulse_refresh(v_tenant, 600, NULL) THEN
    RAISE EXCEPTION 'claim: the first claim must win';
  END IF;
  IF public.claim_campaign_pulse_refresh(v_tenant, 600, NULL) THEN
    RAISE EXCEPTION 'claim: a second claim inside the interval must lose';
  END IF;

  -- Once the interval has passed the claim wins again and is counted.
  UPDATE public.campaign_pulse_refresh_claims
  SET last_claimed_at = now() - interval '11 minutes'
  WHERE tenant_id = v_tenant;
  IF NOT public.claim_campaign_pulse_refresh(v_tenant, 600, NULL) THEN
    RAISE EXCEPTION 'claim: a claim after the interval must win';
  END IF;
  IF (SELECT claim_count FROM public.campaign_pulse_refresh_claims WHERE tenant_id = v_tenant) <> 2 THEN
    RAISE EXCEPTION 'claim: claim_count must be 2 after two winning claims';
  END IF;

  -- A shorter interval is raised to the 60-second floor.
  UPDATE public.campaign_pulse_refresh_claims
  SET last_claimed_at = now() - interval '30 seconds'
  WHERE tenant_id = v_tenant;
  IF public.claim_campaign_pulse_refresh(v_tenant, 1, NULL) THEN
    RAISE EXCEPTION 'floor: a claim 30 seconds after the last must lose';
  END IF;
  UPDATE public.campaign_pulse_refresh_claims
  SET last_claimed_at = now() - interval '61 seconds'
  WHERE tenant_id = v_tenant;
  IF NOT public.claim_campaign_pulse_refresh(v_tenant, 1, NULL) THEN
    RAISE EXCEPTION 'floor: a claim 61 seconds after the last must win';
  END IF;

  -- No tenant, no claim.
  IF public.claim_campaign_pulse_refresh(NULL, 600, NULL) THEN
    RAISE EXCEPTION 'claim: a NULL tenant must never win';
  END IF;

  -- Browsers may not call the claim or read the claims table.
  IF has_function_privilege('anon', 'public.claim_campaign_pulse_refresh(uuid,integer,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_campaign_pulse_refresh(uuid,integer,uuid)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.campaign_pulse_refresh_claims', 'SELECT')
     OR has_table_privilege('authenticated', 'public.campaign_pulse_refresh_claims', 'SELECT') THEN
    RAISE EXCEPTION 'grants: only the service role may claim or read claims';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_campaign_pulse_refresh(uuid,integer,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: the service role must be able to claim';
  END IF;
END
$test$;
ROLLBACK;
