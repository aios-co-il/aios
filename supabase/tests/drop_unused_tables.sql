-- Drop unused tables (20261102113200_drop_unused_tables): checks that none of
-- the twelve dropped tables exists. Reads only, inside one transaction that is
-- rolled back.
BEGIN;
DO $test$
DECLARE
  v_present text[];
BEGIN
  SELECT array_agg(t.name ORDER BY t.name) INTO v_present
  FROM unnest(ARRAY[
    '_d_campag', '_d_prof', '_d_spag', '_d_tu', '_d_uma', '_d_ur',
    '_pol_log', '_pol_stage', '_sqlbuf',
    'carmen_batch_deliveries', 'wa_group_members', 'pbn_service_commands'
  ]) AS t(name)
  WHERE to_regclass(format('public.%I', t.name)) IS NOT NULL;
  IF v_present IS NOT NULL THEN
    RAISE EXCEPTION 'drop unused tables: still present: %', array_to_string(v_present, ', ');
  END IF;
END
$test$;
SELECT 'drop unused tables: none of the twelve exists, passed' AS result;
ROLLBACK;
