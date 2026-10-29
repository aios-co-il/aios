import {
  campaignSlots,
  campaignTargets,
  entryGoal,
  targetFromEntry,
  type CampaignRef,
} from "./entries.ts";
import { isJsonObject } from "../json.ts";
import {
  normalizeTargetSource,
  pulseTargetKindsForGoal,
  type PulseTarget,
} from "./kinds.ts";
import { resolvePulseTarget } from "./resolve.ts";

/** Whether Carmen may write a market target here, and the approved one that blocks her. */
export type MarketTargetCheck = {
  ok: boolean;
  reason: "unsupported_goal" | "approved_target_exists" | null;
  existing: PulseTarget | null;
};

/**
 * May Carmen write a market target here? Never where an approved target applies:
 * at campaign level an approved campaign, platform, default or table target blocks
 * it (approved beats market at any level, see resolvePulseTarget), and so does an
 * approved entry stored under the campaign's id or name for any goal, because a
 * write replaces that slot whole. At platform level an approved platform, default
 * or table target blocks it. Carmen may replace her own earlier estimate.
 */
export function canSetMarketTarget(
  settings: unknown,
  goal: string,
  campaign: CampaignRef = null,
): MarketTargetCheck {
  if (!pulseTargetKindsForGoal(goal).length) {
    return { ok: false, reason: "unsupported_goal", existing: null };
  }
  const slotTarget = approvedCampaignSlot(settings, campaign);
  if (slotTarget) {
    return {
      ok: false,
      reason: "approved_target_exists",
      existing: slotTarget,
    };
  }
  const existing = resolvePulseTarget(settings, goal, campaign);
  if (existing && existing.source === "approved") {
    return { ok: false, reason: "approved_target_exists", existing };
  }
  return { ok: true, reason: null, existing };
}

/** An approved target stored under the campaign's id or name, for any goal. */
function approvedCampaignSlot(
  settings: unknown,
  campaign: CampaignRef,
): PulseTarget | null {
  const targets = campaignTargets(isJsonObject(settings) ? settings : {});
  for (const slot of campaignSlots(campaign)) {
    const entry = targets[slot];
    if (
      !isJsonObject(entry) ||
      normalizeTargetSource(entry.source) !== "approved"
    ) {
      continue;
    }
    const goalOfEntry = entryGoal(entry);
    const existing = goalOfEntry
      ? targetFromEntry(entry, goalOfEntry, "campaign")
      : null;
    if (existing) {
      return existing;
    }
  }
  return null;
}
