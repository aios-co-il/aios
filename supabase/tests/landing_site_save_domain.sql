-- Landing site custom domain (20261120100000_landing_site_domain): landing_site_save_domain lets a
-- member of the project's org set its site's custom domain, stores it trimmed and lowercased,
-- refuses a scheme, path, port, single label or aios.co.il hostname, refuses a domain another site
-- uses (in any org), clears it when empty, resets its verification when it changes, needs the site
-- to exist, and refuses another org's member and anon; landing_site_of_project resolves the site
-- for the caller. Synthetic rows, rolled back.
BEGIN;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_sub text := 'qa-' || left(replace(gen_random_uuid()::text, '-', ''), 20);
  v_domain text := 'lp.qa-' || left(v_tag, 12) || '.co.il';
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_other_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_other_client uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_site public.landing_sites%rowtype;
  v_resolved record;
  v_bad text;
  v_message text;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_org, 'QA ROLLBACK org', 'qa-lsd-org-' || v_tag),
    (v_other_org, 'QA ROLLBACK other', 'qa-lsd-other-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES
    (v_agency, v_org, 'QA agency'),
    (v_other_agency, v_other_org, 'QA other agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name) VALUES
    (v_client, v_org, v_agency, 'QA client'),
    (v_other_client, v_other_org, v_other_agency, 'QA other org client');
  INSERT INTO auth.users (id, email) VALUES
    (v_user, 'qa-lsd-' || v_tag || '@aios.co.il'),
    (v_outsider, 'qa-lsd-out-' || v_tag || '@aios.co.il');
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_org, v_user, 'admin'),
    (v_other_org, v_outsider, 'admin');
  INSERT INTO public.marketing_work_items (id, tenant_id, client_id, title, payload) VALUES
    (v_item, v_org, v_client, 'QA landing', '{"project_type":"landing","department":"web"}');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Before the project's settings create the site there is nothing to save onto.
  BEGIN
    PERFORM public.landing_site_save_domain(v_item, v_domain);
    RAISE EXCEPTION 'a domain without a site must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  PERFORM public.landing_page_save_settings(v_item, v_sub, 'home', true, false);

  -- The resolver names the project's site and org.
  SELECT * INTO v_resolved FROM public.landing_site_of_project(v_item);
  IF v_resolved.tenant_id IS DISTINCT FROM v_org OR v_resolved.site_id IS DISTINCT FROM
     (SELECT id FROM public.landing_sites WHERE tenant_id = v_org AND client_id = v_client) THEN
    RAISE EXCEPTION 'landing_site_of_project must return the project''s site and org';
  END IF;

  -- A valid domain is stored trimmed and lowercased.
  PERFORM public.landing_site_save_domain(v_item, '  ' || upper(v_domain) || ' ');
  RESET ROLE;
  SELECT * INTO v_site FROM public.landing_sites WHERE tenant_id = v_org AND client_id = v_client;
  IF v_site.custom_domain IS DISTINCT FROM v_domain THEN
    RAISE EXCEPTION 'the domain must be stored lowercased, got %', v_site.custom_domain;
  END IF;

  -- Saving the same domain keeps its verification; a different one resets it.
  UPDATE public.landing_sites SET custom_domain_verified_at = now() WHERE id = v_site.id;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.landing_site_save_domain(v_item, v_domain);
  RESET ROLE;
  IF (SELECT custom_domain_verified_at FROM public.landing_sites WHERE id = v_site.id) IS NULL THEN
    RAISE EXCEPTION 'saving the same domain must keep its verification';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.landing_site_save_domain(v_item, 'www.' || v_domain);
  RESET ROLE;
  SELECT * INTO v_site FROM public.landing_sites WHERE id = v_site.id;
  IF v_site.custom_domain IS DISTINCT FROM 'www.' || v_domain OR v_site.custom_domain_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'a changed domain must be stored unverified';
  END IF;

  -- Hostnames with a scheme, path, port or one label, and aios.co.il ones, are refused.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_bad IN ARRAY ARRAY[
    'https://' || v_domain, v_domain || '/offer', v_domain || ':443', 'localhost',
    '-bad.example.com', 'lp..example.com', 'lp_x.example.com', 'aios.co.il', 'exsitu.aios.co.il'
  ] LOOP
    BEGIN
      PERFORM public.landing_site_save_domain(v_item, v_bad);
      RAISE EXCEPTION 'the domain % must be refused', v_bad;
    EXCEPTION WHEN invalid_parameter_value THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      IF v_bad LIKE '%aios.co.il' AND v_message NOT LIKE '%aios.co.il%' THEN
        RAISE EXCEPTION 'an aios.co.il refusal must say so, got %', v_message;
      END IF;
    END;
  END LOOP;
  RESET ROLE;

  -- A domain another org's site uses is refused, and nothing changes.
  INSERT INTO public.landing_sites (tenant_id, client_id, subdomain, custom_domain)
  VALUES (v_other_org, v_other_client, v_sub || 'b', 'taken.' || v_domain);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.landing_site_save_domain(v_item, 'TAKEN.' || v_domain);
    RAISE EXCEPTION 'a domain used by another site must be refused';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT LIKE '%אתר אחר%' THEN
      RAISE EXCEPTION 'the refusal must say another site uses the domain, got %', v_message;
    END IF;
  END;
  RESET ROLE;
  IF (SELECT custom_domain FROM public.landing_sites WHERE id = v_site.id) IS DISTINCT FROM 'www.' || v_domain THEN
    RAISE EXCEPTION 'a refused save must change nothing';
  END IF;

  -- A member of another org is refused.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.landing_site_save_domain(v_item, 'other.' || v_domain);
    RAISE EXCEPTION 'another org''s member must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.landing_site_of_project(v_item);
    RAISE EXCEPTION 'another org''s member must not resolve the site';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- anon cannot call either function.
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.landing_site_save_domain(v_item, 'anon.' || v_domain);
    RAISE EXCEPTION 'anon must not save a domain';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  IF has_function_privilege('anon', 'public.landing_site_save_domain(uuid,text)', 'execute') THEN
    RAISE EXCEPTION 'anon must not have EXECUTE on landing_site_save_domain';
  END IF;
  IF has_function_privilege('anon', 'public.landing_site_of_project(uuid)', 'execute') THEN
    RAISE EXCEPTION 'anon must not have EXECUTE on landing_site_of_project';
  END IF;

  -- An empty value clears the domain and its verification.
  UPDATE public.landing_sites SET custom_domain_verified_at = now() WHERE id = v_site.id;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.landing_site_save_domain(v_item, '  ');
  RESET ROLE;
  SELECT * INTO v_site FROM public.landing_sites WHERE id = v_site.id;
  IF v_site.custom_domain IS NOT NULL OR v_site.custom_domain_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'an empty value must clear the domain and its verification';
  END IF;
END;
$test$;

ROLLBACK;
