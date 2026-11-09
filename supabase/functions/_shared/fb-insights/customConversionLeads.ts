/**
 * Custom conversion types that count as a lead: a lead, a registration or a
 * contact (David, 2026-11-09). A purchase or "other" custom conversion is not a
 * lead, even when it fires on a thank-you page.
 */
const LEAD_CUSTOM_EVENT_TYPES = new Set([
  "LEAD",
  "COMPLETE_REGISTRATION",
  "CONTACT",
]);

/** Meta reports each custom conversion as this prefix plus its id. */
const CUSTOM_CONVERSION_PREFIX = "offsite_conversion.custom.";

/** A custom pixel event by name; it carries no type, so it keeps counting. */
const CUSTOM_EVENT_PREFIX = "offsite_conversion.fb_pixel_custom.";

/** One action of an insights row, as the Graph API returns it. */
type InsightAction = { action_type: string; value: string };

type CustomConversionsPage = {
  data?: Array<{ id?: unknown; custom_event_type?: unknown }>;
  error?: { message?: string };
  paging?: { next?: string };
};

/**
 * Ids of the ad account's lead, registration and contact custom conversions.
 * Null when Meta refuses the read: the sync then counts custom conversions as
 * before rather than dropping every custom-conversion lead.
 */
export async function fetchLeadCustomConversionIds(
  adAccountId: string,
  accessToken: string,
): Promise<Set<string> | null> {
  const ids = new Set<string>();
  let next: string | null =
    `https://graph.facebook.com/v21.0/${adAccountId}/customconversions` +
    `?fields=id,custom_event_type&limit=500&access_token=${accessToken}`;
  try {
    while (next) {
      const response = await fetch(next);
      const page: CustomConversionsPage = await response.json();
      if (page.error) {
        throw new Error(page.error.message || "custom conversions read failed");
      }
      for (const conversion of page.data ?? []) {
        const type = String(conversion.custom_event_type ?? "").toUpperCase();
        if (LEAD_CUSTOM_EVENT_TYPES.has(type)) {
          ids.add(String(conversion.id));
        }
      }
      next = page.paging?.next ?? null;
    }
  } catch (error) {
    console.error(
      "[fbInsights] custom conversions read failed; counting every custom conversion:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
  return ids;
}

/**
 * Leads a row's custom conversions and custom pixel events add. With the
 * account's lead conversion ids only those conversions count, beside the named
 * custom events. Without them (the read failed) everything counts as before:
 * the children, or the parent aggregate when Meta sends no children, never
 * both, since the parent is their sum.
 */
export function customConversionLeads(
  actions: Array<InsightAction>,
  leadConversionIds: Set<string> | null,
): number {
  if (leadConversionIds) {
    return sumActions(
      actions,
      (type) =>
        type.startsWith(CUSTOM_EVENT_PREFIX) ||
        (type.startsWith(CUSTOM_CONVERSION_PREFIX) &&
          leadConversionIds.has(type.slice(CUSTOM_CONVERSION_PREFIX.length))),
    );
  }
  const children = sumActions(
    actions,
    (type) =>
      type.startsWith(CUSTOM_CONVERSION_PREFIX) ||
      type.startsWith(CUSTOM_EVENT_PREFIX),
  );
  if (children > 0) {
    return children;
  }
  return sumActions(
    actions,
    (type) =>
      type === "offsite_conversion.fb_pixel_custom" ||
      type === "offsite_conversion.custom",
  );
}

/** Sum of the actions whose type matches. */
function sumActions(
  actions: Array<InsightAction>,
  matches: (type: string) => boolean,
): number {
  return actions
    .filter((action) => matches(action.action_type))
    .reduce((sum, action) => sum + (parseInt(action.value) || 0), 0);
}
