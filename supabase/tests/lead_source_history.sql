-- Lead arrival-source history (20261102112000_lead_source_history): synthetic
-- leads on an existing tenant inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_new uuid;
  v_default uuid;
  v_same uuid;
  v_changed uuid;
  v_none uuid;
  v_no_first uuid;
  v_first_at timestamptz := '2026-01-05 09:00:00+00';
  v_latest_at timestamptz := '2026-03-10 12:30:00+00';
  v_rows text;
BEGIN
  -- 1. Enum -> text: both columns take any text, and source keeps its default.
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.leads'::regclass
      AND attname IN ('source', 'first_source')
      AND atttypid <> 'text'::regtype
  ) THEN
    RAISE EXCEPTION 'leads.source and leads.first_source must be text';
  END IF;

  IF (
    SELECT pg_get_expr(d.adbin, d.adrelid)
    FROM pg_attrdef AS d
    JOIN pg_attribute AS a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE d.adrelid = 'public.leads'::regclass AND a.attname = 'source'
  ) IS DISTINCT FROM '''other''::text' THEN
    RAISE EXCEPTION 'leads.source must default to ''other''';
  END IF;

  -- The origin-tag trigger, dropped around the ALTER, is back on source.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    JOIN pg_attribute AS a ON a.attrelid = t.tgrelid AND a.attname = 'source'
    WHERE t.tgrelid = 'public.leads'::regclass
      AND t.tgname = 'trg_sync_lead_origin_tags'
      AND a.attnum = ANY (t.tgattr::int2[])
  ) THEN
    RAISE EXCEPTION 'trg_sync_lead_origin_tags must fire on updates of source';
  END IF;

  IF has_function_privilege('authenticated', 'public.leads_record_first_source_event()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.leads_record_first_source_event()', 'EXECUTE') THEN
    RAISE EXCEPTION 'leads_record_first_source_event must not be callable by API roles';
  END IF;

  IF has_table_privilege('anon', 'public.lead_source_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.lead_source_events', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.lead_source_events', 'SELECT') THEN
    RAISE EXCEPTION 'lead_source_events must be read-only for signed-in users and closed to anon';
  END IF;

  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Requires a tenant';
  END IF;

  -- 2. Trigger: a new lead keeps the source as sent and gets one dated row.
  INSERT INTO public.leads (company_name, tenant_id, source, campaign_name, created_at)
  VALUES ('QA ROLLBACK lead source', v_tenant, 'FB', 'QA campaign', v_latest_at)
  RETURNING id INTO v_new;

  IF (SELECT source || '/' || first_source FROM public.leads WHERE id = v_new) IS DISTINCT FROM 'FB/FB' THEN
    RAISE EXCEPTION 'trigger: a lead sent as FB must keep FB as source and first_source';
  END IF;

  SELECT string_agg(e.source || '|' || coalesce(e.campaign_name, '') || '|' || (e.tenant_id = v_tenant)::text || '|' || (e.received_at = v_latest_at)::text, ', ')
  INTO v_rows
  FROM public.lead_source_events AS e
  WHERE e.lead_id = v_new;
  IF v_rows IS DISTINCT FROM 'FB|QA campaign|true|true' THEN
    RAISE EXCEPTION 'trigger: expected one FB row dated at created_at, got %', v_rows;
  END IF;

  -- No source given (the default 'other'): no history row.
  INSERT INTO public.leads (company_name, tenant_id)
  VALUES ('QA ROLLBACK lead no source', v_tenant)
  RETURNING id INTO v_default;
  IF EXISTS (SELECT 1 FROM public.lead_source_events WHERE lead_id = v_default) THEN
    RAISE EXCEPTION 'trigger: a lead with no source must get no history row';
  END IF;

  -- 3. Backfill. Leads that predate the history: insert them, shape them, then
  --    drop the rows the trigger added, so only the backfill can restore them.
  INSERT INTO public.leads (company_name, tenant_id, source, created_at, first_created_at)
  VALUES ('QA ROLLBACK same source', v_tenant, 'paid_ads', v_latest_at, v_first_at)
  RETURNING id INTO v_same;

  INSERT INTO public.leads (company_name, tenant_id, source, created_at, first_created_at)
  VALUES ('QA ROLLBACK changed source', v_tenant, 'paid_ads', v_latest_at, v_first_at)
  RETURNING id INTO v_changed;
  UPDATE public.leads SET source = 'whatsapp' WHERE id = v_changed;

  INSERT INTO public.leads (company_name, tenant_id, source, created_at)
  VALUES ('QA ROLLBACK other source', v_tenant, 'other', v_latest_at)
  RETURNING id INTO v_none;

  INSERT INTO public.leads (company_name, tenant_id, source, created_at)
  VALUES ('QA ROLLBACK no first source', v_tenant, 'website', v_latest_at)
  RETURNING id INTO v_no_first;
  UPDATE public.leads SET first_source = NULL WHERE id = v_no_first;

  DELETE FROM public.lead_source_events
  WHERE lead_id IN (v_same, v_changed, v_none, v_no_first);

  -- Section 4 of the migration, verbatim (scratch verify diffs the two).
  insert into public.lead_source_events (lead_id, tenant_id, source, campaign_name, received_at)
  select l.id, l.tenant_id, btrim(l.first_source), l.campaign_name,
         coalesce(l.first_created_at, l.created_at, now())
  from public.leads l
  where public.lead_source_is_given(l.first_source)
    and not exists (select 1 from public.lead_source_events e where e.lead_id = l.id);

  insert into public.lead_source_events (lead_id, tenant_id, source, campaign_name, received_at)
  select l.id, l.tenant_id, btrim(l.source), l.campaign_name, coalesce(l.created_at, now())
  from public.leads l
  where public.lead_source_is_given(l.source)
    and l.source is distinct from l.first_source
    and not exists (
      select 1 from public.lead_source_events e
      where e.lead_id = l.id and e.source = btrim(l.source)
    );

  SELECT string_agg(e.source || '@' || to_char(e.received_at AT TIME ZONE 'UTC', 'MM-DD'), ', ' ORDER BY e.received_at)
  INTO v_rows FROM public.lead_source_events AS e WHERE e.lead_id = v_same;
  IF v_rows IS DISTINCT FROM 'paid_ads@01-05' THEN
    RAISE EXCEPTION 'backfill: unchanged source must give one row at first_created_at, got %', v_rows;
  END IF;

  SELECT string_agg(e.source || '@' || to_char(e.received_at AT TIME ZONE 'UTC', 'MM-DD'), ', ' ORDER BY e.received_at)
  INTO v_rows FROM public.lead_source_events AS e WHERE e.lead_id = v_changed;
  IF v_rows IS DISTINCT FROM 'paid_ads@01-05, whatsapp@03-10' THEN
    RAISE EXCEPTION 'backfill: a changed source must give the first and the current row, got %', v_rows;
  END IF;

  IF EXISTS (SELECT 1 FROM public.lead_source_events WHERE lead_id = v_none) THEN
    RAISE EXCEPTION 'backfill: a lead whose source is other must get no row';
  END IF;

  SELECT string_agg(e.source || '@' || to_char(e.received_at AT TIME ZONE 'UTC', 'MM-DD'), ', ' ORDER BY e.received_at)
  INTO v_rows FROM public.lead_source_events AS e WHERE e.lead_id = v_no_first;
  IF v_rows IS DISTINCT FROM 'website@03-10' THEN
    RAISE EXCEPTION 'backfill: a lead with no first_source must get its current source, got %', v_rows;
  END IF;

  IF (SELECT count(*) FROM public.lead_source_events WHERE lead_id = v_new) <> 1 THEN
    RAISE EXCEPTION 'backfill: a lead that already has history must not get another row';
  END IF;

  -- 4. Deleting a lead deletes its history.
  DELETE FROM public.leads WHERE id = v_changed;
  IF EXISTS (SELECT 1 FROM public.lead_source_events WHERE lead_id = v_changed) THEN
    RAISE EXCEPTION 'cascade: history must go with its lead';
  END IF;
END
$test$;
SELECT 'lead source history: text columns, trigger, backfill and cascade passed' AS result;
ROLLBACK;
