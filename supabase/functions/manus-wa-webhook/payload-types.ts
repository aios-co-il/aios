import type { Json } from "../_shared/database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

export function pickJsonObject(
  ...candidates: (Json | undefined)[]
): JsonObject | null {
  for (const candidate of candidates) {
    if (
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      return candidate;
    }
  }
  return null;
}

// Provider variants keep their original values until the consuming routing/media
// code applies its existing coercion. Only the fields this webhook reads belong
// to the contract; the original object is still retained for raw_provider_data.
export interface ManusPayload {
  event?: Json;
  from?: Json;
  to?: Json;
  body?: Json;
  fromMe?: Json;
  direction?: Json;
  id?: Json;
  messageId?: Json;
  senderName?: Json;
  author?: Json;
  hasMedia?: Json;
  chatId?: Json;
  senderLid?: Json;
  senderPn?: Json;
  participantPn?: Json;
  senderPhone?: Json;
  senderNumber?: Json;
  quotedMsgId?: Json;
  quotedMessageId?: Json;
  quotedMsg?: Json;
  groupId?: Json;
  fromName?: Json;
  authorName?: Json;
  participant?: Json;
  groupName?: Json;
  chatName?: Json;
  subject?: Json;
  ack?: Json;
  type?: Json;
  messageType?: Json;
  mediaType?: Json;
  mimeType?: Json;
  mime_type?: Json;
  media?: Json;
  file?: Json;
  attachment?: Json;
  audio?: Json;
}
export interface ManusMessageContainer {
  audioMessage?: Json;
  message?: Json;
  type?: Json;
  contextInfo?: Json;
  participant?: Json;
  author?: Json;
  conversation?: Json;
  text?: Json;
  body?: Json;
  imageMessage?: Json;
  videoMessage?: Json;
  documentMessage?: Json;
}
