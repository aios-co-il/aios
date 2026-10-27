import { isJsonObject, type JsonObject, type JsonValue } from "../json.ts";
import { campaignSlotKey, campaignTargets, readKind } from "./entries.ts";
import {
  normalizeTargetSource,
  pulseTargetKindsForGoal,
  type PulseTargetKind,
  type PulseTargetSource,
} from "./kinds.ts";

/** One target to write (a positive value) or remove (null). */
export type PulseTargetPatchInput = {
  goal: string;
  value: number | null;
  kind?: PulseTargetKind | null;
  source?: PulseTargetSource;
  campaignId?: string | null;
  campaignName?: string | null;
  rationale?: string | null;
  setBy?: string | null;
  approvedBy?: string | null;
  setAt?: string | null;
};

/**
 * New integration_settings with one target written or removed: under the
 * campaign's slot when a campaign is given, else under the platform goal. A slot
 * holds one target, so writing replaces it whole (kind, value, source and
 * rationale): an approved save also drops Carmen's market rationale.
 */
export function buildPulseTargetPatch(
  existingSettings: unknown,
  input: PulseTargetPatchInput,
): JsonObject {
  const settings = isJsonObject(existingSettings) ? existingSettings : {};
  const kinds = pulseTargetKindsForGoal(input.goal);
  if (!kinds.length) {
    throw new Error(`unsupported pulse goal: ${input.goal}`);
  }
  const kind = input.kind || kinds[0];
  if (!kinds.includes(kind)) {
    throw new Error(`target kind ${kind} does not fit goal ${input.goal}`);
  }
  const value = input.value === null ? null : Number(input.value);
  const entry =
    value === null || !Number.isFinite(value) || value <= 0
      ? null
      : targetEntry(input, kind, value);
  const slot = campaignSlotKey({
    campaignId: input.campaignId,
    campaignName: input.campaignName,
  });
  if (slot === "default") {
    throw new Error("a campaign cannot be named 'default' in pulse_targets");
  }
  if (slot) {
    return {
      ...settings,
      pulse_targets: campaignSlotPatch(settings, input, slot, entry),
    };
  }
  return {
    ...settings,
    pulse_platform_targets: platformPatch(settings, input.goal, kinds, entry),
  };
}

/** The stored entry: value, source, Carmen's rationale and who set it when. */
function targetEntry(
  input: PulseTargetPatchInput,
  kind: PulseTargetKind,
  value: number,
): JsonObject {
  const source = normalizeTargetSource(input.source);
  return withoutEmpty({
    [kind]: value,
    source,
    rationale:
      source === "carmen_market" ? String(input.rationale || "").trim() : null,
    set_at: input.setAt || new Date().toISOString(),
    set_by: input.setBy || null,
    approved_by: source === "approved" ? input.approvedBy || null : null,
  });
}

/** pulse_targets with the campaign's slot written (entry) or cleared (null). */
function campaignSlotPatch(
  settings: JsonObject,
  input: PulseTargetPatchInput,
  slot: string,
  entry: JsonObject | null,
): JsonObject {
  // Keep a legacy campaign_targets map: the readers fall back to it only when
  // pulse_targets is missing, so the first write carries it over.
  const targets = { ...campaignTargets(settings) };
  // The readers try the id before the name, so an entry under the name is stale
  // once the id holds one, and removing must clear both.
  const name = String(input.campaignName || "").trim();
  if (name && name !== slot && name !== "default") {
    delete targets[name];
  }
  if (entry) {
    targets[slot] = { ...entry, goal: input.goal };
  } else {
    delete targets[slot];
  }
  return targets;
}

/** pulse_platform_targets with the goal's target written or its fields removed. */
function platformPatch(
  settings: JsonObject,
  goal: string,
  kinds: readonly PulseTargetKind[],
  entry: JsonObject | null,
): JsonObject {
  const platformTargets = {
    ...(isJsonObject(settings.pulse_platform_targets)
      ? settings.pulse_platform_targets
      : {}),
  };
  if (entry) {
    platformTargets[goal] = entry;
    return platformTargets;
  }
  const stored = platformTargets[goal];
  const next = { ...(isJsonObject(stored) ? stored : {}) };
  for (const k of kinds) {
    delete next[k];
    delete next[`target_${k}`];
  }
  if (kinds.some((k) => readKind(next, k) !== null)) {
    platformTargets[goal] = next;
  } else {
    delete platformTargets[goal];
  }
  return platformTargets;
}

/** The entry without null, undefined or empty-string fields. */
function withoutEmpty(entry: { [key: string]: JsonValue | undefined }) {
  return Object.fromEntries(
    Object.entries(entry).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}
