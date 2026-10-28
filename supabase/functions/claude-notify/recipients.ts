import { normalizeNotifyPhone } from "../_shared/carmen-notify-target.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** The tenant's pulse phone, recent Carmen sessions (newest first) and active campaigners with a phone. */
export async function loadNotifyRecipients(
  sb: Pick<DbClient, "from">,
  tenantId: string,
) {
  const [heartbeat, sessions, campaigners] = await Promise.all([
    sb
      .from("tenant_heartbeat_settings")
      .select("campaign_pulse_phone")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    sb
      .from("carmen_whatsapp_sessions")
      .select(
        "chat_id, phone, sender_name, connection_user_id, automation_id, last_message_at",
      )
      .eq("tenant_id", tenantId)
      .neq("phone", "")
      .order("last_message_at", { ascending: false })
      .limit(40),
    sb
      .from("campaigners")
      .select("full_name, phone, role, active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .limit(200),
  ]);
  const error = heartbeat.error ?? sessions.error ?? campaigners.error;
  if (error) {
    throw new Error(`claude-notify: load recipients failed: ${error.message}`);
  }
  return {
    campaignPulsePhone: heartbeat.data?.campaign_pulse_phone ?? null,
    sessions: sessions.data ?? [],
    staff: (campaigners.data ?? [])
      .filter((c) => !!normalizeNotifyPhone(c.phone))
      .map((c) => ({
        phone: c.phone,
        full_name: c.full_name,
        role: Array.isArray(c.role) ? (c.role[0] ?? null) : (c.role ?? null),
      })),
  };
}
