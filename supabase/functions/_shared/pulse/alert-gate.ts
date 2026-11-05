import { isCampaignOff } from "../campaign-goal/delivery-status.ts";
import type { PulseCampaignStatus } from "./targetless-status.ts";

/**
 * Goals whose results the reports count (leads, purchases). Traffic,
 * awareness, reach, video and engagement campaigns show on the dashboard only.
 */
const ALERT_GOALS: ReadonlySet<string> = new Set(["leads", "ecommerce"]);

/**
 * A new campaign stays quiet until it has spent for this many full days
 * (David, 2026-11-06): a lead campaign often has no lead on its first day.
 */
export const NEW_CAMPAIGN_QUIET_FULL_DAYS = 3;

/** A campaign as the alert rule reads it; `goal` is the pulse's goal name. */
export type AlertGateCampaign = {
  goal: string;
  deliveryStatus: string;
  /** Spend in the last 3 full days. */
  spend3d: number;
  /** Full days from its first spend day through yesterday; 0 if it never spent. */
  fullDaysRunning: number;
};

/**
 * Whether a campaign may alert at all: its goal is leads or sales, it has run
 * for at least 3 full days, and it still runs (it spent in the last 3 full
 * days and is not paused, removed or ended). Meta keeps a campaign that
 * stopped spending ACTIVE, so the spend decides that it stopped.
 */
export function campaignMayAlert(campaign: AlertGateCampaign): boolean {
  return (
    ALERT_GOALS.has(campaign.goal) &&
    campaign.fullDaysRunning >= NEW_CAMPAIGN_QUIET_FULL_DAYS &&
    campaign.spend3d > 0 &&
    !isCampaignOff({ deliveryStatus: campaign.deliveryStatus })
  );
}

/**
 * A status that would alert, held back when the campaign may not alert: it
 * keeps its tier and reason and turns yellow, since red means an alert is sent.
 */
export function gatePulseAlert(
  status: PulseCampaignStatus,
  campaign: AlertGateCampaign,
): PulseCampaignStatus {
  if (!status.alertEligible || campaignMayAlert(campaign)) {
    return status;
  }
  return { ...status, status: "warning", alertEligible: false };
}
