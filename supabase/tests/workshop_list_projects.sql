-- The workshop's project list (20261026103310_workshop_list_projects_film_clients): synthetic
-- rows inside one transaction that is rolled back. Each row brings the film's format and edit
-- flag, so the board has them with the list and never draws a film before it knows them. The
-- function keeps its grants and runs as the caller. It lists only items with no client or with
-- a client the workshop's client picker shows (ClientSelector: the tenant's active clients); the
-- checks run as the owner, so RLS hides nothing and the function's own rule must.
-- Staging only: needs two tenants.
BEGIN;
DO $clients$
DECLARE
  v_tenant uuid;
  v_other uuid;
  v_agency uuid;
  v_shared_agency uuid;
  v_active uuid;
  v_paused uuid;
  v_shared uuid;
  v_none uuid;
  v_of_active uuid;
  v_of_paused uuid;
  v_of_shared uuid;
  v_listed uuid[];
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT id INTO v_other FROM public.tenants WHERE id <> v_tenant ORDER BY id LIMIT 1;
  IF v_other IS NULL THEN RAISE EXCEPTION 'Requires two tenants'; END IF;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK agency', v_tenant)
  RETURNING id INTO v_agency;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK shared agency', v_other)
  RETURNING id INTO v_shared_agency;
  INSERT INTO public.clients (agency_id, tenant_id, name, status)
  VALUES (v_agency, v_tenant, 'QA ROLLBACK active client', 'active') RETURNING id INTO v_active;
  INSERT INTO public.clients (agency_id, tenant_id, name, status)
  VALUES (v_agency, v_tenant, 'QA ROLLBACK paused client', 'paused') RETURNING id INTO v_paused;
  -- Another tenant's client, which a shared agency can let the caller see.
  INSERT INTO public.clients (agency_id, tenant_id, name, status)
  VALUES (v_shared_agency, v_other, 'QA ROLLBACK shared client', 'active') RETURNING id INTO v_shared;

  INSERT INTO public.marketing_work_items (tenant_id, client_id, title, status, payload)
  VALUES (v_tenant, NULL, 'QA ROLLBACK no client', 'draft', '{"workshop":{}}') RETURNING id INTO v_none;
  INSERT INTO public.marketing_work_items (tenant_id, client_id, title, status, payload)
  VALUES (v_tenant, v_active, 'QA ROLLBACK active', 'draft', '{"workshop":{}}') RETURNING id INTO v_of_active;
  INSERT INTO public.marketing_work_items (tenant_id, client_id, title, status, payload)
  VALUES (v_tenant, v_paused, 'QA ROLLBACK paused', 'draft', '{"workshop":{}}') RETURNING id INTO v_of_paused;
  INSERT INTO public.marketing_work_items (tenant_id, client_id, title, status, payload)
  VALUES (v_tenant, v_shared, 'QA ROLLBACK shared', 'draft', '{"workshop":{}}') RETURNING id INTO v_of_shared;

  SELECT coalesce(array_agg(l.id), '{}') INTO v_listed
  FROM public.workshop_list_projects(v_tenant, 'all', 500) l
  WHERE l.id IN (v_none, v_of_active, v_of_paused, v_of_shared);
  IF NOT v_listed @> ARRAY[v_none, v_of_active] THEN
    RAISE EXCEPTION 'clients: items with no client or an active client of the tenant are listed (%)', v_listed;
  END IF;
  IF v_listed && ARRAY[v_of_paused, v_of_shared] THEN
    RAISE EXCEPTION 'clients: a paused client''s or another tenant''s client''s items are not listed (%)', v_listed;
  END IF;

  -- One client outside the picker is like an unknown one: an empty list.
  IF EXISTS (SELECT 1 FROM public.workshop_list_projects(v_tenant, v_paused::text, 500))
     OR EXISTS (SELECT 1 FROM public.workshop_list_projects(v_tenant, v_shared::text, 500)) THEN
    RAISE EXCEPTION 'clients: a client outside the picker lists nothing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workshop_list_projects(v_tenant, v_active::text, 500) l
                 WHERE l.id = v_of_active AND l.client_name = 'QA ROLLBACK active client') THEN
    RAISE EXCEPTION 'clients: an active client lists its own items, with its name';
  END IF;

  RAISE NOTICE 'workshop_list_projects: client checks passed';
END;
$clients$;

DO $film$
DECLARE
  v_tenant uuid;
  v_cut uuid;
  v_plain uuid;
  r record;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK cut film', 'draft',
          '{"workshop":{},"format":"16:9","workshop_edit":true}')
  RETURNING id INTO v_cut;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK plain film', 'draft', '{"workshop":{},"workshop_edit":"true"}')
  RETURNING id INTO v_plain;

  SELECT * INTO r FROM public.workshop_list_projects(v_tenant, 'general', 500) l WHERE l.id = v_cut;
  IF r.format IS DISTINCT FROM '16:9' OR r.workshop_edit IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'film: a cut film brings its format and edit flag (%, %)', r.format, r.workshop_edit;
  END IF;

  -- No format, and an edit flag that is not JSON true: the board's defaults, never null.
  SELECT * INTO r FROM public.workshop_list_projects(v_tenant, 'general', 500) l WHERE l.id = v_plain;
  IF r.format IS NOT NULL OR r.workshop_edit IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'film: a plain film has no format and is not cut (%, %)', r.format, r.workshop_edit;
  END IF;

  IF (SELECT p.prosecdef OR p.provolatile <> 's' FROM pg_proc p
      WHERE p.oid = 'public.workshop_list_projects(uuid, text, int)'::regprocedure) THEN
    RAISE EXCEPTION 'grants: the function stays stable and security invoker';
  END IF;
  IF has_function_privilege('anon', 'public.workshop_list_projects(uuid, text, int)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.workshop_list_projects(uuid, text, int)', 'execute') THEN
    RAISE EXCEPTION 'grants: signed-in users run it, anonymous callers do not';
  END IF;

  RAISE NOTICE 'workshop_list_projects: film checks passed';
END;
$film$;
ROLLBACK;
