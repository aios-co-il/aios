/** Email attachments stored on message_templates / broadcasts (`attachments`
 * jsonb). Files live in the broadcast-media bucket and are sent to Resend by
 * URL. */

// A type alias (not an interface) so it is assignable to the generated `Json`
// type when written to the database.
export type EmailAttachment = {
  name: string;
  path?: string;
  url: string;
  size?: number;
  content_type?: string;
};

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Parse the stored jsonb into attachments, dropping malformed items. */
export function toEmailAttachments(value: unknown): EmailAttachment[] {
  if (!Array.isArray(value)) return [];
  const out: EmailAttachment[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const { name, url, path, size, content_type } = item;
    if (typeof name !== "string" || typeof url !== "string") continue;
    out.push({
      name,
      url,
      ...(typeof path === "string" ? { path } : {}),
      ...(typeof size === "number" ? { size } : {}),
      ...(typeof content_type === "string" ? { content_type } : {}),
    });
  }
  return out;
}

/** Public URL prefix of the bucket attachments must come from. */
export function attachmentUrlPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/broadcast-media/`;
}

/** Stored attachments → Resend `{filename, path}` items. Drops anything
 * malformed or not served from our broadcast-media bucket, so a crafted row
 * cannot make Resend fetch an arbitrary URL. */
export function emailAttachmentsForResend(
  list: unknown,
  allowedUrlPrefix: string,
): { filename: string; path: string }[] {
  return toEmailAttachments(list)
    .filter((a) => a.name.trim() && a.url.startsWith(allowedUrlPrefix))
    .map((a) => ({ filename: a.name.trim().slice(0, 200), path: a.url }));
}
