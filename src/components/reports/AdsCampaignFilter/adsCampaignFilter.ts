import {
  type AdsEntityLevel,
  getEntityDisplayName,
  getEntityGroupKey,
} from "@/lib/adsEntityLevel";
import { getSpendFromData } from "@/lib/adsMetrics";

type AdsRecord = { data?: Record<string, unknown> };

/** A campaign the ad set and ad tabs can be narrowed to. */
export type AdsCampaignOption = {
  /** The campaign's group key: its campaign_id, else its name. */
  key: string;
  name: string;
  spend: number;
};

/**
 * The campaigns with rows at the ad set or ad level, biggest spend first like
 * the goal tables below them, so the campaigns that matter lead a long list.
 * The campaign level is never narrowed, so it lists none.
 */
export function listAdsCampaigns(
  levelRecords: Array<AdsRecord>,
  level: AdsEntityLevel,
): Array<AdsCampaignOption> {
  if (level === "campaign") {
    return [];
  }

  const byKey = new Map<string, AdsCampaignOption>();
  for (const record of levelRecords) {
    const key = campaignKeyOf(record);
    const option = byKey.get(key) ?? {
      key,
      name: getEntityDisplayName(record.data, "campaign"),
      spend: 0,
    };
    option.spend += getSpendFromData(record.data);
    byKey.set(key, option);
  }
  return [...byKey.values()].sort(
    (a, b) => b.spend - a.spend || a.name.localeCompare(b.name, "he"),
  );
}

/**
 * The campaign the rows are narrowed to, or null for every campaign: on the
 * campaign level, with no pick, or when the picked campaign has no rows in
 * the shown data (another date window), where the picker reads "all" too.
 */
export function resolveAdsCampaignKey(
  level: AdsEntityLevel,
  selected: string | null,
  campaigns: Array<AdsCampaignOption>,
): string | null {
  if (level === "campaign" || selected === null) {
    return null;
  }

  return campaigns.some((campaign) => campaign.key === selected)
    ? selected
    : null;
}

/** The records of one campaign, or every record when `campaignKey` is null. */
export function filterRecordsByCampaign<T extends AdsRecord>(
  records: Array<T>,
  campaignKey: string | null,
): Array<T> {
  if (campaignKey === null) {
    return records;
  }

  return records.filter((record) => campaignKeyOf(record) === campaignKey);
}

/** A row's campaign, keyed as the campaign tab groups it. */
function campaignKeyOf(record: AdsRecord): string {
  return getEntityGroupKey(record.data, "campaign");
}
