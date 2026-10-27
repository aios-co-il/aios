import { normalizeNotifyPhone } from "../_shared/carmen-notify-target.ts";
import { loadNotifyReportRecipients } from "../_shared/carmen-report-recipients/load.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/**
 * Whom the tenant's Carmen reports to, recent Carmen sessions (newest first)
 * and active campaigners with a phone. A failed report-list read is logged,
 * returned as reportRecipientsError and leaves the staff chain to decide; any
 * other failed read throws.
 */
export async function loadNotifyRecipients(
  sb: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
) {
  const [report, sessions, campaigners] = await Promise.all([
    loadNotifyReportRecipients(sb, tenantId, "claude-notify"),
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
  const error = sessions.error ?? campaigners.error;
  if (error) {
    throw new Error(`claude-notify: load recipients failed: ${error.message}`);
  }
  return {
    reportRecipients: report.recipients,
    reportRecipientsError: report.error,
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
