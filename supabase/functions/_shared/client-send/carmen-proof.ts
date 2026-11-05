// What proves a Carmen send to a client-side chat was asked for (AIO-349):
// someone Carmen may answer there wrote in that same chat moments ago and
// Carmen is answering them. That is the tenant's own staff, or, in a group
// whose reply level is "client", that group's own client. send_ref carries
// the author's phone; the guard checks the stored message, the phone and the
// group's level, so a send_ref alone proves nothing. Every read is keyed by
// the sending tenant.
import { loadGroupReplyLevel } from "../carmen/load-group-reply-level.ts";
import { phoneMatchKey } from "../telephony/phone.ts";
import { resolveRecipient } from "./recipient.ts";
import type { ClientSendDb } from "./rule-check.ts";
import type { ClientSendRequest, SendRecipient } from "./types.ts";

/** How long after the author's message Carmen may still answer it. */
export const CARMEN_REQUEST_WINDOW_MS = 15 * 60 * 1000;

/** The most recent messages of the chat the proof looks through. */
const RECENT_MESSAGES_LIMIT = 100;

/**
 * Whether the author named by phone in send_ref may get Carmen's answer here
 * and wrote in the send's own chat within the window. A group send needs its
 * group row and follows the group's reply level (staff only by default,
 * nobody at automations_only); a one-to-one send goes back to that same staff
 * phone.
 */
export async function carmenAnswersRequestInChat(
  db: ClientSendDb,
  request: ClientSendRequest,
  recipient: SendRecipient,
  now: Date = new Date(),
): Promise<boolean> {
  const authorKey = phoneMatchKey(request.sendRef);
  if (!authorKey || !request.sendRef) {
    return false;
  }
  if (!request.groupId && phoneMatchKey(request.address) !== authorKey) {
    return false;
  }
  if (!(await authorWroteInChat(db, request, authorKey, now))) {
    return false;
  }
  const level = request.groupId
    ? await loadGroupReplyLevel(db, {
        tenantId: request.tenantId,
        groupId: request.groupId,
      })
    : null;
  if (level === "automations_only") {
    return false;
  }
  const author = await resolveRecipient(db, {
    tenantId: request.tenantId,
    channel: "whatsapp",
    address: request.sendRef,
    groupId: null,
  });
  if (!author) {
    return false;
  }
  if (author.kind === "staff" || author.senderStaff) {
    return true;
  }
  return level === "client" && isClientOf(author, recipient);
}

/** The author is a client, or a client's contact, of the group's own client. */
function isClientOf(author: SendRecipient, group: SendRecipient): boolean {
  return (
    (author.kind === "client" || author.kind === "client_contact") &&
    author.clientIds.some((id) => group.clientIds.includes(id))
  );
}

/** A stored, non-system message of this chat from that phone, in the window. */
async function authorWroteInChat(
  db: ClientSendDb,
  request: ClientSendRequest,
  authorKey: string,
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - CARMEN_REQUEST_WINDOW_MS);
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
      row.send_kind === null && phoneMatchKey(row.sender_phone) === authorKey,
  );
}
