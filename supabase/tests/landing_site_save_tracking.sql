-- Landing site tracking (20261119230000_landing_site_tracking): landing_site_save_tracking lets a
-- member of the project's org set its site's Tag Manager, GA4 and Meta Pixel ids, refuses ids in
-- the wrong format with the id named, clears an empty id, needs the site to exist, uses the client's
-- site for a project without a page, refuses a project whose page lives on another client's site,
-- and refuses another org's member and anon. Synthetic rows, rolled back.
BEGIN;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_sub text := 'qa-' || left(replace(gen_random_uuid()::text, '-', ''), 20);
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_other_client uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_pageless_item uuid := gen_random_uuid();
  v_site public.landing_sites%rowtype;
  v_message text;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_org, 'QA ROLLBACK org', 'qa-lst-org-' || v_tag),
    (v_other_org, 'QA ROLLBACK other', 'qa-lst-other-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_org, 'QA agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name) VALUES
    (v_client, v_org, v_agency, 'QA client'),
    (v_other_client, v_org, v_agency, 'QA other client');
  INSERT INTO auth.users (id, email) VALUES
    (v_user, 'qa-lst-' || v_tag || '@aios.co.il'),
    (v_outsider, 'qa-lst-out-' || v_tag || '@aios.co.il');
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_org, v_user, 'admin'),
    (v_other_org, v_outsider, 'admin');
  INSERT INTO public.marketing_work_items (id, tenant_id, client_id, title, payload) VALUES
    (v_item, v_org, v_client, 'QA landing', '{"project_type":"landing","department":"web"}'),
    (v_pageless_item, v_org, v_client, 'QA second landing', '{"project_type":"landing","department":"web"}');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Before the project's settings create the site there is nothing to save onto.
  BEGIN
    PERFORM public.landing_site_save_tracking(v_item, 'GTM-ABCD12', null, null);
    RAISE EXCEPTION 'tracking without a site must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  PERFORM public.landing_page_save_settings(v_item, v_sub, 'home', true, false);

  -- Valid ids are stored, trimmed; an empty one is left unset.
  PERFORM public.landing_site_save_tracking(v_item, ' GTM-ABCD12 ', 'G-ABC1234', '');
  RESET ROLE;
  SELECT * INTO v_site FROM public.landing_sites WHERE tenant_id = v_org AND client_id = v_client;
  IF v_site.gtm_id IS DISTINCT FROM 'GTM-ABCD12' OR v_site.ga4_id IS DISTINCT FROM 'G-ABC1234'
     OR v_site.meta_pixel_id IS NOT NULL THEN
    RAISE EXCEPTION 'the ids must be stored as given, got % % %', v_site.gtm_id, v_site.ga4_id, v_site.meta_pixel_id;
  END IF;

  -- An id in the wrong format is refused with that id named, and nothing changes.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.landing_site_save_tracking(v_item, 'GTM-ABCD12', 'G-ABC1234', '123');
    RAISE EXCEPTION 'a short pixel id must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT LIKE '%Meta%' THEN
      RAISE EXCEPTION 'the refusal must name the pixel, got %', v_message;
    END IF;
  END;

  -- Saving all empty clears every id.
  PERFORM public.landing_site_save_tracking(v_item, '', null, ' ');
  RESET ROLE;
  SELECT * INTO v_site FROM public.landing_sites WHERE tenant_id = v_org AND client_id = v_client;
  IF num_nonnulls(v_site.gtm_id, v_site.ga4_id, v_site.meta_pixel_id) <> 0 THEN
    RAISE EXCEPTION 'empty ids must clear the tracking';
  END IF;

  -- A member of another org is refused.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.landing_site_save_tracking(v_item, 'GTM-ZZZZ99', null, null);
    RAISE EXCEPTION 'another org''s member must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- anon cannot call it.
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.landing_site_save_tracking(v_item, 'GTM-ZZZZ99', null, null);
    RAISE EXCEPTION 'anon must not save tracking';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  IF (SELECT gtm_id FROM public.landing_sites WHERE tenant_id = v_org AND client_id = v_client) IS NOT NULL THEN
    RAISE EXCEPTION 'a refused save must change nothing';
  END IF;

  -- EXECUTE is not granted to anon, whoever the token names.
  IF has_function_privilege('anon', 'public.landing_site_save_tracking(uuid,text,text,text)', 'execute') THEN
    RAISE EXCEPTION 'anon must not have EXECUTE on landing_site_save_tracking';
  END IF;

  -- A project of the same client without a page yet saves onto the client's site.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.landing_site_save_tracking(v_pageless_item, null, 'G-PAGELESS1', null);
  RESET ROLE;
  IF (SELECT ga4_id FROM public.landing_sites WHERE tenant_id = v_org AND client_id = v_client)
     IS DISTINCT FROM 'G-PAGELESS1' THEN
    RAISE EXCEPTION 'a project without a page must save onto its client''s site';
  END IF;
  UPDATE public.landing_sites SET ga4_id = null WHERE tenant_id = v_org AND client_id = v_client;

  -- The other client gets a site of its own, and the project moves to that client: its page
  -- stays on the first client's site, so a save is refused and neither site changes.
  INSERT INTO public.landing_sites (tenant_id, client_id, subdomain)
  VALUES (v_org, v_other_client, v_sub || 'b');
  UPDATE public.marketing_work_items SET client_id = v_other_client WHERE id = v_item;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.landing_site_save_tracking(v_item, 'GTM-MOVED1', null, null);
    RAISE EXCEPTION 'a page on another client''s site must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.landing_sites WHERE tenant_id = v_org AND gtm_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a refused save must change neither site';
  END IF;
END;
$test$;

ROLLBACK;
