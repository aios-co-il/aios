/**
 * Each linked group's window: its messages after the group's watermark (and
 * never before the collector's floor or the lookback), every one labelled
 * client, staff or unknown. Speakers are never identified by phone: a staff
 * message is one sent from a monitored line, by a person in AIOS, or from a
 * staff phone; a sender with no known phone (an @lid without a mapping) is
 * unknown, so a staff member writing from one is never quoted as the client;
 * any other sender is the client side. A staff message names its author
 * (the AIOS sender, else the login its phone names) only when that person
 * is a login of the client's own tenant.
 */
import type { GroupHistory, GroupMessage } from "./messages.ts";
import type { StaffKeys } from "./staff-keys.ts";
import { isSubstantive } from "./substantive.ts";
import type { GroupMark, GroupWatermark } from "./watermark.ts";

export type Speaker = "client" | "staff" | "unknown";

export type WindowMessage = GroupMessage & {
  speaker: Speaker;
  substantive: boolean;
  /** The login of the client's tenant who wrote a staff message, when known. */
  staffUserId: string | null;
};

export type GroupWindow = {
  clientId: string;
  clientName: string;
  groupId: string;
  /** The WhatsApp group chat, the same for every tenant that stores it. */
  groupChatId: string;
  groupName: string;
  messages: WindowMessage[];
  /** The last message of the window: the watermark it advances to. */
  last: GroupMark;
};

/** The windows with at least one new message, oldest message first. */
export function groupWindows(
  histories: GroupHistory[],
  watermark: GroupWatermark,
  from: Date,
  staffKeys: StaffKeys,
): GroupWindow[] {
  return histories.flatMap((history) => {
    const mark = watermark.groups[history.group_id] ?? null;
    const messages = history.messages
      .filter((message) => isAfter(message, mark, from))
      .map((message) => label(message, staffKeys, history.client_tenant_id));
    const last = messages.at(-1);
    return last
      ? [
          {
            clientId: history.client_id,
            clientName: history.client_name,
            groupId: history.group_id,
            groupChatId: history.group_chat_id,
            groupName: history.group_name,
            messages,
            last: { at: last.at, id: last.id },
          },
        ]
      : [];
  });
}

/** The substantive messages of a window. */
export function substantive(window: GroupWindow): WindowMessage[] {
  return window.messages.filter((message) => message.substantive);
}

/** After the group's mark (time, then id) and after `from`. */
function isAfter(
  message: GroupMessage,
  mark: GroupMark | null,
  from: Date,
): boolean {
  const at = Date.parse(message.at);
  if (at <= from.getTime()) {
    return false;
  }
  if (!mark) {
    return true;
  }
  const markAt = Date.parse(mark.at);
  return at > markAt || (at === markAt && message.id > mark.id);
}

/** The message with its speaker, its staff author when known and whether it counts. */
function label(
  message: GroupMessage,
  staffKeys: StaffKeys,
  clientTenantId: string,
): WindowMessage {
  const speaker = speakerOf(message, staffKeys);
  return {
    ...message,
    speaker,
    substantive: isSubstantive(message.text),
    staffUserId:
      speaker === "staff" ? authorOf(message, staffKeys, clientTenantId) : null,
  };
}

/** The AIOS sender, else the login the phone names, if a login of the client's tenant. */
function authorOf(
  message: GroupMessage,
  staffKeys: StaffKeys,
  clientTenantId: string,
): string | null {
  const author =
    message.sentBy ?? (message.key ? staffKeys.keys.get(message.key) : null);
  return author && staffKeys.tenantsOf.get(author)?.has(clientTenantId)
    ? author
    : null;
}

/** Staff by line, person or phone; unknown without a phone; else the client. */
function speakerOf(message: GroupMessage, staffKeys: StaffKeys): Speaker {
  if (message.out || (message.key && staffKeys.keys.has(message.key))) {
    return "staff";
  }
  return message.lidUnmapped || !message.key ? "unknown" : "client";
}
