// What proves a Carmen send to a client-side chat was asked for (AIO-349):
// the tenant's own staff wrote in that same chat moments ago and Carmen is
// answering them. send_ref carries that staff member's phone; the guard
// checks the stored message and the phone itself, so a send_ref alone
// proves nothing. Every read is keyed by the sending tenant.
import { phoneMatchKey } from "../telephony/phone.ts";
import { resolveRecipient } from "./recipient.ts";
import type { ClientSendDb } from "./rule-check.ts";
import type { ClientSendRequest } from "./types.ts";

/** How long after a staff message Carmen may still answer it. */
export const CARMEN_STAFF_REQUEST_WINDOW_MS = 15 * 60 * 1000;

/** The most recent messages of the chat the proof looks through. */
const RECENT_MESSAGES_LIMIT = 100;

/**
 * Whether staff of the sending tenant, named by phone in send_ref, wrote in
 * the send's own chat within the window. A group send needs its group row;
 * a one-to-one send goes back to that same phone.
 */
export async function carmenStaffAskedInChat(
  db: ClientSendDb,
  request: ClientSendRequest,
  now: Date = new Date(),
): Promise<boolean> {
  const staffKey = phoneMatchKey(request.sendRef);
  if (!staffKey || !request.sendRef) {
    return false;
  }
  if (!request.groupId && phoneMatchKey(request.address) !== staffKey) {
    return false;
  }
  const wroteHere = await staffWroteInChat(db, request, staffKey, now);
  return wroteHere && (await isSenderStaff(db, request, request.sendRef));
}

/** A stored, non-system message of this chat from that phone, in the window. */
async function staffWroteInChat(
  db: ClientSendDb,
  request: ClientSendRequest,
  staffKey: string,
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - CARMEN_STAFF_REQUEST_WINDOW_MS);
  let query = db
    .from("chat_messages")
    .select("sender_phone, send_kind")
    .eq("tenant_id", request.tenantId)
    .gte("created_at", since.toISOString());
  query = request.groupId
    ? query.eq("group_id", request.groupId)
    : query.is("group_id", null);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(RECENT_MESSAGES_LIMIT);
  if (error) {
    throw error;
  }
  return (data ?? []).some(
    (row) =>
      row.send_kind === null && phoneMatchKey(row.sender_phone) === staffKey,
  );
}

/** The phone is staff of the sending tenant, by the one address classifier. */
async function isSenderStaff(
  db: ClientSendDb,
  request: ClientSendRequest,
  phone: string,
): Promise<boolean> {
  const person = await resolveRecipient(db, {
    tenantId: request.tenantId,
    channel: "whatsapp",
    address: phone,
    groupId: null,
  });
  return person !== null && (person.kind === "staff" || person.senderStaff);
}
