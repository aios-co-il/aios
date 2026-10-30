import { isJsonObject, sameJson, type JsonObject } from "../json.ts";
import {
  campaignSlotKey,
  campaignTargets,
  staleCampaignNameSlot,
} from "./entries.ts";
import type { PulseTargetPatchInput } from "./patch.ts";

/**
 * Undoes buildPulseTargetPatch, for a save that failed on a later table. Only the
 * slots the patch wrote get their value from `previousSettings` back, or are
 * removed when they had none: the goal under pulse_platform_targets, or the
 * campaign's slot and its name entry under pulse_targets. Everything else keeps
 * what `currentSettings` holds, so neither a sync's write nor a save to another
 * goal or campaign of the table since is undone. A target map the patch created
 * is removed again when nothing else was saved into it.
 */
export function revertPulseTargetPatch(
  currentSettings: unknown,
  previousSettings: unknown,
  input: Pick<PulseTargetPatchInput, "goal" | "campaignId" | "campaignName">,
): JsonObject {
  const settings = isJsonObject(currentSettings) ? { ...currentSettings } : {};
  const previous = isJsonObject(previousSettings) ? previousSettings : {};
  const slot = campaignSlotKey(input);
  if (slot) {
    return restoreSlots(settings, previous, "pulse_targets", {
      before: campaignTargets(previous),
      slots: [slot, ...staleCampaignNameSlot(input, slot)],
    });
  }
  const platformBefore = previous.pulse_platform_targets;
  return restoreSlots(settings, previous, "pulse_platform_targets", {
    before: isJsonObject(platformBefore) ? platformBefore : {},
    slots: [input.goal],
  });
}

/**
 * settings[key] with each slot put back to its value in `before`, or removed.
 * Other slots keep what settings holds now. When the table had no such key and
 * the map is back to `before`, the key goes too.
 */
function restoreSlots(
  settings: JsonObject,
  previous: JsonObject,
  key: "pulse_targets" | "pulse_platform_targets",
  { before, slots }: { before: JsonObject; slots: string[] },
): JsonObject {
  const current = settings[key];
  const restored = { ...(isJsonObject(current) ? current : {}) };
  for (const slot of slots) {
    if (before[slot] === undefined) {
      delete restored[slot];
    } else {
      restored[slot] = before[slot];
    }
  }
  if (previous[key] === undefined && sameJson(restored, before)) {
    delete settings[key];
  } else {
    settings[key] = restored;
  }
  return settings;
}
