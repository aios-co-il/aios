import type { DbClient } from "../_shared/supabase-clients.ts";

/** A landing page with its org, client and lead destinations. */
export interface LandingPage {
  id: string;
  tenantId: string;
  clientId: string;
  subdomain: string;
  slug: string;
  title: string;
  leadToCrm: boolean;
  leadToWebhook: boolean;
}

/**
 * Finds the page a lead came from. The subdomain is unique across orgs, so the site row is what
 * names the org; the page is then read inside that org only.
 */
export async function findLandingPage(
  db: DbClient,
  subdomain: string,
  slug: string,
): Promise<LandingPage | null> {
  const { data: site, error: siteError } = await db
    .from("landing_sites")
    .select("id, tenant_id, client_id")
    .eq("subdomain", subdomain)
    .maybeSingle();
  if (siteError) {
    throw siteError;
  }
  if (!site) {
    return null;
  }

  const { data: page, error: pageError } = await db
    .from("landing_pages")
    .select("id, title, lead_to_crm, lead_to_webhook")
    .eq("tenant_id", site.tenant_id)
    .eq("site_id", site.id)
    .eq("slug", slug)
    .maybeSingle();
  if (pageError) {
    throw pageError;
  }
  if (!page) {
    return null;
  }

  return {
    id: page.id,
    tenantId: site.tenant_id,
    clientId: site.client_id,
    subdomain,
    slug,
    title: page.title,
    leadToCrm: page.lead_to_crm,
    leadToWebhook: page.lead_to_webhook,
  };
}
