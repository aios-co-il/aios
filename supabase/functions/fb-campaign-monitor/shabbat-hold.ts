/**
 * Shabbat hold for campaign_alerts WhatsApp (AIO-226). Every alert is still
 * recorded on Saturday; a non-critical one is stored with a marker and no
 * WhatsApp, and the first run after Shabbat that still sees it open sends it.
 */
import { isAlertHeldForShabbat } from "../_shared/shabbat/critical-alerts.ts";
import { isJerusalemShabbat } from "../_shared/shabbat/quiet-window.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** Marker stored in campaign_alerts.details when WhatsApp was held for Shabbat. */
export const CAMPAIGN_ALERT_SHABBAT_HOLD = "shabbat";

type CampaignAlertRowLike = {
  notified_at?: string | null;
  details?: Record<string, unknown> | null;
};

type HoldableAlert = {
  alert_type: string;
  details?: Record<string, unknown> | null;
};

/**
 * Sends the held WhatsApp of a re-detected open alert once. notified_at is
 * claimed before the send, so overlapping runs cannot both send it.
 */
export async function releaseHeldAlert(
  db: Pick<DbClient, "from">,
  existing: CampaignAlertRowLike & { id: string },
  notify: (alertId: string) => Promise<void>,
  now: Date = new Date(),
): Promise<void> {
  if (!shouldReleaseHeldCampaignAlert(existing, now)) {
    return;
  }
  const { data: claimed, error: claimError } = await db
    .from("campaign_alerts")
    .update({ notified_at: now.toISOString() })
    .eq("id", existing.id)
    .is("notified_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) {
    console.error(
      "[fb-campaign-monitor] held alert claim failed",
      existing.id,
      claimError.message,
    );
    return;
  }
  if (claimed) {
    await notify(existing.id);
  }
}

/**
 * The row to insert, marked, when this alert's WhatsApp must wait for Shabbat
 * to end; null when it may go out now.
 */
export function holdMarker<T extends HoldableAlert>(
  alert: T,
  now: Date = new Date(),
): T | null {
  if (!isAlertHeldForShabbat(alert.alert_type, now)) {
    return null;
  }
  return {
    ...alert,
    details: {
      ...(alert.details || {}),
      whatsapp_hold: CAMPAIGN_ALERT_SHABBAT_HOLD,
    },
  };
}

/**
 * A row whose WhatsApp was held is released by the first run after Shabbat
 * that still detects the same open alert. Rows without the marker (older rows,
 * or rows that had no recipient) are never replayed.
 */
export function shouldReleaseHeldCampaignAlert(
  row: CampaignAlertRowLike | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row || row.notified_at) {
    return false;
  }
  if (row.details?.whatsapp_hold !== CAMPAIGN_ALERT_SHABBAT_HOLD) {
    return false;
  }
  return !isJerusalemShabbat(now);
}
