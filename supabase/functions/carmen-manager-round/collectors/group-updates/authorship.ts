/**
 * Who typed a group message, for a reported call or meeting (contact.ts):
 * only words a person typed may report one. The client's messages count; a
 * staff message counts only when a staff member of the client's own tenant
 * typed it: sent from AIOS's chat (send_kind chat) by a login of that
 * tenant, or written from a staff phone of that tenant. AIOS's own sends
 * (automation, broadcast, carmen, staff_alert, a report or summary template,
 * or no kind) never count, even when they name a sender.
 */
import type { SendKind } from "../../../_shared/client-card/send-kind.ts";
import type { GroupMessage } from "./messages.ts";
import type { StaffKeys } from "./staff-keys.ts";
import type { Speaker } from "./windows.ts";

/** The only send_kind whose words a person typed (the AIOS chat composer). */
const TYPED_SEND_KIND: SendKind = "chat";

export type Authorship = {
  /** The client typed it, or a staff member of the client's own tenant did. */
  typedByPerson: boolean;
  /** That staff member's login, when known. */
  staffUserId: string | null;
};

/** Whether a person typed the message, and which staff login did. */
export function authorshipOf(
  message: GroupMessage,
  speaker: Speaker,
  staffKeys: StaffKeys,
  clientTenantId: string,
): Authorship {
  if (speaker !== "staff") {
    return { typedByPerson: speaker === "client", staffUserId: null };
  }
  const login = (userId: string | null | undefined) =>
    userId && staffKeys.tenantsOf.get(userId)?.has(clientTenantId)
      ? userId
      : null;
  if (message.out) {
    const sender =
      message.sendKind === TYPED_SEND_KIND ? login(message.sentBy) : null;
    return { typedByPerson: !!sender, staffUserId: sender };
  }
  const key = message.key;
  const ownStaff =
    !!key && !!staffKeys.keyTenants.get(key)?.has(clientTenantId);
  return {
    typedByPerson: ownStaff,
    staffUserId: ownStaff && key ? login(staffKeys.keys.get(key)) : null,
  };
}
