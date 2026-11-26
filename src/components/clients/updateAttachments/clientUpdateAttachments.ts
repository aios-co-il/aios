import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  ATTACHMENT_EXTENSION_BY_TYPE,
  resolveAttachmentType,
  type ClientUpdateAttachment,
} from "./attachmentRules";

/** The entry the files are attached to: its path is {tenant}/{client}/{update}/. */
export type AttachmentOwner = Pick<
  Tables<"client_updates">,
  "id" | "tenant_id" | "client_id"
>;

/** The private bucket; files are read only through signed links. */
const BUCKET = "client-update-attachments";

/** How long a picture's preview link lives. */
const PREVIEW_URL_SECONDS = 10 * 60;

/** How long a link opened from a click lives. */
const OPEN_URL_SECONDS = 60;

/**
 * Attaches files to a just-written entry: each gets a row first (which
 * authorises exactly one upload path), then its upload; a failed upload
 * removes its row. Returns the names of the files that were not attached.
 */
export async function uploadClientUpdateAttachments(
  owner: AttachmentOwner,
  files: Array<File>,
): Promise<Array<string>> {
  const failed: Array<string> = [];
  for (const file of files) {
    const attached = await attachOneFile(owner, file);
    if (!attached) {
      failed.push(file.name);
    }
  }
  return failed;
}

/**
 * Removes an entry's files from storage before the entry is deleted (the
 * storage policy needs the attachment rows, which the delete cascades away).
 */
export async function removeClientUpdateAttachmentFiles(
  paths: Array<string>,
): Promise<void> {
  if (!paths.length) {
    return;
  }
  const { data, error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    throw error;
  }
  if ((data?.length ?? 0) < paths.length) {
    console.warn(
      `client update attachments: removed ${data?.length ?? 0} of ${paths.length} files`,
      paths,
    );
  }
}

/** Short-lived preview links for pictures, keyed by storage path. */
export async function signAttachmentPreviews(
  paths: Array<string>,
): Promise<Record<string, string>> {
  if (!paths.length) {
    return {};
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, PREVIEW_URL_SECONDS);
  if (error) {
    throw error;
  }
  return Object.fromEntries(
    (data ?? []).flatMap((item) =>
      item.path && item.signedUrl ? [[item.path, item.signedUrl]] : [],
    ),
  );
}

/**
 * A one-minute link to a document: a PDF opens in the browser, any other file
 * downloads under its original name.
 */
export async function signAttachmentOpenUrl(
  attachment: ClientUpdateAttachment,
): Promise<string> {
  const options =
    attachment.mime_type === "application/pdf"
      ? undefined
      : { download: attachment.file_name };
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storage_path, OPEN_URL_SECONDS, options);
  if (error || !data?.signedUrl) {
    throw error ?? new Error("client update attachment: no signed URL");
  }
  return data.signedUrl;
}

/** Registers and uploads one file; false (after logging) when it failed. */
async function attachOneFile(
  owner: AttachmentOwner,
  file: File,
): Promise<boolean> {
  const mimeType = resolveAttachmentType(file);
  if (!mimeType) {
    console.error("client update attachment: unsupported type", file.name);
    return false;
  }
  const id = crypto.randomUUID();
  const storagePath = `${owner.tenant_id}/${owner.client_id}/${owner.id}/${id}.${ATTACHMENT_EXTENSION_BY_TYPE[mimeType]}`;

  const { error: rowError } = await supabase
    .from("client_update_attachments")
    .insert({
      id,
      update_id: owner.id,
      tenant_id: owner.tenant_id,
      client_id: owner.client_id,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: mimeType,
      size_bytes: file.size,
    });
  if (rowError) {
    console.error("client update attachment row failed:", file.name, rowError);
    return false;
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: mimeType, upsert: false });
  if (!uploadError) {
    return true;
  }
  console.error(
    "client update attachment upload failed:",
    file.name,
    uploadError,
  );
  await removeAttachmentRow(id);
  return false;
}

/** Rolls back the row of a file whose upload failed. */
async function removeAttachmentRow(id: string): Promise<void> {
  const { error } = await supabase
    .from("client_update_attachments")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("client update attachment rollback failed:", id, error);
  }
}
