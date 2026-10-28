-- The workshop's project list (20261026103310_workshop_list_projects_film_clients): synthetic
-- rows inside one transaction that is rolled back. Each row brings the film's format and edit
-- flag, so the board has them with the list and never draws a film before it knows them. The
-- function keeps its grants and runs as the caller.
-- Staging only.
BEGIN;
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
