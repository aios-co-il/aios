import { z } from "npm:zod@3.25.76";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Gmail message and part ids are URL-safe tokens; anything else never reaches the URL. */
export const gmailIdSchema = z.string().regex(/^[A-Za-z0-9_.-]+$/);

type MessagePart = {
  partId?: string;
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string };
  parts?: Array<MessagePart>;
};

const messagePartSchema: z.ZodType<MessagePart> = z.lazy(() =>
  z.object({
    partId: z.string().optional(),
    filename: z.string().optional(),
    mimeType: z.string().optional(),
    body: z.object({ attachmentId: z.string().optional() }).optional(),
    parts: z.array(messagePartSchema).optional(),
  }),
);

const messageSchema = z.object({ payload: messagePartSchema.optional() });

const attachmentBodySchema = z.object({ data: z.string().min(1) });

/** A PDF or picture attached to a message. partId stays the same between reads; attachmentId does not. */
export type InvoiceAttachment = {
  partId: string;
  filename: string;
  mimeType: string;
  attachmentId: string;
};

const INVOICE_FILE_NAME = /\.(pdf|png|jpg|jpeg|gif|webp|tiff|bmp)$/i;

/** The message's PDF and picture attachments, in MIME order. */
export function invoiceAttachments(payload: unknown): Array<InvoiceAttachment> {
  const root = messagePartSchema.safeParse(payload);

  return root.success ? partAttachments(root.data) : [];
}

function partAttachments(part: MessagePart): Array<InvoiceAttachment> {
  const nested = (part.parts ?? []).flatMap(partAttachments);
  const { partId, filename, body } = part;
  const mimeType = part.mimeType ?? "";
  const isInvoiceFile =
    INVOICE_FILE_NAME.test(filename ?? "") ||
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf";
  if (!partId || !filename || !body?.attachmentId || !isInvoiceFile) {
    return nested;
  }

  return [
    { partId, filename, mimeType, attachmentId: body.attachmentId },
    ...nested,
  ];
}

/** The attachment of a message with this part id, read fresh from Gmail. Null when the message has none. */
export async function findInvoiceAttachment(
  accessToken: string,
  messageId: string,
  partId: string,
): Promise<InvoiceAttachment | null> {
  const response = await fetch(
    `${GMAIL_API}/messages/${messageId}?format=full`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    throw new Error(`Gmail message read failed: ${response.status}`);
  }
  const message = messageSchema.parse(await response.json());

  return (
    invoiceAttachments(message.payload).find(
      (attachment) => attachment.partId === partId,
    ) ?? null
  );
}

/** The attachment's bytes. */
export async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Uint8Array> {
  const response = await fetch(
    `${GMAIL_API}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Gmail attachment download failed: ${response.status}`);
  }
  const body = attachmentBodySchema.parse(await response.json());

  return Uint8Array.from(atob(toStandardBase64(body.data)), (character) =>
    character.charCodeAt(0),
  );
}

/** Gmail sends URL-safe base64; atob and data URLs need the standard alphabet. */
export function toStandardBase64(urlSafe: string): string {
  return urlSafe.replace(/-/g, "+").replace(/_/g, "/");
}
