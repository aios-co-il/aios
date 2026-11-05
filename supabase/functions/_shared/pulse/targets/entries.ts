import { isJsonObject, type JsonObject } from "../json.ts";
import {
  normalizeTargetSource,
  pulseTargetDirection,
  pulseTargetKindsForGoal,
  type PulseTarget,
  type PulseTargetKind,
  type PulseTargetScope,
} from "./kinds.ts";

/** The campaign a target is looked up for: its id, else its name. */
export type CampaignRef = {
  campaignId?: unknown;
  campaignName?: unknown;
} | null;

/**
 * Every valid target for the goal in one table's integration_settings, most
 * specific first:
 *   pulse_targets[campaignId | campaignName]   one campaign (legacy alias: campaign_targets)
 *   pulse_platform_targets[goal | "default"]    every campaign of that goal in the table
 *   pulse_targets.default                       legacy table-wide default
 *   target_roas / target_cpa / target_cpl / target_cost_per_result   legacy table fields
 */
export function targetsAtPlace(
  settings: unknown,
  goal: string,
  campaign: CampaignRef,
): PulseTarget[] {
  const s = isJsonObject(settings) ? settings : {};
  const targets = campaignTargets(s);
  const platformTargets = isJsonObject(s.pulse_platform_targets)
    ? s.pulse_platform_targets
    : {};
  const found = [
    // The readers try the id before the name.
    ...campaignSlots(campaign).map((slot) =>
      targetFromEntry(targets[slot], goal, "campaign"),
    ),
    targetFromEntry(platformTargets[goal], goal, "platform"),
    targetFromEntry(platformTargets.default, goal, "platform"),
    targetFromEntry(targets.default, goal, "default"),
    // Legacy table fields have no source: a person set them in the report settings.
    targetFromEntry(
      {
        roas: s.target_roas,
        cpa: s.target_cpa,
        cpl: s.target_cpl,
        cost_per_result: s.target_cost_per_result,
      },
      goal,
      "table",
    ),
  ];
  return found.filter((target): target is PulseTarget => target !== null);
}

/** The first of the goal's kinds the entry holds, as a target at `scope`. */
export function targetFromEntry(
  entry: unknown,
  goal: string,
  scope: PulseTargetScope,
): PulseTarget | null {
  for (const kind of pulseTargetKindsForGoal(goal)) {
    const value = readKind(entry, kind);
    if (value === null || !isJsonObject(entry)) {
      continue;
    }
    const source = normalizeTargetSource(entry.source);
    return {
      value,
      kind,
      direction: pulseTargetDirection(kind),
      source,
      scope,
      rationale:
        source === "carmen_market" && entry.rationale
          ? String(entry.rationale)
          : null,
      set_at: entry.set_at ? String(entry.set_at) : null,
      set_by: entry.set_by ? String(entry.set_by) : null,
    };
  }
  return null;
}

/** A positive value for `kind` (or its legacy `target_` key), else null. */
export function readKind(entry: unknown, kind: PulseTargetKind): number | null {
  if (!isJsonObject(entry)) {
    return null;
  }
  const value = Number(entry[kind] ?? entry[`target_${kind}`]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The per-campaign targets map; the legacy campaign_targets name is still read. */
export function campaignTargets(settings: JsonObject): JsonObject {
  const targets = settings.pulse_targets || settings.campaign_targets;
  return isJsonObject(targets) ? targets : {};
}

/** The slot a campaign target is written under: the id, else the name. */
export function campaignSlotKey(campaign: CampaignRef): string | null {
  if (!campaign) {
    return null;
  }
  const id = String(campaign.campaignId ?? "").trim();
  if (id) {
    return id;
  }
  const name = String(campaign.campaignName ?? "").trim();
  return name || null;
}

/** Every slot a campaign's target can sit under, id first ("default" is never one). */
export function campaignSlots(campaign: CampaignRef): string[] {
  if (!campaign) {
    return [];
  }
  const id = String(campaign.campaignId ?? "").trim();
  const name = String(campaign.campaignName ?? "").trim();
  return [...new Set([id, name])].filter((slot) => slot && slot !== "default");
}

/**
 * The campaign's name entry when its target sits under its id. The readers try
 * the id before the name, so an entry under the name is stale once the id holds
 * one, and removing must clear both.
 */
export function staleCampaignNameSlot(
  campaign: { campaignName?: string | null },
  slot: string,
): string[] {
  const name = (campaign.campaignName || "").trim();
  return name && name !== slot && name !== "default" ? [name] : [];
}

/** The goal a stored campaign entry was written for (older entries carry none). */
export function entryGoal(entry: unknown): string | null {
  if (!isJsonObject(entry)) {
    return null;
  }
  const goal = String(entry.goal ?? "");
  if (pulseTargetKindsForGoal(goal).length) {
    return goal;
  }
  if (readKind(entry, "roas") !== null || readKind(entry, "cpa") !== null) {
    return "ecommerce";
  }
  if (readKind(entry, "cpl") !== null) {
    return "leads";
  }
  if (readKind(entry, "cost_per_result") !== null) {
    return "engagement";
  }
  return null;
}
