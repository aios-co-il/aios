import { z } from "npm:zod@3.25.76";

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

/** A value that is not an object reads as one with no fields. */
const lenient = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).catch(() => z.object(shape).parse({}));

const headerSchema = lenient({ name: z.unknown(), value: z.unknown() });

const payloadSchema = lenient({
  headers: z.array(z.unknown()).optional().catch(undefined),
});

const partSchema = lenient({
  filename: z.unknown(),
  mimeType: z.string().catch(""),
  body: lenient({
    attachmentId: z.unknown(),
    size: z.number().catch(0),
  }),
  parts: z.unknown(),
});

/** A header value from a Gmail message payload, or "". */
export function parseEmailHeader(payload: unknown, headerName: string): string {
  const { headers } = payloadSchema.parse(payload);
  if (!headers) return "";
  const wanted = headerName.toLowerCase();
  const header = headers
    .map((h) => headerSchema.parse(h))
    .find((h) => {
      const name = z.string().safeParse(h.name);
      return name.success && name.data.toLowerCase() === wanted;
    });
  return z.string().catch("").parse(header?.value);
}

/** Attachments found recursively in Gmail MIME parts. */
export function findAttachments(
  parts: unknown,
  result: GmailAttachment[] = [],
): GmailAttachment[] {
  const list = z.array(z.unknown()).safeParse(parts);
  if (!list.success) return result;
  for (const raw of list.data) {
    const part = partSchema.parse(raw);
    const filename = z.string().min(1).safeParse(part.filename);
    if (filename.success && part.body.attachmentId) {
      result.push({
        filename: filename.data,
        mimeType: part.mimeType,
        attachmentId: String(part.body.attachmentId),
        size: part.body.size,
      });
    }
    findAttachments(part.parts, result);
  }
  return result;
}
