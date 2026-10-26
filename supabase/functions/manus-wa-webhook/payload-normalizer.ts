import {
  type JsonObject,
  type ManusMessageContainer,
  type ManusPayload,
  pickJsonObject as pickObj,
} from "./payload-types.ts";

export interface NormalizedManusPayload {
  inner: JsonObject;
  key: JsonObject;
  msgContainer: ManusMessageContainer;
  payload: ManusPayload;
}

// Manus WA Gateway payloads may be flat, or wrapped in
// { data }, { message }, { payload }, { event, data: {...} }, etc.
export function normalizeManusPayload(
  outer: JsonObject,
): NormalizedManusPayload {
  const inner =
    pickObj(outer.data, outer.message, outer.payload, outer.body) || {};
  const key = pickObj(inner.key, outer.key) || {};
  const msgContainer = pickObj(inner.message, outer.message) || {};

  // Only treat as 'message' when there is actual message content (from/body/key).
  // Otherwise keep the raw event (or 'ping' / 'unknown') so we don't falsely trigger Carmen.
  const rawEventField =
    outer.event ??
    inner.event ??
    outer.type ??
    inner.type ??
    outer.messageType ??
    inner.messageType ??
    null;
  const looksLikeMessage = !!(
    outer.from ||
    inner.from ||
    inner.chatId ||
    outer.chatId ||
    outer.body ||
    inner.body ||
    inner.text ||
    outer.text ||
    pickObj(inner.message, outer.message)
  );
  const normalizedEvent =
    (rawEventField === "chat" ||
      rawEventField === "text" ||
      rawEventField === "message") &&
    looksLikeMessage
      ? "message"
      : (rawEventField ?? (looksLikeMessage ? "message" : "ping"));
  const fromField =
    outer.from ??
    inner.from ??
    inner.chatId ??
    outer.chatId ??
    key.remoteJid ??
    inner.remoteJid ??
    "";
  const toField =
    outer.to ?? inner.to ?? inner.recipientId ?? outer.recipientId ?? "";
  const bodyField =
    outer.body ??
    inner.body ??
    inner.text ??
    outer.text ??
    inner.content ??
    outer.content ??
    msgContainer.conversation ??
    msgContainer.text ??
    msgContainer.body ??
    "";
  const fromMeField =
    outer.fromMe ??
    inner.fromMe ??
    key.fromMe ??
    (outer.direction === "outgoing" || inner.direction === "outgoing");
  const directionField = outer.direction ?? inner.direction;
  const idField =
    outer.id ?? inner.id ?? outer.messageId ?? inner.messageId ?? key.id;
  const senderNameField =
    outer.senderName ??
    inner.senderName ??
    outer.fromName ??
    inner.fromName ??
    outer.pushName ??
    inner.pushName ??
    null;
  const authorField =
    outer.author ??
    inner.author ??
    outer.participant ??
    inner.participant ??
    key.participant ??
    null;
  const hasMediaField =
    outer.hasMedia ??
    inner.hasMedia ??
    !!(
      msgContainer.imageMessage ||
      msgContainer.audioMessage ||
      msgContainer.videoMessage ||
      msgContainer.documentMessage
    );

  // Build a unified payload object that the rest of the code uses
  const payload: ManusPayload = {
    ...outer,
    ...inner,
    event: normalizedEvent,
    from: fromField,
    to: toField,
    body:
      typeof bodyField === "string"
        ? bodyField
        : (pickObj(bodyField)?.text ?? ""),
    fromMe: fromMeField,
    direction: directionField,
    id: idField,
    messageId: outer.messageId ?? inner.messageId ?? idField,
    senderName: senderNameField,
    author: authorField,
    hasMedia: hasMediaField,
  };

  return { inner, key, msgContainer, payload };
}
