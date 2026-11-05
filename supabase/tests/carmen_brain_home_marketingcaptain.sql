-- Carmen brain home (20261105120000_carmen_brain_home_marketingcaptain,
-- AIO-354): runs the migration file itself (\ir) with MarketingCaptain and
-- DMM seeded, without them, and with only MarketingCaptain. Every case is a
-- transaction that is rolled back; the QA tenants have fixed ids so later
-- blocks can name them.

-- Home tenants and shares as text, to compare before and after a run.
CREATE OR REPLACE FUNCTION pg_temp.qa_brain_rows()
RETURNS TABLE (r text) LANGUAGE sql AS $$
  SELECT 'home ' || tenant_id FROM public.carmen_brain_home_tenants
  UNION ALL
  SELECT format('share %s>%s %s by %s', source_tenant_id, target_tenant_id,
                builtin_slug, coalesce(granted_by::text, '-'))
  FROM public.carmen_brain_key_shares
$$;

-- The migration's two organizations are not in this database; the cases
-- below create them.
DO $test$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id IN ('2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019', '6ad8f321-25db-4a04-8e44-e57a7c8961b2')
  ) THEN
    RAISE EXCEPTION 'Requires a database without MarketingCaptain and DMM';
  END IF;
END
$test$;

-- 1. Both organizations, in the state 20261103090000 leaves (DMM is home),
--    next to an unrelated home tenant (X) and its share with Y. Run twice.
BEGIN;
INSERT INTO public.tenants (id, name, slug) VALUES
  ('2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019', 'QA ROLLBACK MarketingCaptain', 'qa-rollback-' || gen_random_uuid()),
  ('6ad8f321-25db-4a04-8e44-e57a7c8961b2', 'QA ROLLBACK DMM', 'qa-rollback-' || gen_random_uuid()),
  ('0a5e0000-0000-4000-8000-0000000000a1', 'QA ROLLBACK X', 'qa-rollback-' || gen_random_uuid()),
  ('0a5e0000-0000-4000-8000-0000000000a2', 'QA ROLLBACK Y', 'qa-rollback-' || gen_random_uuid());
INSERT INTO public.carmen_brain_home_tenants (tenant_id) VALUES
  ('6ad8f321-25db-4a04-8e44-e57a7c8961b2'),
  ('0a5e0000-0000-4000-8000-0000000000a1');
INSERT INTO public.carmen_brain_key_shares (source_tenant_id, target_tenant_id, builtin_slug)
VALUES ('0a5e0000-0000-4000-8000-0000000000a1', '0a5e0000-0000-4000-8000-0000000000a2', 'cursor');

\ir ../migrations/20261105120000_carmen_brain_home_marketingcaptain.sql
CREATE TEMP TABLE qa_after_first ON COMMIT DROP AS SELECT r FROM pg_temp.qa_brain_rows();
\ir ../migrations/20261105120000_carmen_brain_home_marketingcaptain.sql

DO $test$
DECLARE
  v_mc constant uuid := '2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019';
  v_dmm constant uuid := '6ad8f321-25db-4a04-8e44-e57a7c8961b2';
  v_x constant uuid := '0a5e0000-0000-4000-8000-0000000000a1';
  v_y constant uuid := '0a5e0000-0000-4000-8000-0000000000a2';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.carmen_brain_home_tenants WHERE tenant_id = v_mc) THEN
    RAISE EXCEPTION 'both: MarketingCaptain must be a home tenant';
  END IF;
  IF EXISTS (SELECT 1 FROM public.carmen_brain_home_tenants WHERE tenant_id = v_dmm) THEN
    RAISE EXCEPTION 'both: DMM must no longer be a home tenant';
  END IF;
  IF (
    SELECT array_agg(builtin_slug ORDER BY builtin_slug)
    FROM public.carmen_brain_key_shares
    WHERE source_tenant_id = v_mc AND target_tenant_id = v_dmm AND granted_by IS NULL
  ) IS DISTINCT FROM ARRAY['chatgpt', 'claude', 'codex', 'cursor', 'grok'] THEN
    RAISE EXCEPTION 'both: MarketingCaptain must share every built-in brain with DMM';
  END IF;
  IF (SELECT count(*) FROM public.carmen_brain_key_shares WHERE target_tenant_id = v_dmm) <> 5
     OR EXISTS (SELECT 1 FROM public.carmen_brain_key_shares WHERE source_tenant_id = v_mc AND target_tenant_id <> v_dmm) THEN
    RAISE EXCEPTION 'both: the only new shares are MarketingCaptain to DMM';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.carmen_brain_home_tenants WHERE tenant_id = v_x)
     OR NOT EXISTS (
       SELECT 1 FROM public.carmen_brain_key_shares
       WHERE source_tenant_id = v_x AND target_tenant_id = v_y AND builtin_slug = 'cursor'
     ) THEN
    RAISE EXCEPTION 'both: other home tenants and shares must stay';
  END IF;
  IF EXISTS (SELECT r FROM qa_after_first EXCEPT SELECT r FROM pg_temp.qa_brain_rows())
     OR EXISTS (SELECT r FROM pg_temp.qa_brain_rows() EXCEPT SELECT r FROM qa_after_first) THEN
    RAISE EXCEPTION 'both: a second run must change nothing';
  END IF;
END
$test$;
ROLLBACK;

-- 2. Neither organization (Staging): nothing changes.
BEGIN;
INSERT INTO public.tenants (id, name, slug) VALUES
  ('0a5e0000-0000-4000-8000-0000000000a1', 'QA ROLLBACK X', 'qa-rollback-' || gen_random_uuid()),
  ('0a5e0000-0000-4000-8000-0000000000a2', 'QA ROLLBACK Y', 'qa-rollback-' || gen_random_uuid());
INSERT INTO public.carmen_brain_home_tenants (tenant_id) VALUES ('0a5e0000-0000-4000-8000-0000000000a1');
INSERT INTO public.carmen_brain_key_shares (source_tenant_id, target_tenant_id, builtin_slug)
VALUES ('0a5e0000-0000-4000-8000-0000000000a1', '0a5e0000-0000-4000-8000-0000000000a2', 'claude');
CREATE TEMP TABLE qa_before ON COMMIT DROP AS SELECT r FROM pg_temp.qa_brain_rows();

\ir ../migrations/20261105120000_carmen_brain_home_marketingcaptain.sql

DO $test$
BEGIN
  IF EXISTS (SELECT r FROM qa_before EXCEPT SELECT r FROM pg_temp.qa_brain_rows())
     OR EXISTS (SELECT r FROM pg_temp.qa_brain_rows() EXCEPT SELECT r FROM qa_before) THEN
    RAISE EXCEPTION 'neither: the migration must change nothing';
  END IF;
END
$test$;
ROLLBACK;

-- 3. Only MarketingCaptain: nothing changes, so it does not become home
--    without DMM getting its share.
BEGIN;
INSERT INTO public.tenants (id, name, slug)
VALUES ('2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019', 'QA ROLLBACK MarketingCaptain', 'qa-rollback-' || gen_random_uuid());
CREATE TEMP TABLE qa_before ON COMMIT DROP AS SELECT r FROM pg_temp.qa_brain_rows();

\ir ../migrations/20261105120000_carmen_brain_home_marketingcaptain.sql

DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.carmen_brain_home_tenants WHERE tenant_id = '2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019')
     OR EXISTS (SELECT r FROM qa_before EXCEPT SELECT r FROM pg_temp.qa_brain_rows())
     OR EXISTS (SELECT r FROM pg_temp.qa_brain_rows() EXCEPT SELECT r FROM qa_before) THEN
    RAISE EXCEPTION 'only MarketingCaptain: the migration must change nothing';
  END IF;
END
$test$;
ROLLBACK;

-- 4. Closing guard: when DMM already gets Grok from another organization, the
--    migration keeps that share and then fails instead of finishing half done.
BEGIN;
INSERT INTO public.tenants (id, name, slug) VALUES
  ('2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019', 'QA ROLLBACK MarketingCaptain', 'qa-rollback-' || gen_random_uuid()),
  ('6ad8f321-25db-4a04-8e44-e57a7c8961b2', 'QA ROLLBACK DMM', 'qa-rollback-' || gen_random_uuid()),
  ('0a5e0000-0000-4000-8000-0000000000a1', 'QA ROLLBACK X', 'qa-rollback-' || gen_random_uuid());
INSERT INTO public.carmen_brain_key_shares (source_tenant_id, target_tenant_id, builtin_slug)
VALUES ('0a5e0000-0000-4000-8000-0000000000a1', '6ad8f321-25db-4a04-8e44-e57a7c8961b2', 'grok');
SAVEPOINT qa_guard;
\echo 'Case 4 expects the migration to fail with its closing guard:'
\set ON_ERROR_STOP 0
\ir ../migrations/20261105120000_carmen_brain_home_marketingcaptain.sql
\set ON_ERROR_STOP 1
ROLLBACK TO SAVEPOINT qa_guard;
SELECT set_config('qa.last_error', :'LAST_ERROR_MESSAGE', true) AS qa_last_error \gset
DO $test$
BEGIN
  IF current_setting('qa.last_error') NOT LIKE '%must be home and share every built-in brain with DMM%' THEN
    RAISE EXCEPTION 'guard: expected the closing guard to fail, got: %', current_setting('qa.last_error');
  END IF;
END
$test$;
ROLLBACK;

-- 5. Browsers never read or write home tenants or shares: a receiving
--    organization cannot list where its key comes from or share it on.
DO $test$
DECLARE
  v_role text;
  v_table text;
  v_priv text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_table IN ARRAY ARRAY['public.carmen_brain_home_tenants', 'public.carmen_brain_key_shares'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        IF has_table_privilege(v_role, v_table, v_priv) THEN
          RAISE EXCEPTION 'grants: % must not % %', v_role, v_priv, v_table;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$test$;
