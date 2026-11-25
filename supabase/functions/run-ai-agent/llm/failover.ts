import type { DbClient } from "../../_shared/supabase-clients.ts";
import { providerOf } from "./provider.ts";

// Surface an automatic provider switch so David sees it (intel feed + WhatsApp).
// Deduped to once per 30 min so a sustained outage doesn't spam the channel.
export async function recordProviderFailover(
  supabase: DbClient,
  tenantId: string,
  fromLabel: string,
  toLabel: string,
  reason: string,
) {
  try {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent, error: lookupError } = await supabase
      .from("integration_alerts_log")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("alert_type", "provider_failover")
      .gte("fired_at", since)
      .limit(1);
    if (lookupError) {
      throw new Error("lookup");
    }

    if (recent?.length) {
      return;
    }
    const { error: insertError } = await supabase
      .from("integration_alerts_log")
      .insert({
        tenant_id: tenantId,
        provider: providerOf(toLabel),
        alert_type: "provider_failover",
        reason: `כרמן עברה אוטומטית מ-${fromLabel} ל-${toLabel} (${reason})`,
      });
    if (insertError) {
      throw new Error("insert");
    }

    const { error: notifyError } = await supabase.rpc("claude_notify_david", {
      p_message: `♻️ כרמן המשיכה לעבוד ללא הפרעה: הספק ${fromLabel} נגמר/נחסם ועברתי אוטומטית ל-${toLabel}. כדאי לטעון קרדיט לספק המקורי.`,
    });
    if (notifyError) {
      throw new Error("notification");
    }
  } catch {
    // Reporting is best-effort; never include provider responses or keys in logs.
    console.error("[AGENT] Provider failover reporting failed");
  }
}
