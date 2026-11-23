import type { Db } from "../db.ts";
import type { LandingSite } from "./page-files.ts";
import { LANDING_ROOT_DOMAIN } from "./site-domain.ts";
import { siteTrackingOf } from "./site-tracking.ts";

/** Where a landing page project lives on the web, as set in the project's settings panel. */
export interface LandingTarget {
  site: LandingSite;
  slug: string;
  title: string;
  /** True when the page's leads have somewhere to go: the org's CRM, a webhook or both. */
  hasLeadDestination: boolean;
}

export const NO_ADDRESS =
  "לעמוד עוד אין כתובת. בקשי מהמשתמש להגדיר כתובת ויעד ללידים בהגדרות שבראש הפרויקט, ואז בני שוב.";

/**
 * Reads the project's page, its site with its tracking ids and domain, and the client's name; an error when
 * no address is set.
 */
export async function loadLandingTarget(
  supabase: Db,
  tenantId: string,
  itemId: string,
): Promise<LandingTarget | { error: string }> {
  const page = await supabase
    .from("landing_pages")
    .select("slug, title, site_id, lead_to_crm, lead_to_webhook")
    .eq("tenant_id", tenantId)
    .eq("work_item_id", itemId)
    .maybeSingle();
  if (page.error) {
    return { error: `הגדרות העמוד לא נקראו: ${page.error.message}` };
  }
  if (!page.data) {
    return { error: NO_ADDRESS };
  }
  const site = await supabase
    .from("landing_sites")
    .select(
      "subdomain, client_id, gtm_id, ga4_id, meta_pixel_id, custom_domain, custom_domain_verified_at",
    )
    .eq("tenant_id", tenantId)
    .eq("id", page.data.site_id)
    .maybeSingle();
  if (site.error || !site.data) {
    return {
      error: `האתר של העמוד לא נקרא: ${site.error?.message ?? "לא נמצא"}`,
    };
  }
  const client = await supabase
    .from("clients")
    .select("name")
    .eq("tenant_id", tenantId)
    .eq("id", site.data.client_id)
    .maybeSingle();
  if (client.error || !client.data) {
    return {
      error: `הלקוח של העמוד לא נקרא: ${client.error?.message ?? "לא נמצא"}`,
    };
  }
  return {
    site: {
      subdomain: String(site.data.subdomain),
      tenantId,
      clientId: String(site.data.client_id),
      name: String(client.data.name),
      tracking: siteTrackingOf(site.data),
      customDomain: site.data.custom_domain,
      customDomainVerified:
        !!site.data.custom_domain && !!site.data.custom_domain_verified_at,
    },
    slug: String(page.data.slug),
    title: String(page.data.title),
    hasLeadDestination:
      page.data.lead_to_crm === true || page.data.lead_to_webhook === true,
  };
}

/**
 * The page's public address once it is live: on the site's custom domain once Vercel verified it,
 * and on its aios.co.il subdomain otherwise.
 */
export function liveUrl(target: LandingTarget): string {
  const path = target.slug === "home" ? "" : target.slug;
  const host =
    target.site.customDomain && target.site.customDomainVerified
      ? target.site.customDomain
      : `${target.site.subdomain}.${LANDING_ROOT_DOMAIN}`;
  return `https://${host}/${path}`;
}

/** The page inside a Vercel preview, which names the site in the query string. */
export function previewPageUrl(base: string, target: LandingTarget): string {
  const path = target.slug === "home" ? "" : target.slug;
  return `${base.replace(/\/$/, "")}/${path}?site=${target.site.subdomain}`;
}
