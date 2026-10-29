/** The WhatsApp of a monitor finding: who gets it and the send itself. */
import type { DbClient } from "../supabase-clients.ts";
import { findingMessage } from "./finding-message.ts";
import type { Finding, ReportAccount } from "./types.ts";

/** Managers of the tenant plus the active campaigners of the client's agency. */
async function resolveRecipients(
  db: DbClient,
  tenantId: string,
  clientId: string,
): Promise<string[]> {
  const phones = new Set<string>();
  const { data: managers } = await db
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "admin", "agency_owner", "agency_manager"]);
  const managerIds = (managers || []).map((m) => m.user_id);
  if (managerIds.length) {
    const { data: profiles } = await db
      .from("profiles")
      .select("phone")
      .in("id", managerIds);
    for (const profile of profiles || []) {
      if (profile.phone) phones.add(profile.phone);
    }
  }

  const { data: client } = await db
    .from("clients")
    .select("agency_id")
    .eq("id", clientId)
    .maybeSingle();
  if (client?.agency_id) {
    const { data: links } = await db
      .from("campaigner_agencies")
      .select("campaigner_id")
      .eq("agency_id", client.agency_id);
    const campaignerIds = (links || []).map((l) => l.campaigner_id);
    if (campaignerIds.length) {
      const { data: campaigners } = await db
        .from("campaigners")
        .select("phone, active")
        .in("id", campaignerIds);
      for (const campaigner of campaigners || []) {
        if (campaigner.active && campaigner.phone) phones.add(campaigner.phone);
      }
    }
  }
  return [...phones];
}

/** Sends the finding's WhatsApp to its recipients and stamps notified_at. */
export async function notifyWhatsapp(
  db: DbClient,
  tenantId: string,
  report: ReportAccount,
  finding: Finding,
  alertId: string,
) {
  const recipients = await resolveRecipients(db, tenantId, report.clientId);
  if (!recipients.length) return;
  // The send runs as a tenant owner (service-role calls name their sender).
  const { data: owner } = await db
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();
  if (!owner?.user_id) return;

  const message = findingMessage(report, finding);
  const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-manus-wa-message`;
  for (const phone of recipients) {
    try {
      await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          phoneNumber: phone,
          message,
          tenantId,
          senderUserId: owner.user_id,
          // Managers and campaigners only: the client send guard refuses a client.
          sendKind: "staff_alert",
        }),
      });
    } catch (e) {
      console.warn("[campaign-status-alerts] WA send failed", phone, e);
    }
  }
  await db
    .from("campaign_alerts")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", alertId);
}
