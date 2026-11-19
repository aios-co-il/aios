import { type Db } from "../db.ts";
import { loadProject } from "../project-io.ts";
import { PRODUCTION_LOCKED, productionRunning } from "../production.ts";
import { asRecord, recordArtifact } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";

/** Where a direct brain's files wait (agent-channel-mcp upload_aios_file): private, per tenant. */
const SOURCE_BUCKET = "command-center-files";
/**
 * The workshop's private media bucket. The board signs a bare path in it to show it, and the
 * render worker reads a bare path in it with its own key when it assembles the film (guard.ts).
 */
const TARGET_BUCKET = "creative-video";
/** The target bucket's own file size limit. */
const MAX_BYTES = 200 * 1024 * 1024;

const KINDS = ["image", "clip", "film"] as const;
type ImportKind = (typeof KINDS)[number];

/** What a file must be for each kind: a picture for a creative, a video for a clip or the film. */
const MIME_PREFIX: Record<ImportKind, string> = {
  image: "image/",
  clip: "video/",
  film: "video/",
};

/**
 * Puts a finished file a direct brain made (a creative, a scene clip, the final film) on the
 * project's board. The file is copied into the workshop's bucket and recorded the way the
 * workshop's own pipeline records it, so approval, rendering and the board treat it as theirs.
 * Nothing is generated and nothing is paid.
 */
export async function workshopImportFile(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess } = ctx;
  const request = parseRequest(args, tenantId);
  if ("error" in request) return request;
  const loaded = await loadProject(
    supabase,
    tenantId,
    request.itemId,
    assertClientAccess,
  );
  if ("error" in loaded) return loaded;
  const { project } = loaded;
  const film = asRecord(asRecord(project.payload.video).production);
  if (request.kind !== "image" && productionRunning(film)) {
    return { ...PRODUCTION_LOCKED };
  }
  const scene =
    request.kind === "clip"
      ? await loadScene(supabase, tenantId, request.itemId, request.sceneId)
      : null;
  if (scene && "error" in scene) return scene;
  const copied = await copyIntoWorkshop(supabase, request, {
    tenantId,
    clientId: project.client_id,
  });
  if ("error" in copied) return copied;
  const placed = await placeOnBoard(supabase, request, copied.path, {
    tenantId,
    sceneTitle: scene?.title,
  });
  if ("error" in placed) return placed;
  return {
    success: true,
    path: copied.path,
    message: placed.message,
    workshop: { event: "artifacts", item_id: request.itemId },
  };
}

interface ImportRequest {
  itemId: string;
  kind: ImportKind;
  source: string;
  title: string;
  sceneId: string;
}

/** The call's arguments, checked: a known kind, a scene for a clip, a file of this tenant. */
function parseRequest(
  args: Record<string, unknown>,
  tenantId: string,
): ImportRequest | { error: string } {
  const itemId = String(args.item_id ?? "").trim();
  const kind = String(args.kind ?? "") as ImportKind;
  const source = String(args.path ?? "").trim();
  const sceneId = String(args.scene_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  if (!KINDS.includes(kind))
    return { error: "kind חייב להיות image, clip או film" };
  if (kind === "clip" && !sceneId) return { error: "לקליפ צריך scene_id" };
  // Only files a direct brain of this organization uploaded: never another tenant's.
  if (
    !source.startsWith(`agent-replies/${tenantId}/`) ||
    source.includes("..")
  ) {
    return { error: "path אינו קובץ שהועלה בשיחה של הארגון הזה" };
  }
  const title = String(args.title ?? "").trim() || fileNameOf(source);
  return { itemId, kind, source, title, sceneId };
}

/** The scene a clip belongs to, inside this project and tenant. */
async function loadScene(
  supabase: Db,
  tenantId: string,
  itemId: string,
  sceneId: string,
): Promise<{ id: string; title: string } | { error: string }> {
  const { data, error } = await supabase
    .from("marketing_video_scenes")
    .select("id, title")
    .eq("id", sceneId)
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "הסצנה לא נמצאה בפרויקט הזה" };
  return { id: data.id, title: String(data.title ?? "") };
}

/**
 * Copies the file into the project's folder in the workshop bucket, under the tenant prefix the
 * render worker requires. Refuses a file of the wrong type or over the bucket's limit.
 */
async function copyIntoWorkshop(
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
  if (!file.type.startsWith(MIME_PREFIX[request.kind])) {
    return {
      error: `הקובץ (${file.type || "סוג לא ידוע"}) לא מתאים ל-${request.kind}`,
    };
  }
  if (file.size > MAX_BYTES) return { error: "הקובץ גדול מ-200MB" };
  const path = `${scope.tenantId}/${scope.clientId ?? "no-client"}/${request.itemId}/imports/${crypto.randomUUID()}-${fileNameOf(request.source)}`;
  const uploaded = await supabase.storage
    .from(TARGET_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) return { error: uploaded.error.message };
  return { path };
}

/**
 * Records the copied file as the workshop's own pipeline would: a creative or the film as a board
 * page, a clip as the scene's next clip version (which marks the scene clip_ready).
 */
async function placeOnBoard(
  supabase: Db,
  request: ImportRequest,
  path: string,
  scope: { tenantId: string; sceneTitle?: string },
): Promise<{ message: string } | { error: string }> {
  const meta = { source: "agent_import", imported_from: request.source };
  if (request.kind === "clip") {
    const attached = await supabase.rpc("attach_video_scene_asset", {
      p_scene_id: request.sceneId,
      p_kind: "clip",
      p_url: path,
      p_meta: meta,
    });
    if (attached.error) return { error: attached.error.message };
    return {
      message: `הקליפ הוצמד לסצנה "${scope.sceneTitle || request.sceneId}" ומחכה לאישור.`,
    };
  }
  try {
    await recordArtifact(supabase, {
      tenantId: scope.tenantId,
      itemId: request.itemId,
      kind: request.kind,
      title: request.title,
      url: path,
      meta,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "השמירה ללוח נכשלה",
    };
  }
  return {
    message:
      request.kind === "film"
        ? "הסרט נוסף ללוח של הפרויקט."
        : "הקריאייטיב נוסף ללוח של הפרויקט.",
  };
}

/** The file's own name: the last path segment without the upload's random prefix. */
function fileNameOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/^[0-9a-f-]{36}-/, "") || "file";
}
