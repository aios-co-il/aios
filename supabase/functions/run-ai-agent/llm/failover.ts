import type { AgentDatabaseClient } from "../database-contracts.ts";
import { providerOf } from "./provider.ts";

// Surface an automatic provider switch so David sees it (intel feed + WhatsApp).
// Deduped to once per 30 min so a sustained outage doesn't spam the channel.
/** Preserves the existing recordProviderFailover provider boundary. */
export async function recordProviderFailover(
  supabase: AgentDatabaseClient,
  tenantId: string,
  fromLabel: string,
  toLabel: string,
  reason: string,
) {
  try {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("integration_alerts_log")
      .select("id")
      .eq("alert_type", "provider_failover")
      .gte("fired_at", since)
      .limit(1);
    if (recent?.length) {
      return;
    }
    await supabase.from("integration_alerts_log").insert({
      tenant_id: tenantId,
      provider: providerOf(toLabel),
      alert_type: "provider_failover",
      reason: `כרמן עברה אוטומטית מ-${fromLabel} ל-${toLabel} (${reason})`,
    });
    await supabase
      .rpc("claude_notify_david", {
        p_message: `♻️ כרמן המשיכה לעבוד ללא הפרעה: הספק ${fromLabel} נגמר/נחסם ועברתי אוטומטית ל-${toLabel}. כדאי לטעון קרדיט לספק המקורי.`,
      })
      .then(
        () => {},
        () => {},
      );
  } catch {
    /* reporting must never break the reply */
  }
}
