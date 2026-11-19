-- System graph keeps only the active version.
-- carmen_activate_system_graph archived the previous version on every sync and
-- nothing deleted it: Production held 504 versions (~8.6 GB) while only the
-- active one is read (system-graph-mcp and the graph RPCs). The graph is
-- rebuilt from git on every push to main, so old versions have no use.

-- Activates a fully uploaded staging version, then deletes every other version
-- except stagings under a day old, which may be a sync still uploading.
CREATE OR REPLACE FUNCTION public.carmen_activate_system_graph(
  p_version text,
  p_expected_nodes integer,
  p_expected_edges integer
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_nodes integer;
  v_edges integer;
  v_pruned integer;
begin
  select count(*) into v_nodes from public.aios_graph_nodes where version = p_version;
  select count(*) into v_edges from public.aios_graph_edges where version = p_version;

  if v_nodes <> p_expected_nodes or v_edges <> p_expected_edges then
    raise exception 'Graph count mismatch: nodes %/%, edges %/%', v_nodes, p_expected_nodes, v_edges, p_expected_edges;
  end if;

  update public.aios_graph_versions set status = 'archived' where status = 'active';
  update public.aios_graph_versions
    set status = 'active', node_count = v_nodes, edge_count = v_edges, activated_at = now()
    where version = p_version and status = 'staging';

  if not found then
    raise exception 'Graph version % is not in staging state', p_version;
  end if;

  -- Nodes and edges go with their version (ON DELETE CASCADE).
  delete from public.aios_graph_versions
    where version <> p_version
      and (status <> 'staging' or created_at < now() - interval '1 day');
  get diagnostics v_pruned = row_count;

  return jsonb_build_object('version', p_version, 'nodes', v_nodes, 'edges', v_edges, 'active', true, 'pruned_versions', v_pruned);
end;
$$;

REVOKE ALL ON FUNCTION public.carmen_activate_system_graph(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_activate_system_graph(text, integer, integer) TO service_role;

-- One-time cleanup with the same keep rule. Copying the few rows kept and
-- truncating frees the disk at once; a DELETE of ~14M rows would need a long
-- transaction and a VACUUM FULL. One DO block is one transaction whether or not
-- the runner wraps the file, and the exclusive lock makes a sync that is
-- uploading wait the few seconds this takes instead of losing rows.
DO $cleanup$
DECLARE
  v_versions integer;
BEGIN
  LOCK TABLE public.aios_graph_versions, public.aios_graph_nodes, public.aios_graph_edges
    IN ACCESS EXCLUSIVE MODE;

  CREATE TEMP TABLE graph_keep_versions AS
    SELECT version FROM public.aios_graph_versions
    WHERE status = 'active'
       OR (status = 'staging' AND created_at >= now() - interval '1 day');

  CREATE TEMP TABLE graph_keep_nodes AS
    SELECT version, id, label, file_type, source_file, source_location, community, community_name
    FROM public.aios_graph_nodes
    WHERE version IN (SELECT version FROM graph_keep_versions);

  CREATE TEMP TABLE graph_keep_edges AS
    SELECT * FROM public.aios_graph_edges
    WHERE version IN (SELECT version FROM graph_keep_versions);

  TRUNCATE public.aios_graph_edges, public.aios_graph_nodes;

  INSERT INTO public.aios_graph_nodes
    (version, id, label, file_type, source_file, source_location, community, community_name)
    SELECT version, id, label, file_type, source_file, source_location, community, community_name
    FROM graph_keep_nodes;

  INSERT INTO public.aios_graph_edges SELECT * FROM graph_keep_edges;

  DELETE FROM public.aios_graph_versions
    WHERE version NOT IN (SELECT version FROM graph_keep_versions);
  GET DIAGNOSTICS v_versions = ROW_COUNT;
  RAISE NOTICE 'system graph cleanup: removed % versions', v_versions;

  DROP TABLE graph_keep_versions, graph_keep_nodes, graph_keep_edges;
END
$cleanup$;
