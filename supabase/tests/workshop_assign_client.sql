-- One assign path for every department (20261026103400_workshop_assign_any_department,
-- 20261026103410_workshop_assign_keep_stage): synthetic work items of two clients of one tenant,
-- inside one transaction that is rolled back. The department cases mirror departments.test.ts
-- (projectDepartment, isClientLocked), so the SQL and TypeScript rules cannot drift apart.
-- Assigning a project to the client it already has changes nothing; a move keeps the stage type
-- when the other client's pipeline has it; SEO and social projects stay with their client, and
-- a project with an SEO program only ever takes the program's client, even through a direct
-- update. Runs as the database owner.
BEGIN;

-- Where a project is: "<client> <pipeline's client>/<track>/<stage type>", A or B for the two
-- clients and - for none, e.g. "B B/campaigns/measurement".
CREATE FUNCTION pg_temp.qa_place(p_item uuid, p_a uuid, p_b uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT concat(
    CASE WHEN w.client_id = p_a THEN 'A' WHEN w.client_id = p_b THEN 'B' ELSE '-' END, ' ',
    CASE WHEN p.client_id = p_a THEN 'A' WHEN p.client_id = p_b THEN 'B' ELSE '-' END, '/',
    coalesce(p.track, '-'), '/', coalesce(s.stage_type::text, '-'))
  FROM public.marketing_work_items w
  LEFT JOIN public.marketing_pipelines p ON p.id = w.pipeline_id
  LEFT JOIN public.marketing_pipeline_stages s ON s.id = w.current_stage_id
  WHERE w.id = p_item
$$;

-- A project of p_client on that client's p_track pipeline at p_stage (nowhere when p_track is null).
CREATE FUNCTION pg_temp.qa_item(p_tenant uuid, p_client uuid, p_track text, p_stage text, p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_stage uuid;
  v_item uuid;
BEGIN
  IF p_track IS NOT NULL THEN
    v_stage := public.workshop_department_stage(p_tenant, p_client, p_track, p_stage);
  END IF;
  INSERT INTO public.marketing_work_items (tenant_id, client_id, pipeline_id, current_stage_id, title, payload)
  SELECT p_tenant, p_client, (SELECT s.pipeline_id FROM public.marketing_pipeline_stages s WHERE s.id = v_stage),
         v_stage, 'QA ROLLBACK assign', p_payload
  RETURNING id INTO v_item;
  RETURN v_item;
END;
$$;

-- True when assigning p_item to p_client is refused as a locked project.
CREATE FUNCTION pg_temp.qa_refused(p_item uuid, p_client uuid) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.workshop_assign_client(p_item, p_client);
  RETURN false;
EXCEPTION WHEN invalid_parameter_value THEN
  RETURN true;
END;
$$;

DO $test$
DECLARE
  v_tenant uuid;
  v_a uuid;
  v_b uuid;
  v_item uuid;
  v_place text;
  v_failed boolean;
  c record;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.clients
   WHERE tenant_id IS NOT NULL GROUP BY tenant_id HAVING count(*) >= 2 ORDER BY tenant_id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant with two clients'; END IF;
  SELECT id INTO v_a FROM public.clients WHERE tenant_id = v_tenant ORDER BY id LIMIT 1;
  SELECT id INTO v_b FROM public.clients WHERE tenant_id = v_tenant ORDER BY id OFFSET 1 LIMIT 1;

  -- Assigning a project to the client it has changes nothing: a brief at the strategy stage stays
  -- there, and so does a campaign being measured or an unassigned project.
  FOR c IN SELECT * FROM (VALUES
    ('A', 'campaigns', 'strategy', '{"brief_text":"x"}', 'A A/campaigns/strategy'),
    ('A', 'campaigns', 'measurement', '{"department":"campaigns"}', 'A A/campaigns/measurement'),
    ('A', 'seo_geo', 'strategy', '{}', 'A A/seo_geo/strategy'),
    ('-', 'campaigns', 'strategy', '{}', '- -/campaigns/strategy')
  ) AS t(client, track, stage, payload, expected) LOOP
    v_item := pg_temp.qa_item(v_tenant, CASE c.client WHEN 'A' THEN v_a END, c.track, c.stage, c.payload::jsonb);
    PERFORM public.workshop_assign_client(v_item, CASE c.client WHEN 'A' THEN v_a END);
    v_place := pg_temp.qa_place(v_item, v_a, v_b);
    IF v_place <> c.expected THEN
      RAISE EXCEPTION 'same client: % should stay at %, not %', c.payload, c.expected, v_place;
    END IF;
  END LOOP;

  -- A project without a stage still gets one (the "no client" creative stage when it has no client).
  v_item := pg_temp.qa_item(v_tenant, NULL, NULL, NULL, '{"workshop":{}}');
  PERFORM public.workshop_assign_client(v_item, NULL);
  v_place := pg_temp.qa_place(v_item, v_a, v_b);
  IF v_place <> '- -/campaigns/creative' THEN
    RAISE EXCEPTION 'no stage: an unassigned project goes to the "no client" creative stage, not %', v_place;
  END IF;

  -- Moving to another client keeps the stage type when that client's pipeline of the department's
  -- track has it; otherwise the project starts at its department's stage. A web project keeps its
  -- track.
  FOR c IN SELECT * FROM (VALUES
    ('campaigns', 'measurement', '{"brief_text":"x"}', 'B B/campaigns/measurement'),
    ('campaigns', 'copy', '{"workshop":{}}', 'B B/campaigns/copy'),
    ('campaigns', 'target_paid', '{"department":"campaigns"}', 'B B/campaigns/target_paid'),
    ('seo_geo', 'target_seo', '{"workshop":{}}', 'B B/campaigns/creative'),
    ('seo_geo', 'target_seo', '{"department":"copy"}', 'B B/campaigns/copy'),
    ('social_organic', 'strategy', '{"department":"web"}', 'B B/social_organic/strategy')
  ) AS t(track, stage, payload, expected) LOOP
    v_item := pg_temp.qa_item(v_tenant, v_a, c.track, c.stage, c.payload::jsonb);
    PERFORM public.workshop_assign_client(v_item, v_b);
    v_place := pg_temp.qa_place(v_item, v_a, v_b);
    IF v_place <> c.expected THEN
      RAISE EXCEPTION 'move: % at %/% should land at %, not %', c.payload, c.track, c.stage, c.expected, v_place;
    END IF;
  END LOOP;

  -- The department of a project with no stage yet decides where it starts (departments.test.ts):
  -- the tag, a workshop board, then the payload. Creative work with a brief or copy is Creative.
  FOR c IN SELECT * FROM (VALUES
    ('{"department":"campaigns"}', 'A A/campaigns/target_paid'),
    ('{"department":"social"}', 'A A/social_organic/target_organic'),
    ('{"department":"web"}', 'A A/campaigns/creative'),
    ('{"department":"copy","variations":[]}', 'A A/campaigns/copy'),
    ('{"department":"other","workshop":{}}', 'A A/campaigns/creative'),
    ('{"seo_plan":{},"brief_text":"x"}', 'A A/seo_geo/target_seo'),
    ('{"brief_text":"x"}', 'A A/campaigns/copy'),
    ('{"copy_concepts":[]}', 'A A/campaigns/copy'),
    ('{"brief_text":"x","variations":[]}', 'A A/campaigns/creative'),
    ('{"copy_text":"x","project_type":"video"}', 'A A/campaigns/creative'),
    ('{"copy_chat":[],"image_url":"x"}', 'A A/campaigns/creative'),
    ('{}', 'A A/campaigns/creative')
  ) AS t(payload, expected) LOOP
    v_item := pg_temp.qa_item(v_tenant, NULL, NULL, NULL, c.payload::jsonb);
    PERFORM public.workshop_assign_client(v_item, v_a);
    v_place := pg_temp.qa_place(v_item, v_a, v_b);
    IF v_place <> c.expected THEN
      RAISE EXCEPTION 'department: % should start at %, not %', c.payload, c.expected, v_place;
    END IF;
  END LOOP;

  -- SEO and social projects with a client stay with it; without one they can be assigned.
  FOR c IN SELECT * FROM (VALUES
    ('seo_geo', 'strategy', '{}'),
    ('social_organic', 'target_organic', '{}'),
    ('campaigns', 'creative', '{"department":"seo"}')
  ) AS t(track, stage, payload) LOOP
    v_item := pg_temp.qa_item(v_tenant, v_a, c.track, c.stage, c.payload::jsonb);
    IF NOT pg_temp.qa_refused(v_item, v_b) OR NOT pg_temp.qa_refused(v_item, NULL) THEN
      RAISE EXCEPTION 'lock: % on %/% should not move or be released', c.payload, c.track, c.stage;
    END IF;
  END LOOP;
  v_item := pg_temp.qa_item(v_tenant, NULL, 'social_organic', 'strategy', '{}');
  PERFORM public.workshop_assign_client(v_item, v_a);
  v_place := pg_temp.qa_place(v_item, v_a, v_b);
  IF v_place <> 'A A/social_organic/strategy' THEN
    RAISE EXCEPTION 'lock: an unassigned social project can be assigned (%)', v_place;
  END IF;
  v_item := pg_temp.qa_item(v_tenant, v_a, 'campaigns', 'creative', '{"department":"copy"}');
  PERFORM public.workshop_assign_client(v_item, NULL);
  v_place := pg_temp.qa_place(v_item, v_a, v_b);
  IF v_place <> '- -/campaigns/creative' THEN
    RAISE EXCEPTION 'release: a copy project goes to the "no client" pipeline, keeping its stage (%)', v_place;
  END IF;

  -- A project with an SEO program takes only the program's client, whatever its department, and
  -- also when it lost its client: through the RPC and through a direct update.
  v_item := pg_temp.qa_item(v_tenant, v_a, 'campaigns', 'creative', '{"department":"creative"}');
  INSERT INTO public.seo_geo_programs (tenant_id, client_id, work_item_id) VALUES (v_tenant, v_a, v_item);
  IF NOT pg_temp.qa_refused(v_item, v_b) OR NOT pg_temp.qa_refused(v_item, NULL) THEN
    RAISE EXCEPTION 'program: a project with a program should not move or be released';
  END IF;
  v_item := pg_temp.qa_item(v_tenant, NULL, 'campaigns', 'creative', '{"department":"creative"}');
  INSERT INTO public.seo_geo_programs (tenant_id, client_id, work_item_id) VALUES (v_tenant, v_a, v_item);
  IF NOT pg_temp.qa_refused(v_item, v_b) THEN
    RAISE EXCEPTION 'program: a project without a client takes only its program''s client';
  END IF;
  BEGIN
    UPDATE public.marketing_work_items SET client_id = v_b WHERE id = v_item;
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'program trigger: a direct update to another client than the program''s should raise';
  END IF;
  PERFORM public.workshop_assign_client(v_item, v_a);
  v_place := pg_temp.qa_place(v_item, v_a, v_b);
  IF v_place <> 'A A/campaigns/creative' THEN
    RAISE EXCEPTION 'program: the project can take its program''s client (%)', v_place;
  END IF;
  BEGIN
    UPDATE public.marketing_work_items SET client_id = NULL WHERE id = v_item;
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'program trigger: a direct update that releases the project should raise';
  END IF;

  RAISE NOTICE 'workshop_assign_client: all checks passed';
END;
$test$;
ROLLBACK;
