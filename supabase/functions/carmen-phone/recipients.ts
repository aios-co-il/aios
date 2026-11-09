import { clientTeamPhones } from "../_shared/carmen/client-intake.ts";
import { loadCarmenReportRecipients } from "../_shared/carmen-report-recipients/load.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { PhoneCall } from "./calls.ts";

/** Sends one WhatsApp to a team member; true when it went out. */
export type SendAlert = (
  tenantId: string,
  phone: string,
  message: string,
) => Promise<boolean>;

/**
 * Who hears about a call: a client's own team (its active campaigners, else the report list), and
 * for anyone else whom the org's Carmen reports to.
 */
export async function callRecipients(
  db: DbClient,
  call: PhoneCall,
): Promise<Array<string>> {
  if (call.callerKind === "client" && call.clientIds.length > 0) {
    return clientTeamPhones(db, call.tenantId, call.clientIds);
  }
  const report = await loadCarmenReportRecipients(db, call.tenantId);
  if (report.error) {
    console.error("[carmen-phone] report recipients unreadable", report.error);
  }
  return report.recipients.map((r) => r.phone);
}

/** Sends the text to each recipient; returns how many got it, and logs when nobody did. */
export async function notifyTeam(
  db: DbClient,
  sendAlert: SendAlert,
  call: PhoneCall,
  text: string,
): Promise<number> {
  let delivered = 0;
  for (const phone of await callRecipients(db, call)) {
    if (await sendAlert(call.tenantId, phone, text)) {
      delivered += 1;
    }
  }
  if (!delivered) {
    console.error("[carmen-phone] call notice reached no team member", {
      tenantId: call.tenantId,
      callId: call.id,
    });
  }
  return delivered;
}

/** How the team's messages name the caller. */
export function callerLabel(call: PhoneCall): string {
  const who =
    call.callerKind === "staff"
      ? "איש צוות"
      : call.callerKind === "client"
        ? "לקוח"
        : "פונה חדש";
  const name = call.callerName ? ` ${call.callerName}` : "";
  const phone = call.callerPhone ? ` (${call.callerPhone})` : " (מספר חסוי)";
  return `${who}${name}${phone}`;
}
