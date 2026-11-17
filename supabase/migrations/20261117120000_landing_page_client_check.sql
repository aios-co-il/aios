-- Landing pages belong to a client (AIO-602). Each site in the landing-pages repo,
-- landing-pages/<subdomain>/, names its org and client in site.json. Before a page is
-- published, the repo's checks call this function with the anon key to confirm the
-- client belongs to that org, the org is active or trial, and the client is not ended
-- or inactive. It replaces landing_page_tenant_matches, which checked the org only.

DROP FUNCTION IF EXISTS public.landing_page_tenant_matches(text, uuid);

-- True when p_client_id is a live client of the active or trial org p_tenant_id; reveals nothing else.
CREATE OR REPLACE FUNCTION public.landing_page_client_matches(p_tenant_id uuid, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    JOIN public.tenants t ON t.id = c.tenant_id
    WHERE c.id = p_client_id
      AND c.tenant_id = p_tenant_id
      AND c.status NOT IN ('ended', 'inactive')
      AND t.status IN ('active', 'trial')
  );
$fn$;

REVOKE ALL ON FUNCTION public.landing_page_client_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.landing_page_client_matches(uuid, uuid) TO anon, authenticated, service_role;
