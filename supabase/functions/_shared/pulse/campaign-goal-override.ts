/**
 * The goal written by hand for one campaign in the report settings
 * (`pulse_campaign_goals`, keyed by campaign id or name), lower-cased; "" when
 * none is set. The caller checks it against the known pulse goals.
 */
export function campaignGoalOverride(
  data: Record<string, unknown>,
  settings: Record<string, unknown>,
): string {
  const overrides = settings.pulse_campaign_goals;
  if (!isRecord(overrides)) {
    return "";
  }
  const id = data.campaign_id || data.campaignId;
  const name = data.campaign_name || data.campaignName;
  const goal =
    overrideFor(overrides, id) ||
    overrideFor(overrides, typeof name === "string" ? name.trim() : name);
  return typeof goal === "string" ? goal.trim().toLowerCase() : "";
}

/** Settings JSON is untyped; any non-null object can hold per-campaign keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

/**
 * The override stored under one campaign key. Make/webhook rows can carry a
 * numeric campaign id, which reads the same JSON key as its string form.
 */
function overrideFor(
  overrides: Record<string, unknown>,
  key: unknown,
): unknown {
  if (typeof key === "number" || (typeof key === "string" && key)) {
    return overrides[key];
  }
  return undefined;
}
