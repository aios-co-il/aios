import { isJsonObject, type JsonObject } from "@/lib/typing-b26";

export interface WaQuotedMessage {
  stanzaId?: string;
  participant?: string;
  typeMessage?: string;
  textMessage?: string;
  caption?: string;
  downloadUrl?: string;
  extendedTextMessageData?: { text?: string };
}

export interface WaMessageData {
  typeMessage?: string;
  quotedMessage?: WaQuotedMessage;
  extendedTextMessageData?: { text?: string; quotedMessage?: WaQuotedMessage };
  fileMessageData?: { downloadUrl?: string; fileName?: string };
}

export interface ChatProviderData {
  idMessage?: string;
  senderData?: { sender?: string };
  messageData?: WaMessageData;
  fetchedMessageContent?: { extendedTextMessage?: { text?: string } };
  delivery_status?: string;
  delivery_error?: {
    title?: string;
    message?: string;
    error_data?: { details?: string };
  };
}

function str(obj: JsonObject | undefined, key: string): string | undefined {
  const value = obj?.[key];
  return typeof value === "string" ? value : undefined;
}

function obj(
  parent: JsonObject | undefined,
  key: string,
): JsonObject | undefined {
  const value = parent?.[key];
  return isJsonObject(value) ? value : undefined;
}

function textData(value: JsonObject | undefined) {
  return value ? { text: str(value, "text") } : undefined;
}

function quoted(value: JsonObject | undefined): WaQuotedMessage | undefined {
  if (!value) return undefined;
  return {
    stanzaId: str(value, "stanzaId"),
    participant: str(value, "participant"),
    typeMessage: str(value, "typeMessage"),
    textMessage: str(value, "textMessage"),
    caption: str(value, "caption"),
    downloadUrl: str(value, "downloadUrl"),
    extendedTextMessageData: textData(obj(value, "extendedTextMessageData")),
  };
}

function messageData(value: JsonObject | undefined): WaMessageData | undefined {
  if (!value) return undefined;
  const extended = obj(value, "extendedTextMessageData");
  const file = obj(value, "fileMessageData");
  return {
    typeMessage: str(value, "typeMessage"),
    quotedMessage: quoted(obj(value, "quotedMessage")),
    extendedTextMessageData: extended
      ? {
          text: str(extended, "text"),
          quotedMessage: quoted(obj(extended, "quotedMessage")),
        }
      : undefined,
    fileMessageData: file
      ? {
          downloadUrl: str(file, "downloadUrl"),
          fileName: str(file, "fileName"),
        }
      : undefined,
  };
}

export function parseChatProviderData(
  value: unknown,
): ChatProviderData | undefined {
  if (!isJsonObject(value)) return undefined;
  const sender = obj(value, "senderData");
  const fetched = obj(value, "fetchedMessageContent");
  const deliveryError = obj(value, "delivery_error");
  const errorData = obj(deliveryError, "error_data");
  return {
    idMessage: str(value, "idMessage"),
    senderData: sender ? { sender: str(sender, "sender") } : undefined,
    messageData: messageData(obj(value, "messageData")),
    fetchedMessageContent: fetched
      ? {
          extendedTextMessage: textData(obj(fetched, "extendedTextMessage")),
        }
      : undefined,
    delivery_status: str(value, "delivery_status"),
    delivery_error: deliveryError
      ? {
          title: str(deliveryError, "title"),
          message: str(deliveryError, "message"),
          error_data: errorData
            ? { details: str(errorData, "details") }
            : undefined,
        }
      : undefined,
  };
}
