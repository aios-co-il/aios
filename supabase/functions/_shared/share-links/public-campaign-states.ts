import { isPlainObject } from "./public-table-settings.ts";

/** Each campaign's platform status, as the share link returns it. */
export type PublicCampaignStates = Record<string, { status: CampaignStatus }>;

type CampaignStatus = "ENABLED" | "PAUSED" | "REMOVED";

const CAMPAIGN_STATUSES: ReadonlySet<string> = new Set([
  "ENABLED",
  "PAUSED",
  "REMOVED",
]);

const MAX_CAMPAIGN_ID_LENGTH = 256;

/**
 * Each campaign's status from operational_campaign_states. The campaign name
 * and status reasons are dropped, and so is any status outside the enum.
 */
export function campaignStatuses(
  value: unknown,
): PublicCampaignStates | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const out: PublicCampaignStates = {};
  for (const [campaignId, state] of Object.entries(value)) {
    const status = isPlainObject(state) ? state.status : undefined;
    if (
      campaignId.length <= MAX_CAMPAIGN_ID_LENGTH &&
      isCampaignStatus(status)
    ) {
      out[campaignId] = { status };
    }
  }
  return out;
}

/** A campaign status the operational check stores. */
function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && CAMPAIGN_STATUSES.has(value);
}
