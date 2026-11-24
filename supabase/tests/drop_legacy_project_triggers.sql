-- The triggers that posted to a project outside AIOS are gone
-- (20261124090000_drop_legacy_project_triggers, AIO-66), and no public function
-- still names that project. Read-only; rolls back.
BEGIN;
CREATE TEMP TABLE legacy_trigger_results (test text, passed boolean) ON COMMIT DROP;

INSERT INTO legacy_trigger_results
  SELECT 'trigger ' || name || ' dropped', NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = name AND NOT tgisinternal
  )
  FROM unnest(ARRAY[
    'on_ad_account_blocked',
    'auto_sync_new_lead_trigger',
    'carmen_session_close_learn'
  ]) AS name;

INSERT INTO legacy_trigger_results
  SELECT 'function ' || name || ' dropped', to_regprocedure('public.' || name || '()') IS NULL
  FROM unnest(ARRAY[
    'trigger_ad_account_blocked',
    'trigger_auto_sync_new_lead',
    'trigger_carmen_learn_from_session'
  ]) AS name;

INSERT INTO legacy_trigger_results
  SELECT 'no public function names the outside project', NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc LIKE '%jnzguisakdtcollxmgzd%'
  );

-- A NULL result counts as a failure.
DO $$ BEGIN IF EXISTS (SELECT 1 FROM legacy_trigger_results WHERE passed IS NOT TRUE) THEN
  RAISE EXCEPTION 'legacy trigger regression failed: %',
    (SELECT jsonb_agg(to_jsonb(r)) FROM legacy_trigger_results r WHERE r.passed IS NOT TRUE);
END IF; END $$;
SELECT * FROM legacy_trigger_results;
ROLLBACK;
