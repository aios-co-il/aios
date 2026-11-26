-- Workshop projects managed by hand (20261126160000_workshop_manual_projects): signed in as a
-- tenant member (authenticated role), inside one transaction that is rolled back. A created
-- project carries the payload Carmen's planner writes for a title alone, and lands in the
-- workshop list; a name is required; rename and archive work on the member's projects and refuse
-- another tenant's; an archived project leaves the list; anon can call none of them.
BEGIN;
DO $test$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_item uuid;
  v_landing uuid;
  v_other_tenant uuid;
  v_other_item uuid;
  v_row public.marketing_work_items;
  v_failed boolean;
BEGIN
  SELECT tu.user_id, tu.tenant_id INTO v_actor, v_tenant
  FROM public.tenant_users tu
  WHERE public.get_user_tenant_id(tu.user_id) = tu.tenant_id
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Requires a non-admin tenant member'; END IF;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK manual projects other', 'qa-manual-other-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_other_tenant;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_other_tenant, 'QA ROLLBACK other', 'draft', '{}')
  RETURNING id INTO v_other_item;

  IF has_function_privilege('anon', 'public.workshop_create_project(uuid, text, text, uuid)', 'execute')
     OR has_function_privilege('anon', 'public.workshop_rename_project(uuid, text)', 'execute')
     OR has_function_privilege('anon', 'public.workshop_archive_project(uuid)', 'execute') THEN
    RAISE EXCEPTION 'anon must not call the manual project RPCs';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;

  -- A film gets the planner's defaults for a title alone; a landing page goes to web.
  v_item := public.workshop_create_project(v_tenant, '  QA ROLLBACK film  ', 'video');
  v_landing := public.workshop_create_project(v_tenant, 'QA ROLLBACK landing', 'landing');
  RESET ROLE;
  SELECT * INTO v_row FROM public.marketing_work_items WHERE id = v_item;
  IF v_row.title <> 'QA ROLLBACK film' OR v_row.status <> 'draft' OR v_row.target_channel <> 'video'
     OR v_row.created_by <> v_actor OR v_row.payload->>'project_type' <> 'video'
     OR v_row.payload->>'format' <> '9:16' OR v_row.payload->>'department' <> 'creative'
     OR v_row.payload->>'intake_source' <> 'manual'
     OR v_row.payload->'workshop'->'film' <> '{"totalSeconds":15,"scenes":5,"sceneSeconds":3}'::jsonb THEN
    RAISE EXCEPTION 'film payload is wrong: % %', v_row.target_channel, v_row.payload;
  END IF;
  SELECT * INTO v_row FROM public.marketing_work_items WHERE id = v_landing;
  IF v_row.target_channel <> 'landing' OR v_row.payload->>'department' <> 'web'
     OR v_row.payload->'workshop'->>'kind' <> 'landing'
     OR v_row.payload->'workshop'->'film' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'landing payload is wrong: % %', v_row.target_channel, v_row.payload;
  END IF;
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (SELECT 1 FROM public.workshop_list_projects(v_tenant, 'general') l WHERE l.id = v_item) THEN
    RAISE EXCEPTION 'a created project should be in the workshop list';
  END IF;

  -- A name is required, and the type must be one the workshop knows.
  BEGIN
    PERFORM public.workshop_create_project(v_tenant, '   ', 'video');
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an empty name must be refused'; END IF;
  BEGIN
    PERFORM public.workshop_create_project(v_tenant, 'QA ROLLBACK', 'podcast');
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an unknown type must be refused'; END IF;

  -- Another tenant's project cannot be created, renamed or archived.
  BEGIN
    PERFORM public.workshop_create_project(v_other_tenant, 'QA ROLLBACK', 'video');
    v_failed := false;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'creating in another tenant must be refused'; END IF;
  BEGIN
    PERFORM public.workshop_rename_project(v_other_item, 'stolen');
    v_failed := false;
  EXCEPTION WHEN no_data_found THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'renaming another tenant''s project must be refused'; END IF;
  BEGIN
    PERFORM public.workshop_archive_project(v_other_item);
    v_failed := false;
  EXCEPTION WHEN no_data_found THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'archiving another tenant''s project must be refused'; END IF;

  -- Rename trims the name and refuses an empty one; archive takes the project off the list.
  PERFORM public.workshop_rename_project(v_item, '  QA ROLLBACK renamed ');
  BEGIN
    PERFORM public.workshop_rename_project(v_item, '');
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'renaming to an empty name must be refused'; END IF;
  PERFORM public.workshop_archive_project(v_item);
  IF EXISTS (SELECT 1 FROM public.workshop_list_projects(v_tenant, 'general') l WHERE l.id = v_item) THEN
    RAISE EXCEPTION 'an archived project must leave the workshop list';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT * INTO v_row FROM public.marketing_work_items WHERE id = v_item;
  IF v_row.title <> 'QA ROLLBACK renamed' OR v_row.status <> 'archived' THEN
    RAISE EXCEPTION 'rename then archive should leave % / %', v_row.title, v_row.status;
  END IF;
  IF (SELECT title FROM public.marketing_work_items WHERE id = v_other_item) <> 'QA ROLLBACK other' THEN
    RAISE EXCEPTION 'another tenant''s project must stay unchanged';
  END IF;

  RAISE NOTICE 'workshop_manual_projects: all checks passed';
END;
$test$;
ROLLBACK;
