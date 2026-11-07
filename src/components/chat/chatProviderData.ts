import { z } from "zod";

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

const str = z.string().optional().catch(undefined);

/** A nested object; absent, null or any other value reads as undefined. */
const nested = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).optional().catch(undefined);

const textData = nested({ text: str });

const quotedMessage = nested({
  stanzaId: str,
  participant: str,
  typeMessage: str,
  textMessage: str,
  caption: str,
  downloadUrl: str,
  extendedTextMessageData: textData,
});

const chatProviderDataSchema = nested({
  idMessage: str,
  senderData: nested({ sender: str }),
  messageData: nested({
    typeMessage: str,
    quotedMessage,
    extendedTextMessageData: nested({ text: str, quotedMessage }),
    fileMessageData: nested({ downloadUrl: str, fileName: str }),
  }),
  fetchedMessageContent: nested({ extendedTextMessage: textData }),
  delivery_status: str,
  delivery_error: nested({
    title: str,
    message: str,
    error_data: nested({ details: str }),
  }),
});

export function parseChatProviderData(
  value: unknown,
): ChatProviderData | undefined {
  return chatProviderDataSchema.parse(value);
}
