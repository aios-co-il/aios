-- Landing pages (20261117120000_landing_page_client_check): landing_page_client_matches is
-- true only for a live client of the given active or trial org, the anon role can call it,
-- and the old org-only check is gone. Synthetic rows inside one transaction that is rolled back.
BEGIN;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
BEGIN
  IF to_regprocedure('public.landing_page_tenant_matches(text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'landing_page_tenant_matches must be dropped';
  END IF;

  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_org, 'QA ROLLBACK org', 'qa-lpc-org-' || v_tag),
    (v_other_org, 'QA ROLLBACK other', 'qa-lpc-other-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_org, 'QA agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name) VALUES (v_client, v_org, v_agency, 'QA client');

  SET LOCAL ROLE anon;

  -- The org's own live client matches.
  IF NOT public.landing_page_client_matches(v_org, v_client) THEN
    RAISE EXCEPTION 'anon: own client must match';
  END IF;

  -- The same client under another org, or an unknown client, does not match.
  IF public.landing_page_client_matches(v_other_org, v_client) THEN
    RAISE EXCEPTION 'anon: another org must not match the client';
  END IF;
  IF public.landing_page_client_matches(v_org, gen_random_uuid()) THEN
    RAISE EXCEPTION 'anon: an unknown client must not match';
  END IF;

  -- An ended client, or a suspended org, no longer matches.
  RESET ROLE;
  UPDATE public.clients SET status = 'ended' WHERE id = v_client;
  SET LOCAL ROLE anon;
  IF public.landing_page_client_matches(v_org, v_client) THEN
    RAISE EXCEPTION 'anon: an ended client must not match';
  END IF;
  RESET ROLE;
  UPDATE public.clients SET status = 'active' WHERE id = v_client;
  UPDATE public.tenants SET status = 'suspended' WHERE id = v_org;
  SET LOCAL ROLE anon;
  IF public.landing_page_client_matches(v_org, v_client) THEN
    RAISE EXCEPTION 'anon: a suspended org must not match';
  END IF;
  RESET ROLE;
END;
$test$;

ROLLBACK;
