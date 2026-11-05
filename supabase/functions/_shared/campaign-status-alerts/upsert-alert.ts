import type { Json } from "../database.types.ts";
import type { DbClient } from "../supabase-clients.ts";
import { holdMarker, releaseHeldAlert } from "./shabbat-hold.ts";

type CampaignAlertInput = {
  tenant_id: string;
  campaign_id: string;
  alert_type: string;
  details?: { [key: string]: Json | undefined } | null;
};

type Notify = (alertId: string) => Promise<void>;

/**
 * Records a detected alert unless the same one is still open from the last
 * 24h, then sends its WhatsApp through `notify` (null for alert types that
 * never send). On Shabbat a non-critical alert is stored with the hold marker
 * instead (AIO-226), and a run after Shabbat that re-detects it sends it once.
 */
export async function upsertCampaignAlert<T extends CampaignAlertInput>(
  supabase: Pick<DbClient, "from">,
  alert: T,
  notify: Notify | null,
  now: Date = new Date(),
): Promise<{ id: string } | null> {
  const existing = await openAlertFromLastDay(supabase, alert, now);
  if (existing) {
    if (notify) {
      await releaseHeldAlert(supabase, existing, notify, now);
    }
    return null;
  }
  const heldRow = notify ? holdMarker(alert, now) : null;
  const { data, error } = await supabase
    .from("campaign_alerts")
    .insert(heldRow ?? alert)
    .select("id")
    .single();
  if (error) {
    console.error(
      "[campaign-status-alerts] could not record alert",
      alert.alert_type,
      alert.campaign_id,
      error.message,
    );
  }
  if (data?.id && !heldRow && notify) {
    await notify(data.id);
  }
  return data;
}

/**
 * The same alert still open from the last 24h. A failed lookup is logged and
 * reads as none, so the alert is still recorded.
 */
async function openAlertFromLastDay(
  supabase: Pick<DbClient, "from">,
  alert: CampaignAlertInput,
  now: Date,
) {
  const { data, error } = await supabase
    .from("campaign_alerts")
    .select("id, notified_at, details")
    .eq("tenant_id", alert.tenant_id)
    .eq("campaign_id", alert.campaign_id)
    .eq("alert_type", alert.alert_type)
    .is("resolved_at", null)
    .gte(
      "created_at",
      new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    )
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(
      "[campaign-status-alerts] open alert lookup failed",
      alert.alert_type,
      alert.campaign_id,
      error.message,
    );
  }
  return data;
}
