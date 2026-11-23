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
  // Type and size come from the object's metadata, so a wrong or oversized file is refused
  // before it is loaded into the function's memory (smaller than some uploads).
  const stored = await storedFile(supabase, request.source);
  if ("error" in stored) {
    return stored;
  }
  const type = fileType(stored.mimetype, request.source);
  if (!type.startsWith(MIME_PREFIX[request.kind])) {
    return {
      error: `הקובץ (${type || "סוג לא ידוע"}) לא מתאים ל-${request.kind}`,
    };
  }
  if (stored.size > MAX_BYTES) {
    return { error: "הקובץ גדול מ-200MB" };
  }
  const downloaded = await supabase.storage
    .from(SOURCE_BUCKET)
    .download(request.source);
  if (downloaded.error || !downloaded.data) {
    return {
      error: `הקובץ לא נמצא: ${downloaded.error?.message ?? request.source}`,
    };
  }
  const file: Blob = downloaded.data;
  const path = `${scope.tenantId}/${scope.clientId ?? "no-client"}/${request.itemId}/imports/${crypto.randomUUID()}-${fileNameOf(request.source)}`;
  const uploaded = await supabase.storage
    .from(TARGET_BUCKET)
    .upload(path, file, { contentType: type, upsert: false });
  if (uploaded.error) {
    return { error: uploaded.error.message };
  }
  return { path };
}

/** A row of a storage folder listing: the object's name and what storage knows about it. */
interface StoredEntry {
  name: string;
  metadata?: { mimetype?: string; size?: number };
}

/** The source object's stored type and size, read from its folder listing without downloading it. */
async function storedFile(
  supabase: Db,
  source: string,
): Promise<{ mimetype: string; size: number } | { error: string }> {
  const slash = source.lastIndexOf("/");
  const folder = source.slice(0, slash);
  const name = source.slice(slash + 1);
  const { data, error } = await supabase.storage
    .from(SOURCE_BUCKET)
    .list(folder, { search: name, limit: 100 });
  const entry: StoredEntry | undefined = (data ?? []).find(
    (row: StoredEntry) => row.name === name,
  );
  if (error || !entry) {
    return { error: `הקובץ לא נמצא: ${error?.message ?? source}` };
  }
  return {
    mimetype: String(entry.metadata?.mimetype ?? ""),
    size: Number(entry.metadata?.size ?? 0),
  };
}

/**
 * Deletes a copy no board page or scene points at, after its placement failed: a retry copies
 * again under a new name, so each failure would leave up to 200MB behind. A failed delete is
 * logged with the path, so the orphan can be found.
 */
export async function removeCopy(supabase: Db, path: string): Promise<void> {
  const { error } = await supabase.storage.from(TARGET_BUCKET).remove([path]);
  if (error) {
    console.error(
      `[workshop_import_file] orphan copy not removed: ${path}: ${error.message}`,
    );
  }
}
