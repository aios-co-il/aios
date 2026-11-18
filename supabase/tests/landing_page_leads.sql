-- Landing page leads (20261118100000_landing_page_leads): org members read their own org's sites,
-- pages and leads; nobody but service_role reads a webhook URL; a page cannot sit in another org
-- than its site, and a site cannot name another org's client. Synthetic rows, rolled back.
BEGIN;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_site uuid := gen_random_uuid();
  v_page uuid := gen_random_uuid();
  v_count integer;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_org, 'QA ROLLBACK org', 'qa-lpl-org-' || v_tag),
    (v_other_org, 'QA ROLLBACK other', 'qa-lpl-other-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_org, 'QA agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name) VALUES (v_client, v_org, v_agency, 'QA client');
  INSERT INTO auth.users (id, email) VALUES
    (v_user, 'qa-lpl-' || v_tag || '@aios.co.il'),
    (v_outsider, 'qa-lpl-out-' || v_tag || '@aios.co.il');
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_org, v_user, 'admin'),
    (v_other_org, v_outsider, 'admin');

  INSERT INTO public.landing_sites (id, tenant_id, client_id, subdomain)
    VALUES (v_site, v_org, v_client, 'qa-' || left(v_tag, 20));
  INSERT INTO public.landing_pages (id, tenant_id, site_id, slug, title, lead_to_webhook)
    VALUES (v_page, v_org, v_site, 'home', 'QA page', true);
  INSERT INTO public.landing_page_webhooks (page_id, tenant_id, url)
    VALUES (v_page, v_org, 'https://hooks.example/qa');
  INSERT INTO public.landing_leads (tenant_id, page_id, name, phone)
    VALUES (v_org, v_page, 'QA lead', '0500000000');

  -- A site cannot name a client of another org.
  BEGIN
    INSERT INTO public.landing_sites (tenant_id, client_id, subdomain)
      VALUES (v_other_org, v_client, 'qa-x-' || left(v_tag, 20));
    RAISE EXCEPTION 'a site must not take another org''s client';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A page cannot sit in another org than its site.
  BEGIN
    INSERT INTO public.landing_pages (tenant_id, site_id, slug, title)
      VALUES (v_other_org, v_site, 'other', 'QA other');
    RAISE EXCEPTION 'a page must stay in its site''s org';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- A webhook URL must be https.
  BEGIN
    UPDATE public.landing_page_webhooks SET url = 'http://hooks.example/qa' WHERE page_id = v_page;
    RAISE EXCEPTION 'a webhook URL must be https';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- An org member reads the org's site, page and lead, cannot read the webhook URL, cannot write.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.landing_sites WHERE id = v_site;
  IF v_count <> 1 THEN RAISE EXCEPTION 'member must read the site'; END IF;
  SELECT count(*) INTO v_count FROM public.landing_pages WHERE id = v_page;
  IF v_count <> 1 THEN RAISE EXCEPTION 'member must read the page'; END IF;
  SELECT count(*) INTO v_count FROM public.landing_leads WHERE page_id = v_page;
  IF v_count <> 1 THEN RAISE EXCEPTION 'member must read the lead'; END IF;
  BEGIN
    PERFORM 1 FROM public.landing_page_webhooks;
    RAISE EXCEPTION 'member must not read webhook URLs';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.landing_pages SET lead_to_crm = true WHERE id = v_page;
    RAISE EXCEPTION 'member must not write pages directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A member of another org sees none of it.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT (SELECT count(*) FROM public.landing_sites WHERE id = v_site)
       + (SELECT count(*) FROM public.landing_pages WHERE id = v_page)
       + (SELECT count(*) FROM public.landing_leads WHERE page_id = v_page) INTO v_count;
  IF v_count <> 0 THEN RAISE EXCEPTION 'another org must see nothing, saw % rows', v_count; END IF;
  RESET ROLE;

  -- anon has no access at all.
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.landing_sites;
    RAISE EXCEPTION 'anon must not read sites';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END;
$test$;

ROLLBACK;
