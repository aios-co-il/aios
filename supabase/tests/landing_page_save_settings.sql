-- Landing page settings (20261118110000_landing_page_projects): landing_page_save_settings lets a
-- member of the project's org create the client's site and the project's page and set the lead
-- destination, stores the webhook URL where members cannot read it, keeps the subdomain and page
-- address fixed, and refuses another org's member. Synthetic rows, rolled back.
BEGIN;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_sub text := 'qa-' || left(replace(gen_random_uuid()::text, '-', ''), 20);
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_video_item uuid := gen_random_uuid();
  v_page uuid;
  v_url text;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_org, 'QA ROLLBACK org', 'qa-lps-org-' || v_tag),
    (v_other_org, 'QA ROLLBACK other', 'qa-lps-other-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_org, 'QA agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name) VALUES (v_client, v_org, v_agency, 'QA client');
  INSERT INTO auth.users (id, email) VALUES
    (v_user, 'qa-lps-' || v_tag || '@aios.co.il'),
    (v_outsider, 'qa-lps-out-' || v_tag || '@aios.co.il');
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_org, v_user, 'admin'),
    (v_other_org, v_outsider, 'admin');
  INSERT INTO public.marketing_work_items (id, tenant_id, client_id, title, payload) VALUES
    (v_item, v_org, v_client, 'QA landing', '{"project_type":"landing","department":"web"}'),
    (v_video_item, v_org, v_client, 'QA video', '{"project_type":"video"}');

  -- A member of another org is refused, and nothing is created.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.landing_page_save_settings(v_item, v_sub, 'home', true, false);
    RAISE EXCEPTION 'another org''s member must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.landing_sites WHERE tenant_id = v_org) THEN
    RAISE EXCEPTION 'a refused save must create nothing';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- A project that is not a landing page is refused.
  BEGIN
    PERFORM public.landing_page_save_settings(v_video_item, v_sub, 'home', true, false);
    RAISE EXCEPTION 'a non-landing project must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- The webhook destination needs a URL, and the URL must be https.
  BEGIN
    PERFORM public.landing_page_save_settings(v_item, v_sub, 'home', false, true);
    RAISE EXCEPTION 'a webhook destination without a URL must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.landing_page_save_settings(v_item, v_sub, 'home', false, true, 'http://hooks.example/a');
    RAISE EXCEPTION 'an http webhook URL must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- The first save creates the site and the page with both destinations.
  v_page := public.landing_page_save_settings(v_item, v_sub, 'home', true, true, 'https://hooks.example/a');
  IF NOT EXISTS (
    SELECT 1 FROM public.landing_pages p JOIN public.landing_sites s ON s.id = p.site_id
     WHERE p.id = v_page AND p.work_item_id = v_item AND p.slug = 'home' AND p.title = 'QA landing'
       AND p.lead_to_crm AND p.lead_to_webhook AND s.subdomain = v_sub AND s.client_id = v_client
  ) THEN
    RAISE EXCEPTION 'the first save must create the site and the page';
  END IF;

  -- Saving again without a URL keeps the stored one; the subdomain and address cannot change.
  PERFORM public.landing_page_save_settings(v_item, v_sub, 'home', false, true);
  BEGIN
    PERFORM public.landing_page_save_settings(v_item, v_sub || 'x', 'home', false, true);
    RAISE EXCEPTION 'the subdomain must not change';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.landing_page_save_settings(v_item, v_sub, 'other', false, true);
    RAISE EXCEPTION 'the page address must not change';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  RESET ROLE;

  SELECT url INTO v_url FROM public.landing_page_webhooks WHERE page_id = v_page;
  IF v_url IS DISTINCT FROM 'https://hooks.example/a' THEN
    RAISE EXCEPTION 'the stored webhook URL must be kept, got %', v_url;
  END IF;
  IF (SELECT lead_to_crm FROM public.landing_pages WHERE id = v_page) THEN
    RAISE EXCEPTION 'the CRM destination must be off after the second save';
  END IF;

  -- Turning the webhook off deletes its URL.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.landing_page_save_settings(v_item, v_sub, 'home', true, false);
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.landing_page_webhooks WHERE page_id = v_page) THEN
    RAISE EXCEPTION 'turning the webhook off must delete its URL';
  END IF;

  -- anon cannot call it.
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.landing_page_save_settings(v_item, v_sub, 'home', true, false);
    RAISE EXCEPTION 'anon must not save settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END;
$test$;

ROLLBACK;
