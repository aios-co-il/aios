import { unknownField } from "../_shared/json-fields.ts";

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

/** A header value from a Gmail message payload, or "". */
export function parseEmailHeader(payload: unknown, headerName: string): string {
  const headers = unknownField(payload, "headers");
  if (!Array.isArray(headers)) return "";
  const wanted = headerName.toLowerCase();
  const header = headers.find((h) => {
    const name = unknownField(h, "name");
    return typeof name === "string" && name.toLowerCase() === wanted;
  });
  const value = unknownField(header, "value");
  return typeof value === "string" ? value : "";
}

/** Attachments found recursively in Gmail MIME parts. */
export function findAttachments(
  parts: unknown,
  result: GmailAttachment[] = [],
): GmailAttachment[] {
  if (!Array.isArray(parts)) return result;
  for (const part of parts) {
    const filename = unknownField(part, "filename");
    const body = unknownField(part, "body");
    const attachmentId = unknownField(body, "attachmentId");
    if (typeof filename === "string" && filename && attachmentId) {
      const mimeType = unknownField(part, "mimeType");
      const size = unknownField(body, "size");
      result.push({
        filename,
        mimeType: typeof mimeType === "string" ? mimeType : "",
        attachmentId: String(attachmentId),
        size: typeof size === "number" ? size : 0,
      });
    }
    findAttachments(unknownField(part, "parts"), result);
  }
  return result;
}
