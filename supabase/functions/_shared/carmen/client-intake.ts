// A client who addresses Carmen in their own group, where the group's reply
// level is "client" (AIO-349): Carmen thanks them with a fixed reply, never
// an AI answer, so nothing internal can reach the client, and forwards the
// request privately to the client's team.
import { loadCarmenReportRecipients } from "../carmen-report-recipients/load.ts";
import { resolveRecipient } from "../client-send/recipient.ts";
import type { DbClient } from "../supabase-clients.ts";

/** Carmen's reply to the client in the group. */
export const CLIENT_INTAKE_REPLY_HE =
  "תודה, קיבלתי 🙏 העברתי את הבקשה לצוות ונחזור אליך בהקדם.";

type IntakeDb = Pick<DbClient, "from" | "rpc">;

/** The author's clients that this group belongs to. */
export type GroupClientAuthor = { clientIds: Array<string> };

/**
 * The author as a client, or a client's contact, of this group's own client,
 * by the phone on the card or its contacts; null for staff, anyone else or a
 * failed lookup (logged).
 */
export async function findGroupClientAuthor(
  db: Pick<DbClient, "rpc">,
  input: { tenantId: string; groupId: string; phone: string },
): Promise<GroupClientAuthor | null> {
  try {
    const author = await resolveRecipient(db, {
      tenantId: input.tenantId,
      channel: "whatsapp",
      address: input.phone,
      groupId: null,
    });
    if (
      !author ||
      author.senderStaff ||
      (author.kind !== "client" && author.kind !== "client_contact")
    ) {
      return null;
    }
    const groupClients = await groupClientIds(db, input.groupId);
    const clientIds = author.clientIds.filter((id) =>
      groupClients.includes(id),
    );
    return clientIds.length ? { clientIds } : null;
  } catch (error) {
    console.error("[carmen] group client author lookup failed", {
      tenantId: input.tenantId,
      groupId: input.groupId,
      error,
    });
    return null;
  }
}

/** The clients linked to a group, by the one rule of group links (AIO-242). */
async function groupClientIds(
  db: Pick<DbClient, "rpc">,
  groupId: string,
): Promise<Array<string>> {
  const { data, error } = await db.rpc("whatsapp_group_client_ids", {
    p_group: groupId,
  });
  if (error) {
    throw error;
  }
  return (data ?? []).filter((id): id is string => typeof id === "string");
}

/**
 * Forwards the client's request to the client's active campaigners, or, when
 * none has a phone, to whom the tenant's Carmen reports. Returns how many
 * staff members got it; a forward that reached nobody is logged.
 */
export async function forwardClientRequest(input: {
  db: Pick<DbClient, "from" | "rpc">;
  tenantId: string;
  groupId: string;
  clientIds: Array<string>;
  senderName: string | null | undefined;
  senderPhone: string;
  message: string;
  /** Sends one staff alert (sendStaffAlert in production); true when sent. */
  sendAlert: (phone: string, message: string) => Promise<boolean>;
}): Promise<number> {
  const [phones, context] = await Promise.all([
    teamPhones(input.db, input.tenantId, input.clientIds),
    forwardContext(input.db, input.groupId, input.clientIds),
  ]);
  const text = [
    `📩 פנייה מהלקוח ${context.clientNames} בקבוצה «${context.groupName}»`,
    `מאת: ${input.senderName || "ללא שם"} (${input.senderPhone})`,
    "",
    input.message,
    "",
    "כרמן ענתה ללקוח שהבקשה הועברה לצוות.",
  ].join("\n");
  let delivered = 0;
  for (const phone of phones) {
    if (await input.sendAlert(phone, text)) {
      delivered += 1;
    }
  }
  if (!delivered) {
    console.error("[carmen] client request reached no staff member", {
      tenantId: input.tenantId,
      groupId: input.groupId,
    });
  }
  return delivered;
}

/** The client's active campaigners' phones, else the tenant's report list. */
async function teamPhones(
  db: IntakeDb,
  tenantId: string,
  clientIds: Array<string>,
): Promise<Array<string>> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from("client_team")
    .select("campaigners(phone, active)")
    .in("client_id", clientIds)
    .or(`start_date.is.null,start_date.lte.${today}`)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (error) {
    console.error("[carmen] client team unreadable; using report list", error);
  }
  const campaignerPhones = (data ?? [])
    .map((row) => row.campaigners)
    .filter((campaigner) => campaigner?.active && campaigner.phone)
    .map((campaigner) => String(campaigner?.phone));
  if (campaignerPhones.length) {
    return [...new Set(campaignerPhones)];
  }
  const report = await loadCarmenReportRecipients(db, tenantId);
  if (report.error) {
    console.error("[carmen] report recipients unreadable", report.error);
  }
  return report.recipients.map((recipient) => recipient.phone);
}

/** The group's name and the clients' names, for the forwarded message. */
async function forwardContext(
  db: IntakeDb,
  groupId: string,
  clientIds: Array<string>,
): Promise<{ groupName: string; clientNames: string }> {
  const [group, clients] = await Promise.all([
    db
      .from("whatsapp_groups")
      .select("group_name")
      .eq("id", groupId)
      .maybeSingle(),
    db.from("clients").select("name").in("id", clientIds),
  ]);
  if (group.error || clients.error) {
    console.error("[carmen] forward context unreadable", {
      group: group.error,
      clients: clients.error,
    });
  }
  return {
    groupName: group.data?.group_name || "קבוצת לקוח",
    clientNames:
      (clients.data ?? []).map((client) => client.name).join(" / ") || "",
  };
}
