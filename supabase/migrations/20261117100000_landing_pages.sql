-- Landing pages (AIO-602): tenant check for the separate aios-pages repo.
--
-- Each page lives in that repo as pages/<tenants.subdomain>/<slug>/, with the
-- org's tenant_id in its page.json. The repo is the source of truth for page
-- content and is served on <subdomain>.aios.co.il/<slug>. AIOS owns only the
-- tenant: before a page merges, the repo's checks call this function with the
-- anon key to confirm the folder's subdomain and the page's tenant_id are the
-- same active or trial org. The repo gets no other database access.

-- True when p_subdomain names the active or trial org p_tenant_id; reveals nothing else.
CREATE OR REPLACE FUNCTION public.landing_page_tenant_matches(p_subdomain text, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.subdomain = lower(btrim(p_subdomain))
      AND t.status IN ('active', 'trial')
  );
$fn$;

REVOKE ALL ON FUNCTION public.landing_page_tenant_matches(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.landing_page_tenant_matches(text, uuid) TO anon, authenticated, service_role;
