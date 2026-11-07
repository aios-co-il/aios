/**
 * A campaign's delivery status: running, paused, removed, ended (Google's
 * primary status ENDED: its end date passed), another platform state, or
 * unknown when nothing says.
 */
export type CampaignDeliveryStatus =
  "active" | "paused" | "removed" | "ended" | "other" | "unknown";

const PAUSED_DELIVERY_STATUSES = new Set([
  "PAUSED",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
  "AD_PAUSED",
]);
const ACTIVE_DELIVERY_STATUSES = new Set([
  "ACTIVE",
  "ENABLED",
  "ELIGIBLE",
  "LIMITED",
  "LEARNING",
]);
const REMOVED_DELIVERY_STATUSES = new Set([
  "REMOVED",
  "DELETED",
  "ARCHIVED",
  "DISAPPROVED",
]);

/**
 * The status one row states (Meta syncs stamp effective_status on each row),
 * else the campaign's state in the table's `operational_campaign_states`
 * (Google Ads rows carry no status; the operational check stores it there).
 */
export function resolveCampaignDeliveryStatus(
  data: Record<string, unknown> = {},
  integrationSettings: Record<string, unknown> = {},
): CampaignDeliveryStatus {
  const raw = String(
    data.effective_status ||
      data.configured_status ||
      data.campaign_status ||
      data.status ||
      "",
  )
    .trim()
    .toUpperCase();
  if (raw) {
    if (PAUSED_DELIVERY_STATUSES.has(raw) || raw.includes("PAUSED")) {
      return "paused";
    }
    if (ACTIVE_DELIVERY_STATUSES.has(raw)) {
      return "active";
    }
    if (REMOVED_DELIVERY_STATUSES.has(raw)) {
      return "removed";
    }
    return "other";
  }
  const campaignId = String(data.campaign_id || data.campaignId || "");
  const states = integrationSettings.operational_campaign_states;
  if (campaignId && isRecord(states)) {
    return operationalStatus(states[campaignId]);
  }
  return "unknown";
}

/** Hebrew label of a delivery status, as the pulse shows it. */
export function campaignDeliveryStatusLabel(status: string): string {
  if (status === "active") {
    return "פעיל";
  }
  if (status === "paused") {
    return "מושהה";
  }
  if (status === "removed") {
    return "הוסר";
  }
  if (status === "ended") {
    return "הסתיים";
  }
  if (status === "other") {
    return "לא פעיל";
  }
  return "לא ידוע";
}

/**
 * A campaign is off when its report is switched off (`campaign_active`) or
 * the platform says it is paused, removed or ended. An unknown status is not
 * off: Google Ads records carry no campaign status, so only the report switch
 * (or the operational state the pulse reads) can turn a Google campaign off.
 */
export function isCampaignOff(input: {
  deliveryStatus?: string | null;
  reportActive?: boolean | null;
}): boolean {
  return (
    input.reportActive === false ||
    input.deliveryStatus === "paused" ||
    input.deliveryStatus === "removed" ||
    input.deliveryStatus === "ended"
  );
}

/**
 * Each campaign's status from its latest dated record that states one, since
 * each sync stamps the campaign's status at that time on the rows it writes.
 * Campaigns none of whose records state a status are left out.
 */
export function latestCampaignStatuses<
  T extends { data?: Record<string, unknown> | null },
>(
  records: Array<T>,
  keyOf: (data: Record<string, unknown>, record: T) => string,
): Map<string, CampaignDeliveryStatus> {
  const latest = new Map<
    string,
    { date: string; status: CampaignDeliveryStatus }
  >();
  for (const record of records) {
    const data = record.data ?? {};
    const status = resolveCampaignDeliveryStatus(data);
    if (status === "unknown") {
      continue;
    }
    const key = keyOf(data, record);
    const date = typeof data.date === "string" ? data.date : "";
    const previous = latest.get(key);
    if (!previous || date >= previous.date) {
      latest.set(key, { date, status });
    }
  }
  const statuses = new Map<string, CampaignDeliveryStatus>();
  for (const [key, { status }] of latest) {
    statuses.set(key, status);
  }
  return statuses;
}

/** One Google campaign's state as the operational check reads it. */
export type OperationalCampaignStatus = {
  id: string;
  status: string;
  primary_status?: string | null;
};

/**
 * The `operational_campaign_states` the Google operational check stores on its
 * table, keyed by campaign id, for resolveCampaignDeliveryStatus to read.
 */
export function operationalCampaignStates<T extends OperationalCampaignStatus>(
  campaigns: Array<T>,
): Record<string, T> {
  return Object.fromEntries(
    campaigns.map((campaign) => [campaign.id, campaign]),
  );
}

/** The status an operational state stores; Google's ENDED wins over ENABLED. */
function operationalStatus(state: unknown): CampaignDeliveryStatus {
  if (!isRecord(state)) {
    return "unknown";
  }
  if (String(state.primary_status || "").toUpperCase() === "ENDED") {
    return "ended";
  }
  const status = String(state.status || "").toUpperCase();
  if (status === "PAUSED") {
    return "paused";
  }
  if (status === "ENABLED") {
    return "active";
  }
  if (status === "REMOVED") {
    return "removed";
  }
  return "unknown";
}

/** Settings JSON is untyped; any non-null object can hold per-campaign keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}
