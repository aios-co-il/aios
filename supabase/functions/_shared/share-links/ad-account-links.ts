import {
  type AdAccountPlatform,
  type AdAccountTable,
  type ClientAdLinks,
  adAccountPlatform,
  getAdAccountUrl,
} from "./ad-account-url.ts";

/** One "open ad account" button; share links return these as `ad_account_links`. */
export type AdAccountShortcut = {
  url: string;
  platform: AdAccountPlatform;
  label: string;
};

const SINGLE_ACCOUNT_LABEL = "פתח חשבון מודעות";

const AD_ACCOUNT_LABELS: Record<AdAccountPlatform, string> = {
  meta: "חשבון Facebook",
  google: "חשבון Google Ads",
};

/** Distinct ads-account shortcuts for a client dashboard or a non-ads report. */
export function getAdAccountLinks(
  tables: Array<AdAccountTable> | null | undefined,
  clientLinks?: ClientAdLinks | null,
): Array<AdAccountShortcut> {
  const seen = new Set<string>();
  const links: Array<AdAccountShortcut> = [];
  for (const table of tables || []) {
    const url = getAdAccountUrl(table, clientLinks);
    const platform = adAccountPlatform(table?.integration_type);
    if (!url || !platform || seen.has(url)) {
      continue;
    }
    seen.add(url);
    links.push({ url, platform, label: AD_ACCOUNT_LABELS[platform] });
  }
  return links;
}

/**
 * A report's shortcuts: its own ads account, else the client's other ads
 * accounts (`clientTables`), as the signed-in report shows them.
 */
export function getTableAdAccountLinks(
  table: AdAccountTable | null | undefined,
  clientTables: Array<AdAccountTable> | null | undefined,
  clientLinks?: ClientAdLinks | null,
): Array<AdAccountShortcut> {
  const url = getAdAccountUrl(table, clientLinks);
  const platform = adAccountPlatform(table?.integration_type);
  if (url && platform) {
    return [{ url, platform, label: SINGLE_ACCOUNT_LABEL }];
  }
  return getAdAccountLinks(clientTables, clientLinks);
}

/** The button text: the platform name only when there is more than one button. */
export function adAccountShortcutLabel(
  link: AdAccountShortcut,
  total: number,
): string {
  return total > 1 ? link.label : SINGLE_ACCOUNT_LABEL;
}
