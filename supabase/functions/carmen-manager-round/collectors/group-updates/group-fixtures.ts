/** Builders for this collector's tests: messages, groups, windows. */
import type { CardEntry } from "./card-entries.ts";
import type { GroupHistory, GroupMessage } from "./messages.ts";
import type { GroupWindow, WindowMessage } from "./windows.ts";

export const TENANT = "11111111-1111-4111-8111-111111111111";
export const CLIENT = "22222222-2222-4222-8222-222222222221";
export const GROUP = "99999999-9999-4999-8999-999999999991";
export const GROUP_CHAT = "120363000000000001@g.us";
export const STAFF_KEY = "502222222";
export const CLIENT_KEY = "521111111";

/** A group message at `at` (ISO), from the client unless `fields` say otherwise. */
export function message(
  id: string,
  at: string,
  text: string,
  fields: Partial<GroupMessage> = {},
): GroupMessage {
  return {
    id,
    providerId: `wa-${id}`,
    at,
    out: false,
    sentBy: null,
    sendKind: null,
    typedOnPhone: false,
    lineUserId: null,
    key: CLIENT_KEY,
    lidUnmapped: false,
    text,
    ...fields,
  };
}

/** One linked group with its messages. */
export function history(
  messages: GroupMessage[],
  fields: Partial<GroupHistory> = {},
): GroupHistory {
  return {
    client_id: CLIENT,
    client_name: "פיצה רומא",
    client_tenant_id: TENANT,
    group_id: GROUP,
    group_chat_id: GROUP_CHAT,
    group_name: "פיצה רומא – שיווק",
    messages,
    ...fields,
  };
}

/** A window of labelled messages (client speaker, substantive unless said). */
export function window(
  messages: Partial<WindowMessage>[],
  fields: Partial<GroupWindow> = {},
): GroupWindow {
  const full = messages.map((m, i): WindowMessage => ({
    id: `m${i + 1}`,
    providerId: `wa-m${i + 1}`,
    at: `2026-11-01T1${i}:00:00Z`,
    out: false,
    sentBy: null,
    sendKind: null,
    typedOnPhone: false,
    lineUserId: null,
    key: CLIENT_KEY,
    lidUnmapped: false,
    text: "",
    speaker: "client",
    substantive: true,
    staffUserId: null,
    typedByPerson: m.speaker !== "unknown",
    ...m,
  }));
  const last = full.at(-1);
  return {
    clientId: CLIENT,
    clientName: "פיצה רומא",
    groupId: GROUP,
    groupChatId: GROUP_CHAT,
    groupName: "פיצה רומא – שיווק",
    messages: full,
    last: { at: last?.at ?? "", id: last?.id ?? "" },
    ...fields,
  };
}

/** A card entry of the client. */
export function entry(
  created_at: string,
  content: string,
  source = "human",
  source_ref: string | null = null,
): CardEntry {
  return { client_id: CLIENT, created_at, source, source_ref, content };
}
