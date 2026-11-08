-- Each client's full days without results before the pulse alerts
-- (20261107100000_client_pulse_no_results_days, AIO-502): a new client gets 7,
-- 1 and 30 are accepted, 0 and 31 are refused. Without the migration the
-- column is missing and the test fails. Synthetic tenant and rows, full
-- rollback, so it runs on a scratch database, a Preview branch or Staging.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_days smallint;
  v_tag text := left(gen_random_uuid()::text, 8);
  v_value int;
BEGIN
  INSERT INTO public.tenants (id, name, slug)
  VALUES (v_tenant, 'QA no results ' || v_tag, 'qa-no-results-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_tenant, 'QA agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name)
  VALUES (v_client, v_tenant, v_agency, 'QA no results client');

  -- A client nobody set keeps the pulse's former fixed window.
  SELECT pulse_no_results_days INTO v_days FROM public.clients WHERE id = v_client;
  IF v_days IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'client pulse no results days: default is %, expected 7', v_days;
  END IF;

  -- The ends of the range are accepted.
  FOREACH v_value IN ARRAY ARRAY[1, 30] LOOP
    UPDATE public.clients SET pulse_no_results_days = v_value WHERE id = v_client;
  END LOOP;

  -- Values outside 1-30 are refused by the check constraint.
  FOREACH v_value IN ARRAY ARRAY[0, 31] LOOP
    BEGIN
      UPDATE public.clients SET pulse_no_results_days = v_value WHERE id = v_client;
      RAISE EXCEPTION 'client pulse no results days: % was accepted', v_value;
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
  END LOOP;
END;
$test$;
ROLLBACK;
