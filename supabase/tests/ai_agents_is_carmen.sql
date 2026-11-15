-- ai_agents.is_carmen (20261114090000_ai_agents_is_carmen): a new org's first Carmen-named agent
-- is flagged on insert, an org has at most one flagged agent, and the flag survives a rename.
-- Synthetic tenants in a rolled-back transaction.
BEGIN;

DO $test$
DECLARE
  v_tenant uuid;
  v_other_tenant uuid;
  v_carmen uuid;
  v_sub uuid;
BEGIN
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK carmen flag', 'qa-carmen-flag-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_tenant;

  -- A new org's Carmen is flagged without the caller setting it.
  INSERT INTO public.ai_agents (tenant_id, name) VALUES (v_tenant, 'כרמן') RETURNING id INTO v_carmen;
  IF NOT (SELECT is_carmen FROM public.ai_agents WHERE id = v_carmen) THEN
    RAISE EXCEPTION 'a new org''s first Carmen-named agent must be flagged';
  END IF;

  -- A second Carmen-named agent in the same org is not.
  INSERT INTO public.ai_agents (tenant_id, name) VALUES (v_tenant, 'Carmen copy') RETURNING id INTO v_sub;
  IF (SELECT is_carmen FROM public.ai_agents WHERE id = v_sub) THEN
    RAISE EXCEPTION 'only the org''s first Carmen-named agent is flagged';
  END IF;

  -- Nor is a sub-agent with another name.
  INSERT INTO public.ai_agents (tenant_id, name) VALUES (v_tenant, 'Copywriter');
  IF (SELECT is_carmen FROM public.ai_agents WHERE tenant_id = v_tenant AND name = 'Copywriter') THEN
    RAISE EXCEPTION 'a sub-agent must not be flagged';
  END IF;

  -- A second flagged agent in the same org is refused.
  BEGIN
    INSERT INTO public.ai_agents (tenant_id, name, is_carmen) VALUES (v_tenant, 'Other', true);
    RAISE EXCEPTION 'a second Carmen in one org must be refused';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Renaming keeps the flag, so lookups by flag still find her.
  UPDATE public.ai_agents SET name = 'מיני מי' WHERE id = v_carmen;
  IF NOT (SELECT is_carmen FROM public.ai_agents WHERE id = v_carmen) THEN
    RAISE EXCEPTION 'the renamed Carmen must keep her flag';
  END IF;

  -- A cloned Carmen under a new name keeps the flag the clone sets explicitly.
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK carmen clone', 'qa-carmen-clone-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_other_tenant;
  INSERT INTO public.ai_agents (tenant_id, name, is_carmen) VALUES (v_other_tenant, 'מיני מי', true);
  IF (SELECT count(*) FROM public.ai_agents WHERE tenant_id = v_other_tenant AND is_carmen) <> 1 THEN
    RAISE EXCEPTION 'a renamed Carmen cloned with the flag must stay flagged';
  END IF;
END
$test$;
SELECT 'ai_agents.is_carmen: flagged on insert, one per org, survives a rename' AS result;

ROLLBACK;
