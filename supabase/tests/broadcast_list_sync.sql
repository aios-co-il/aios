-- Synced mailing lists (20261021140000_broadcast_review_fixes): synthetic
-- leads / lists / automation inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_list uuid;
  v_lead uuid;
  v_member uuid;
  v_auto uuid;
  v_list2 uuid;
  v_lead2 uuid;
  v_cfg jsonb;
  v_err text;
  v_phone text;
  v_fields jsonb;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;

  INSERT INTO public.broadcast_lists (tenant_id, name, kind, source, source_config)
  VALUES (v_tenant, 'QA ROLLBACK synced', 'synced', 'crm_filter',
          '{"source":"leads","stageKeys":["qa-stage"]}')
  RETURNING id INTO v_list;

  -- 1. A matching lead joins the list.
  INSERT INTO public.leads (tenant_id, company_name, contact_name, status, phone)
  VALUES (v_tenant, 'QA ROLLBACK', 'QA Lead', 'qa-stage', '050-123-4567')
  RETURNING id INTO v_lead;
  SELECT id, phone INTO v_member, v_phone FROM public.broadcast_list_members
  WHERE list_id = v_list AND entity_id = v_lead AND added_via = 'sync';
  IF v_member IS NULL OR v_phone <> '972501234567' THEN
    RAISE EXCEPTION '1: matching lead was not added (phone %)', v_phone;
  END IF;
  SELECT source_config INTO v_cfg FROM public.broadcast_lists WHERE id = v_list;
  IF NOT public.broadcast_entity_matches(v_tenant, 'lead', v_lead, v_cfg) THEN
    RAISE EXCEPTION '1: broadcast_entity_matches is false';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.broadcast_matching_entity_ids(v_tenant, 'lead', v_cfg) m(id)
                 WHERE m.id = v_lead) THEN
    RAISE EXCEPTION '1: broadcast_matching_entity_ids misses the lead';
  END IF;
  IF public.broadcast_entity_matches(v_tenant, 'client', v_lead, v_cfg)
    OR public.broadcast_entity_matches(v_tenant, 'lead', v_lead, v_cfg || '{"source":"clients"}')
    OR public.broadcast_entity_matches(v_tenant, 'bogus', v_lead, v_cfg) THEN
    RAISE EXCEPTION '1: wrong entity type / source must not match';
  END IF;

  -- 2. A phone change updates the same row and keeps custom_fields.
  UPDATE public.broadcast_list_members SET custom_fields = '{"x":"1"}' WHERE id = v_member;
  UPDATE public.leads SET phone = '052-765-4321' WHERE id = v_lead;
  SELECT phone, custom_fields INTO v_phone, v_fields
  FROM public.broadcast_list_members WHERE id = v_member;
  IF v_phone IS DISTINCT FROM '972527654321' OR v_fields IS DISTINCT FROM '{"x":"1"}'::jsonb THEN
    RAISE EXCEPTION '2: member not updated in place (phone %, fields %)', v_phone, v_fields;
  END IF;
  IF (SELECT count(*) FROM public.broadcast_list_members WHERE list_id = v_list) <> 1 THEN
    RAISE EXCEPTION '2: duplicate member rows';
  END IF;

  -- 3. Leaving the stage removes the member; returning re-adds it.
  UPDATE public.leads SET status = 'other' WHERE id = v_lead;
  IF EXISTS (SELECT 1 FROM public.broadcast_list_members WHERE list_id = v_list AND entity_id = v_lead)
    OR public.broadcast_entity_matches(v_tenant, 'lead', v_lead, v_cfg) THEN
    RAISE EXCEPTION '3: non-matching lead still a member';
  END IF;
  UPDATE public.leads SET status = 'qa-stage' WHERE id = v_lead;
  IF NOT EXISTS (SELECT 1 FROM public.broadcast_list_members WHERE list_id = v_list AND entity_id = v_lead) THEN
    RAISE EXCEPTION '3: lead was not re-added';
  END IF;

  -- 4. A phone that another member holds: the CRM write succeeds and the
  --    list records the error; the next good sync clears it.
  INSERT INTO public.broadcast_list_members (list_id, tenant_id, entity_type, name, phone, added_via)
  VALUES (v_list, v_tenant, 'manual', 'QA manual', '972509999999', 'manual');
  UPDATE public.leads SET phone = '0509999999' WHERE id = v_lead;
  IF (SELECT phone FROM public.leads WHERE id = v_lead) <> '0509999999' THEN
    RAISE EXCEPTION '4: lead update was rolled back';
  END IF;
  SELECT last_sync_error INTO v_err FROM public.broadcast_lists WHERE id = v_list;
  IF v_err IS NULL OR (SELECT last_sync_error_at FROM public.broadcast_lists WHERE id = v_list) IS NULL THEN
    RAISE EXCEPTION '4: sync error was not recorded';
  END IF;
  UPDATE public.leads SET phone = '0501112222' WHERE id = v_lead;
  IF (SELECT last_sync_error FROM public.broadcast_lists WHERE id = v_list) IS NOT NULL
    OR (SELECT phone FROM public.broadcast_list_members WHERE list_id = v_list AND entity_id = v_lead)
       IS DISTINCT FROM '972501112222' THEN
    RAISE EXCEPTION '4: successful sync did not clear the error';
  END IF;

  -- 5. Deleting the lead removes it from the list.
  DELETE FROM public.leads WHERE id = v_lead;
  IF EXISTS (SELECT 1 FROM public.broadcast_list_members WHERE list_id = v_list AND entity_id = v_lead) THEN
    RAISE EXCEPTION '5: deleted lead is still a member';
  END IF;
  IF (SELECT member_count FROM public.broadcast_lists WHERE id = v_list) <> 1 THEN
    RAISE EXCEPTION '5: member_count out of sync';
  END IF;

  -- 6. An inactive sync automation pauses the list; deleting the
  --    automation turns the list into a static list.
  INSERT INTO public.automations (name, trigger_type, action_type, configuration, active)
  VALUES ('QA ROLLBACK sync', 'lead_created', 'webhook', '{}', false)
  RETURNING id INTO v_auto;
  INSERT INTO public.broadcast_lists (tenant_id, name, kind, source, source_config)
  VALUES (v_tenant, 'QA ROLLBACK linked', 'synced', 'crm_filter',
          jsonb_build_object('source', 'leads', 'stageKeys', jsonb_build_array('qa-stage'),
                             'auto_sync', true, 'sync_automation_id', v_auto))
  RETURNING id INTO v_list2;
  INSERT INTO public.leads (tenant_id, company_name, status, phone)
  VALUES (v_tenant, 'QA ROLLBACK 2', 'qa-stage', '0503334444')
  RETURNING id INTO v_lead2;
  IF EXISTS (SELECT 1 FROM public.broadcast_list_members WHERE list_id = v_list2) THEN
    RAISE EXCEPTION '6: list synced while its automation is off';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.broadcast_list_members WHERE list_id = v_list AND entity_id = v_lead2) THEN
    RAISE EXCEPTION '6: unlinked synced list did not sync';
  END IF;
  DELETE FROM public.automations WHERE id = v_auto;
  SELECT source_config INTO v_cfg FROM public.broadcast_lists WHERE id = v_list2;
  IF (SELECT kind FROM public.broadcast_lists WHERE id = v_list2) <> 'static'
    OR v_cfg ? 'auto_sync' OR v_cfg ? 'sync_automation_id' THEN
    RAISE EXCEPTION '6: list was not unlinked (%)', v_cfg;
  END IF;

  RAISE NOTICE 'broadcast_list_sync: all checks passed';
END;
$test$;
ROLLBACK;
