import { supabase } from "@/integrations/supabase/client";
import {
  siteTrackingOf,
  type TrackingColumns,
} from "../../../../supabase/functions/_shared/workshop/landing/site-tracking.ts";
import {
  HOME_SLUG,
  type LandingSettings,
  NO_TRACKING,
  type TrackingDraft,
} from "./landingSettings";

/** The site columns the panel reads: its address, its tracking ids and its custom domain. */
const SITE_COLUMNS =
  "subdomain, gtm_id, ga4_id, meta_pixel_id, custom_domain, custom_domain_verified_at" as const;

/** The site columns that hold its custom domain. */
interface DomainColumns {
  custom_domain: string | null;
  custom_domain_verified_at: string | null;
}

/** Reads the project's page, or the client's site when the project has no page yet. */
export async function fetchLandingSettings(
  tenantId: string,
  itemId: string,
  clientId: string | null,
): Promise<LandingSettings> {
  const { data: page, error } = await supabase
    .from("landing_pages")
    .select(
      `slug, lead_to_crm, lead_to_webhook, landing_sites(${SITE_COLUMNS})` as const,
    )
    .eq("tenant_id", tenantId)
    .eq("work_item_id", itemId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (page) {
    return {
      subdomain: page.landing_sites.subdomain,
      slug: page.slug,
      leadToCrm: page.lead_to_crm,
      leadToWebhook: page.lead_to_webhook,
      siteExists: true,
      pageExists: true,
      tracking: trackingOf(page.landing_sites),
      ...domainOf(page.landing_sites),
    };
  }

  const empty: LandingSettings = {
    subdomain: "",
    slug: HOME_SLUG,
    leadToCrm: false,
    leadToWebhook: false,
    siteExists: false,
    pageExists: false,
    tracking: NO_TRACKING,
    customDomain: "",
    customDomainVerified: false,
  };
  if (!clientId) {
    return empty;
  }
  const { data: site, error: siteError } = await supabase
    .from("landing_sites")
    .select(SITE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (siteError) {
    throw siteError;
  }
  return site
    ? {
        ...empty,
        subdomain: site.subdomain,
        siteExists: true,
        tracking: trackingOf(site),
        ...domainOf(site),
      }
    : empty;
}

/** A site row's tracking ids, with an empty string for each id that is not set. */
function trackingOf(site: TrackingColumns): TrackingDraft {
  return { ...NO_TRACKING, ...siteTrackingOf(site) };
}

/** A site row's custom domain and whether Vercel verified it. */
function domainOf(
  site: DomainColumns,
): Pick<LandingSettings, "customDomain" | "customDomainVerified"> {
  return {
    customDomain: site.custom_domain ?? "",
    customDomainVerified:
      !!site.custom_domain && !!site.custom_domain_verified_at,
  };
}
