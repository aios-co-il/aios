/**
 * Each linked group's window: its messages after the group's watermark (and
 * never before the collector's floor or the lookback), every one labelled
 * client or staff. Speakers are never identified by phone: a staff message is
 * one sent from the monitored line, by a person in AIOS, or from a staff
 * phone; any other sender is the client side.
 */
import type { GroupHistory, GroupMessage } from "./messages.ts";
import { isSubstantive } from "./substantive.ts";
import type { GroupMark, GroupWatermark } from "./watermark.ts";

export type Speaker = "client" | "staff";

export type WindowMessage = GroupMessage & {
  speaker: Speaker;
  substantive: boolean;
};

export type GroupWindow = {
  clientId: string;
  clientName: string;
  groupId: string;
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
  staffKeys: Set<string>,
): GroupWindow[] {
  return histories.flatMap((history) => {
    const mark = watermark.groups[history.group_id] ?? null;
    const messages = history.messages
      .filter((message) => isAfter(message, mark, from))
      .map((message) => label(message, staffKeys));
    const last = messages.at(-1);
    return last
      ? [
          {
            clientId: history.client_id,
            clientName: history.client_name,
            groupId: history.group_id,
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

/** The message with its speaker and whether it counts. */
function label(message: GroupMessage, staffKeys: Set<string>): WindowMessage {
  const staff = message.out || (!!message.key && staffKeys.has(message.key));
  return {
    ...message,
    speaker: staff ? "staff" : "client",
    substantive: isSubstantive(message.text),
  };
}
