-- ai_agents.is_carmen (20261114090000_ai_agents_is_carmen): an org has at most one flagged Carmen
-- agent, and the flag stays when the agent is renamed. Synthetic tenant in a rolled-back transaction.
BEGIN;

DO $test$
DECLARE
  v_tenant uuid;
  v_carmen uuid;
BEGIN
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK carmen flag', 'qa-carmen-flag-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_tenant;

  INSERT INTO public.ai_agents (tenant_id, name, is_carmen)
  VALUES (v_tenant, 'כרמן', true)
  RETURNING id INTO v_carmen;

  -- A second flagged agent in the same org is refused.
  BEGIN
    INSERT INTO public.ai_agents (tenant_id, name, is_carmen) VALUES (v_tenant, 'Other', true);
    RAISE EXCEPTION 'a second Carmen in one org must be refused';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Renaming keeps the flag, so lookups by flag still find her.
  UPDATE public.ai_agents SET name = 'מיני מי' WHERE id = v_carmen;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_agents WHERE tenant_id = v_tenant AND is_carmen AND name = 'מיני מי'
  ) THEN
    RAISE EXCEPTION 'the renamed Carmen must keep her flag';
  END IF;

  -- Other agents default to not Carmen.
  INSERT INTO public.ai_agents (tenant_id, name) VALUES (v_tenant, 'Copy');
  IF (SELECT is_carmen FROM public.ai_agents WHERE tenant_id = v_tenant AND name = 'Copy') THEN
    RAISE EXCEPTION 'a new agent must not be flagged';
  END IF;
END
$test$;
SELECT 'ai_agents.is_carmen: one per org, survives a rename, off by default' AS result;

ROLLBACK;
