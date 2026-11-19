-- System graph keeps only the active version: 20261119200000_system_graph_single_version.
-- Synthetic versions inside one transaction that is rolled back; the calls are
-- the ones scripts/sync-graphify-to-supabase.mjs sends.
BEGIN;
DO $test$
DECLARE
  v_result jsonb;
BEGIN
  DELETE FROM public.aios_graph_versions;

  INSERT INTO public.aios_graph_versions (version, status, created_at) VALUES
    ('qa-old-active', 'active', now() - interval '3 days'),
    ('qa-archived', 'archived', now() - interval '5 days'),
    ('qa-failed', 'failed', now() - interval '5 days'),
    ('qa-stuck-staging', 'staging', now() - interval '2 days'),
    ('qa-uploading', 'staging', now() - interval '5 minutes'),
    ('qa-new', 'staging', now());
  INSERT INTO public.aios_graph_nodes (version, id, label)
    SELECT v, n, n FROM unnest(ARRAY['qa-old-active','qa-archived','qa-stuck-staging','qa-uploading','qa-new']) v,
                        unnest(ARRAY['a','b']) n;
  INSERT INTO public.aios_graph_edges (version, edge_key, source_id, target_id, relation)
    SELECT v, 'a-b', 'a', 'b', 'calls'
    FROM unnest(ARRAY['qa-old-active','qa-archived','qa-stuck-staging','qa-uploading','qa-new']) v;

  -- A count mismatch activates nothing and deletes nothing -------------------
  BEGIN
    PERFORM public.carmen_activate_system_graph('qa-new', 3, 1);
    RAISE EXCEPTION 'mismatch: activation with wrong counts must fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Graph count mismatch%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.aios_graph_versions) <> 6 THEN
    RAISE EXCEPTION 'mismatch: a failed activation must not prune';
  END IF;

  -- Activation keeps the new version and the staging still uploading ---------
  v_result := public.carmen_activate_system_graph('qa-new', 2, 1);
  IF (v_result->>'pruned_versions')::int <> 4 THEN
    RAISE EXCEPTION 'prune: expected 4 versions removed, got %', v_result->>'pruned_versions';
  END IF;
  IF (SELECT array_agg(version || ':' || status ORDER BY version) FROM public.aios_graph_versions)
     <> ARRAY['qa-new:active', 'qa-uploading:staging'] THEN
    RAISE EXCEPTION 'prune: only the active version and a fresh staging may remain, got %',
      (SELECT array_agg(version || ':' || status ORDER BY version) FROM public.aios_graph_versions);
  END IF;
  IF EXISTS (SELECT 1 FROM public.aios_graph_nodes WHERE version NOT IN ('qa-new', 'qa-uploading'))
     OR EXISTS (SELECT 1 FROM public.aios_graph_edges WHERE version NOT IN ('qa-new', 'qa-uploading')) THEN
    RAISE EXCEPTION 'prune: nodes and edges of removed versions must go with them';
  END IF;

  -- Only service_role may activate -------------------------------------------
  IF has_function_privilege('authenticated', 'public.carmen_activate_system_graph(text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.carmen_activate_system_graph(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: anon and authenticated must not activate the graph';
  END IF;
END
$test$;
ROLLBACK;
