import type { Tables } from "@/integrations/supabase/types";

/** A file attached to a client card entry, as the feed reads it. */
export type ClientUpdateAttachment = Pick<
  Tables<"client_update_attachments">,
  "id" | "file_name" | "mime_type" | "size_bytes" | "storage_path"
>;

/** Columns the feed embeds for each entry's files. */
export const CLIENT_UPDATE_ATTACHMENT_COLUMNS =
  "id, file_name, mime_type, size_bytes, storage_path";

/**
 * The types the bucket accepts, with the extension the stored file gets. It
 * mirrors the bucket's allowed_mime_types in
 * 20261126190000_client_update_attachments.sql (a test compares them); the
 * bucket and the row trigger enforce it, this copy only explains a refusal
 * in Hebrew before anything is written.
 */
export const ATTACHMENT_EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
};

/** The bucket's file_size_limit (20MB). */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** The row trigger's per-entry cap. */
export const MAX_ATTACHMENTS_PER_UPDATE = 10;

const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(ATTACHMENT_EXTENSION_BY_TYPE).map(([type, ext]) => [
      ext,
      type,
    ]),
  ),
  jpeg: "image/jpeg",
};

/** The file picker's accept list: every accepted type and extension. */
export const ATTACHMENT_ACCEPT = [
  ...Object.keys(ATTACHMENT_EXTENSION_BY_TYPE),
  ...Object.keys(TYPE_BY_EXTENSION).map((ext) => `.${ext}`),
].join(",");

/**
 * The accepted type of a picked file: the browser's type when the bucket
 * accepts it, else the type its extension names (some browsers leave .heic
 * or .csv untyped); null when neither is accepted.
 */
export function resolveAttachmentType(file: File): string | null {
  if (file.type) {
    return ATTACHMENT_EXTENSION_BY_TYPE[file.type] ? file.type : null;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXTENSION[ext] ?? null;
}

/** True for a type the feed shows as a picture. */
export function isPictureType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Splits picked files into the ones that may be attached and Hebrew reasons
 * for the rest: an unsupported type, an empty or too-large file, or more than
 * the per-entry cap counting the `alreadyPicked` files.
 */
export function validateAttachmentFiles(
  files: Array<File>,
  alreadyPicked: number,
): { accepted: Array<File>; errors: Array<string> } {
  const accepted: Array<File> = [];
  const errors: Array<string> = [];
  for (const file of files) {
    const reason = refusalReason(file);
    if (reason) {
      errors.push(reason);
      continue;
    }
    if (alreadyPicked + accepted.length >= MAX_ATTACHMENTS_PER_UPDATE) {
      errors.push(
        `אפשר לצרף עד ${MAX_ATTACHMENTS_PER_UPDATE} קבצים לעדכון אחד`,
      );
      break;
    }
    accepted.push(file);
  }
  return { accepted, errors };
}

/** Shows a file size in KB or MB. */
export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The Hebrew reason a file cannot be attached, or null. */
function refusalReason(file: File): string | null {
  if (!resolveAttachmentType(file)) {
    return `לא ניתן לצרף את "${file.name}": אפשר לצרף תמונות, PDF, קובצי Word, Excel ו-PowerPoint, טקסט ו-CSV`;
  }
  if (file.size === 0) {
    return `הקובץ "${file.name}" ריק`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `הקובץ "${file.name}" גדול מדי: עד 20MB לקובץ`;
  }
  return null;
}
