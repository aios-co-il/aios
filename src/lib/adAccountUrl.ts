/** The direct account links saved on a client card, which win over built ones. */
export type ClientAdLinks = {
  google_ads_url?: string | null;
  meta_ads_url?: string | null;
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
 * External Ads Manager URL for a report table, matching the client-card
 * reports tab. A link saved on the client card wins: Google Ads opens an
 * account by an internal id, so the customer-id link can land on the account
 * picker when access goes through a manager account.
 */
export function getAdAccountUrl(
  table:
    | {
        integration_type?: string | null;
        integration_settings?: {
          ad_account_id?: string | null;
          customer_id?: string | null;
        } | null;
      }
    | null
    | undefined,
  clientLinks?: ClientAdLinks | null,
): string | null {
  if (!table) return null;
  const settings = table.integration_settings || {};
  const type = table.integration_type;
  if (type === "facebook_insights" || type === "facebook_ecommerce") {
    if (isAdAccountLink("meta_ads_url", clientLinks?.meta_ads_url)) {
      return clientLinks.meta_ads_url;
    }
    const id = String(settings.ad_account_id || "").replace(/^act_/, "");
    if (!id) return null;
    return `https://business.facebook.com/adsmanager/manage/campaigns?act=${id}`;
  }
  if (type === "google_ads") {
    if (isAdAccountLink("google_ads_url", clientLinks?.google_ads_url)) {
      return clientLinks.google_ads_url;
    }
    const id = String(
      settings.customer_id || settings.ad_account_id || "",
    ).replace(/-/g, "");
    if (!id) return null;
    return `https://ads.google.com/aw/overview?__e=${id}`;
  }
  return null;
}

export type AdAccountShortcut = {
  url: string;
  label: string;
};

const AD_ACCOUNT_LABELS: Record<string, string> = {
  facebook_insights: "חשבון Facebook",
  facebook_ecommerce: "חשבון Facebook",
  google_ads: "חשבון Google Ads",
};

/** Distinct ads-account shortcuts for a client dashboard or a non-ads report. */
export function getAdAccountLinks(
  tables:
    | Array<
        Parameters<typeof getAdAccountUrl>[0] & {
          integration_type?: string | null;
        }
      >
    | null
    | undefined,
  clientLinks?: ClientAdLinks | null,
): AdAccountShortcut[] {
  const seen = new Set<string>();
  const links: AdAccountShortcut[] = [];
  for (const table of tables || []) {
    const url = getAdAccountUrl(table, clientLinks);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push({
      url,
      label:
        AD_ACCOUNT_LABELS[table?.integration_type || ""] || "פתח חשבון מודעות",
    });
  }
  return links;
}

export function adAccountShortcutLabel(
  link: AdAccountShortcut,
  total: number,
): string {
  return total > 1 ? link.label : "פתח חשבון מודעות";
}
