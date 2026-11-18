-- Landing page pages on the workshop board (20261118120000_workshop_landing_project): the kind
-- check accepts landing_copy and landing_style, still refuses an unknown kind, and is validated
-- (20261118120100). Synthetic rows inside one transaction that is rolled back.
BEGIN;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_org uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES (v_org, 'QA ROLLBACK org', 'qa-wlk-' || v_tag);
  INSERT INTO public.marketing_work_items (id, tenant_id, title, payload)
    VALUES (v_item, v_org, 'QA landing', '{"project_type":"landing","department":"web"}');

  INSERT INTO public.workshop_artifacts (tenant_id, item_id, kind, title) VALUES
    (v_org, v_item, 'landing_copy', 'QA copy'),
    (v_org, v_item, 'landing_style', 'QA style');

  BEGIN
    INSERT INTO public.workshop_artifacts (tenant_id, item_id, kind, title)
      VALUES (v_org, v_item, 'landing_film', 'QA unknown');
    RAISE EXCEPTION 'an unknown kind must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'workshop_artifacts_kind_check'
       AND conrelid = 'public.workshop_artifacts'::regclass
       AND convalidated
  ) THEN
    RAISE EXCEPTION 'workshop_artifacts_kind_check must be validated';
  END IF;
END;
$test$;

ROLLBACK;
