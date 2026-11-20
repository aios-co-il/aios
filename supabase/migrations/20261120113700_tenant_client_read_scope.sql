-- Which clients a tenant may read through Carmen. Carmen (run-ai-agent) reads
-- with the service role, so RLS does not scope her; she will call these
-- functions instead of collecting every tenant that shares any agency with the
-- caller's tenant, which also opened that tenant's clients in agencies it never
-- shared.
--
-- The rule is the one the app's RLS applies ("Owners view all clients in
-- tenant" and "Shared-agency cross-tenant client view", through
-- user_has_cross_tenant_agency_access): a tenant reads its own clients, and the
-- clients of every agency an agency_tenant_access row shares with it, a
-- re-share included. The share row is matched on agency only, as the app does;
-- agency_tenant_access_revoke_downstream deletes a re-share once its source no
-- longer holds the agency, so a revoked share leaves nothing behind.
--
-- The tenant is a parameter, not the caller's active tenant: Carmen works in
-- the tenant of her run. The per-user narrowing (team managers, campaigners,
-- SEO, sales people) stays in run-ai-agent for now. Service role only. No data
-- changes. Safe to re-run.

-- The agencies agency_tenant_access shares with p_tenant (any source, any access level).
CREATE OR REPLACE FUNCTION public.tenant_shared_agency_ids(p_tenant uuid)
RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT ata.agency_id), ARRAY[]::uuid[])
  FROM public.agency_tenant_access AS ata
  WHERE ata.accessing_tenant_id = p_tenant;
$$;

REVOKE ALL ON FUNCTION public.tenant_shared_agency_ids(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_shared_agency_ids(uuid)
  TO service_role;

COMMENT ON FUNCTION public.tenant_shared_agency_ids(uuid) IS
  'Agencies shared with the tenant in agency_tenant_access, re-shares included; the agency half of tenant_can_read_client.';

-- Whether p_tenant may read p_client: its own client, or a client of an agency shared with it.
CREATE OR REPLACE FUNCTION public.tenant_can_read_client(p_tenant uuid, p_client uuid)
RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients AS c
    WHERE c.id = p_client
      AND (
        c.tenant_id = p_tenant
        OR EXISTS (
          SELECT 1
          FROM public.agency_tenant_access AS ata
          WHERE ata.accessing_tenant_id = p_tenant
            AND ata.agency_id = c.agency_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.tenant_can_read_client(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_can_read_client(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.tenant_can_read_client(uuid, uuid) IS
  'True when the tenant owns the client or an agency_tenant_access row shares the client''s agency with it (the app''s clients read rule, by tenant).';
