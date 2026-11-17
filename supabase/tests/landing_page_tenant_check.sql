-- Landing pages (20261117110000_landing_page_tenant_check): landing_page_tenant_matches is
-- true only for the subdomain and id of the same active or trial org, and the
-- anon role can call it. Synthetic tenants inside one transaction that is rolled back.
BEGIN;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_own uuid;
  v_other uuid;
BEGIN
  INSERT INTO public.tenants (name, slug, subdomain)
  VALUES ('QA ROLLBACK own', 'qa-lp-own-' || v_tag, 'qa-own-' || v_tag) RETURNING id INTO v_own;
  INSERT INTO public.tenants (name, slug, subdomain, status)
  VALUES ('QA ROLLBACK other', 'qa-lp-other-' || v_tag, 'qa-other-' || v_tag, 'trial') RETURNING id INTO v_other;

  SET LOCAL ROLE anon;

  -- The org's own subdomain and id match, case and spaces ignored; a trial org matches too.
  IF NOT public.landing_page_tenant_matches(' QA-OWN-' || v_tag, v_own) THEN
    RAISE EXCEPTION 'anon: own subdomain and id must match';
  END IF;
  IF NOT public.landing_page_tenant_matches('qa-other-' || v_tag, v_other) THEN
    RAISE EXCEPTION 'anon: a trial org must match';
  END IF;

  -- Another org's id, or an unknown subdomain, does not match.
  IF public.landing_page_tenant_matches('qa-own-' || v_tag, v_other) THEN
    RAISE EXCEPTION 'anon: another org''s id must not match';
  END IF;
  IF public.landing_page_tenant_matches('qa-missing-' || v_tag, v_own) THEN
    RAISE EXCEPTION 'anon: an unknown subdomain must not match';
  END IF;

  -- A suspended org no longer matches.
  RESET ROLE;
  UPDATE public.tenants SET status = 'suspended' WHERE id = v_own;
  SET LOCAL ROLE anon;
  IF public.landing_page_tenant_matches('qa-own-' || v_tag, v_own) THEN
    RAISE EXCEPTION 'anon: a suspended org must not match';
  END IF;
  RESET ROLE;
END;
$test$;

ROLLBACK;
