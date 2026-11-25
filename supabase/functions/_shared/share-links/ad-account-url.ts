/**
 * The "open ad account" link of a report table. The signed-in report pages
 * build it in the browser; public-table and public-dashboard build it on the
 * server, so a share link returns only the finished link, never the stored
 * account ids or settings.
 */

/** The direct account links saved on a client card, which win over built ones. */
export type ClientAdLinks = {
  google_ads_url?: string | null;
  meta_ads_url?: string | null;
};

/** The ads platform an account link opens. */
export type AdAccountPlatform = "meta" | "google";

/** The part of a report table the link is built from. */
export type AdAccountTable = {
  integration_type?: string | null;
  integration_settings?: {
    ad_account_id?: string | null;
    customer_id?: string | null;
  } | null;
};

/** The hosts a saved link may point to, per platform, so a link opens that platform only. */
const AD_LINK_HOSTS: Record<keyof ClientAdLinks, Array<string>> = {
  google_ads_url: ["ads.google.com"],
  meta_ads_url: [
    "business.facebook.com",
    "adsmanager.facebook.com",
    "www.facebook.com",
    "facebook.com",
  ],
};

const PLATFORM_BY_TYPE: Record<string, AdAccountPlatform> = {
  facebook_insights: "meta",
  facebook_ecommerce: "meta",
  google_ads: "google",
};

/** Whether a saved link is an https link to that platform's own site. */
export function isAdAccountLink(
  field: keyof ClientAdLinks,
  value: string | null | undefined,
): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      AD_LINK_HOSTS[field].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * A client row's saved links, each kept only when it is an https link to its
 * platform's own site, so a share link never returns any other saved address.
 */
export function toClientAdLinks(
  row: ClientAdLinks | null | undefined,
): ClientAdLinks {
  return {
    google_ads_url: isAdAccountLink("google_ads_url", row?.google_ads_url)
      ? row.google_ads_url
      : null,
    meta_ads_url: isAdAccountLink("meta_ads_url", row?.meta_ads_url)
      ? row.meta_ads_url
      : null,
  };
}

/** The ads platform of a report table, or null for a table that is not ads. */
export function adAccountPlatform(
  integrationType: string | null | undefined,
): AdAccountPlatform | null {
  return PLATFORM_BY_TYPE[integrationType || ""] ?? null;
}

/**
 * External Ads Manager URL for a report table, matching the client-card
 * reports tab. A link saved on the client card wins: Google Ads opens an
 * account by an internal id, so the customer-id link can land on the account
 * picker when access goes through a manager account.
 */
export function getAdAccountUrl(
  table: AdAccountTable | null | undefined,
  clientLinks?: ClientAdLinks | null,
): string | null {
  if (!table) {
    return null;
  }
  const settings = table.integration_settings || {};
  const platform = adAccountPlatform(table.integration_type);
  if (platform === "meta") {
    if (isAdAccountLink("meta_ads_url", clientLinks?.meta_ads_url)) {
      return clientLinks.meta_ads_url;
    }
    const id = String(settings.ad_account_id || "").replace(/^act_/, "");
    if (!id) {
      return null;
    }
    return `https://business.facebook.com/adsmanager/manage/campaigns?act=${id}`;
  }
  if (platform === "google") {
    if (isAdAccountLink("google_ads_url", clientLinks?.google_ads_url)) {
      return clientLinks.google_ads_url;
    }
    const id = String(
      settings.customer_id || settings.ad_account_id || "",
    ).replace(/-/g, "");
    if (!id) {
      return null;
    }
    return `https://ads.google.com/aw/overview?__e=${id}`;
  }
  return null;
}
