import { type Db } from "../db.ts";
import {
  fileNameOf,
  fileType,
  type ImportKind,
  type ImportRequest,
} from "./import-file-name.ts";

/** Where a direct brain's files wait (agent-channel-mcp upload_aios_file): private, per tenant. */
const SOURCE_BUCKET = "command-center-files";
/**
 * The workshop's private media bucket. The board signs a bare path in it to show it, and the
 * render worker reads a bare path in it with its own key when it assembles the film (guard.ts).
 */
const TARGET_BUCKET = "creative-video";
/** The target bucket's own file size limit. */
const MAX_BYTES = 200 * 1024 * 1024;

/** What a file must be for each kind: a picture for a creative, a video for a clip or the film. */
const MIME_PREFIX: Record<ImportKind, string> = {
  image: "image/",
  clip: "video/",
  film: "video/",
};

/**
 * Copies the file into the project's folder in the workshop bucket, under the tenant prefix the
 * render worker requires. Refuses a file of the wrong type or over the bucket's limit.
 */
export async function copyIntoWorkshop(
  supabase: Db,
  request: ImportRequest,
  scope: { tenantId: string; clientId: string | null },
): Promise<{ path: string } | { error: string }> {
  const downloaded = await supabase.storage
    .from(SOURCE_BUCKET)
    .download(request.source);
  if (downloaded.error || !downloaded.data) {
    return {
      error: `הקובץ לא נמצא: ${downloaded.error?.message ?? request.source}`,
    };
  }
  const file: Blob = downloaded.data;
  const type = fileType(file.type, request.source);
  if (!type.startsWith(MIME_PREFIX[request.kind])) {
    return {
      error: `הקובץ (${type || "סוג לא ידוע"}) לא מתאים ל-${request.kind}`,
    };
  }
  if (file.size > MAX_BYTES) {
    return { error: "הקובץ גדול מ-200MB" };
  }
  const path = `${scope.tenantId}/${scope.clientId ?? "no-client"}/${request.itemId}/imports/${crypto.randomUUID()}-${fileNameOf(request.source)}`;
  const uploaded = await supabase.storage
    .from(TARGET_BUCKET)
    .upload(path, file, { contentType: type, upsert: false });
  if (uploaded.error) {
    return { error: uploaded.error.message };
  }
  return { path };
}
