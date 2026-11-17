-- Landing pages (AIO-602): public pages each org hosts on <subdomain>.aios.co.il.
--
-- The separate aios-pages app (its own repo and Vercel project, on the
-- wildcard *.aios.co.il) maps the request host to tenants.subdomain and the
-- URL path to landing_pages.path, then renders the page's content blocks.
-- The empty path is the org's home page. A page goes live when its status is
-- 'published', with no deploy, so Carmen can create and update pages later.
--
-- Members of the org read and write its pages. Visitors never read the table:
-- the app calls get_published_landing_page, which returns one published page.

CREATE TABLE IF NOT EXISTS public.landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  path text NOT NULL DEFAULT '',
  title text NOT NULL,
  description text,
  -- Content blocks; the aios-pages app owns their shape.
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT landing_pages_tenant_path_key UNIQUE (tenant_id, path),
  CONSTRAINT landing_pages_path_chk
    CHECK (path ~ '^([a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*)?$' AND char_length(path) <= 200),
  CONSTRAINT landing_pages_title_chk
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT landing_pages_status_chk
    CHECK (status IN ('draft', 'published')),
  CONSTRAINT landing_pages_content_chk
    CHECK (jsonb_typeof(content) = 'object')
);

COMMENT ON TABLE public.landing_pages IS
  'Public landing pages served on <tenants.subdomain>.aios.co.il/<path> by the aios-pages app (AIO-602).';

-- Keeps updated_at current on every change.
DROP TRIGGER IF EXISTS trg_landing_pages_updated_at ON public.landing_pages;
CREATE TRIGGER trg_landing_pages_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

-- Members read the org's pages, drafts included; super admins read all.
DROP POLICY IF EXISTS landing_pages_select ON public.landing_pages;
CREATE POLICY landing_pages_select
  ON public.landing_pages
  FOR SELECT TO authenticated
  USING (
    public.user_is_tenant_member(tenant_id)
    OR public.is_super_admin((SELECT auth.uid()))
  );

-- Members add pages to their own org only.
DROP POLICY IF EXISTS landing_pages_insert ON public.landing_pages;
CREATE POLICY landing_pages_insert
  ON public.landing_pages
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_tenant_member(tenant_id));

-- Members edit the org's pages and cannot move one to another org.
DROP POLICY IF EXISTS landing_pages_update ON public.landing_pages;
CREATE POLICY landing_pages_update
  ON public.landing_pages
  FOR UPDATE TO authenticated
  USING (public.user_is_tenant_member(tenant_id))
  WITH CHECK (public.user_is_tenant_member(tenant_id));

-- Members remove the org's pages.
DROP POLICY IF EXISTS landing_pages_delete ON public.landing_pages;
CREATE POLICY landing_pages_delete
  ON public.landing_pages
  FOR DELETE TO authenticated
  USING (public.user_is_tenant_member(tenant_id));

REVOKE ALL ON TABLE public.landing_pages FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_pages TO authenticated;
GRANT ALL ON public.landing_pages TO service_role;

-- Returns the published page at <p_subdomain>.aios.co.il/<p_path> of an active or trial org, or no row.
CREATE OR REPLACE FUNCTION public.get_published_landing_page(p_subdomain text, p_path text DEFAULT '')
RETURNS TABLE (
  page_id uuid,
  tenant_id uuid,
  title text,
  description text,
  content jsonb,
  published_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT lp.id, lp.tenant_id, lp.title, lp.description, lp.content, lp.published_at, lp.updated_at
  FROM public.landing_pages lp
  JOIN public.tenants t ON t.id = lp.tenant_id
  WHERE t.subdomain = lower(btrim(p_subdomain))
    AND t.status IN ('active', 'trial')
    AND lp.path = lower(btrim(coalesce(p_path, ''), '/ '))
    AND lp.status = 'published';
$fn$;

REVOKE ALL ON FUNCTION public.get_published_landing_page(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_landing_page(text, text) TO anon, authenticated, service_role;
