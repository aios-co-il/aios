/**
 * The open workshop project, as far as routing needs it: is it a film, is it cut from the user's
 * own materials, and did the user pick one of its scenes on the board. A short reply ("תמשיכי")
 * then stays with the specialist of that project, and so does a comment on the picked scene.
 */

import { scriptSettled } from "./film-script.ts";
import type { ProjectKind } from "./roles.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

/** A context-line id ("item_id=<uuid>"), as workshopBridge.ts writes it. */
const contextId = (key: string) =>
  new RegExp(
    `${key}=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`,
    "i",
  );

const UUID = contextId("item_id");

/** The open project id: sent by the workshop chat, or read from its context line. */
export function workshopItemIdFrom(body: Record<string, unknown>) {
  if (typeof body.workshop_item_id === "string" && body.workshop_item_id)
    return body.workshop_item_id;
  const addon =
    typeof body.system_prompt_addon === "string"
      ? body.system_prompt_addon
      : "";
  return addon.match(UUID)?.[1] ?? null;
}

const ARTIFACT = contextId("artifact_id");

/** The page the user marked on the board: sent by the workshop chat, or read from its context line. */
export function workshopArtifactIdFrom(body: Record<string, unknown>) {
  if (
    typeof body.workshop_artifact_id === "string" &&
    body.workshop_artifact_id
  ) {
    return body.workshop_artifact_id;
  }
  const addon =
    typeof body.system_prompt_addon === "string"
      ? body.system_prompt_addon
      : "";
  return addon.match(ARTIFACT)?.[1] ?? null;
}

const SCENE = contextId("scene_id");

/** The scene the user picked on the board, from the workshop context line (workshopBridge.ts). */
export function workshopSceneIdFrom(body: Record<string, unknown>) {
  const addon =
    typeof body.system_prompt_addon === "string"
      ? body.system_prompt_addon
      : "";
  return addon.match(SCENE)?.[1] ?? null;
}

/**
 * The open project as routing sees it. A generated film with no scenes and no approved (or
 * skipped) script is still being written, so its turns go to the copywriter.
 */
export async function workshopProjectKind(
  supabase: Db,
  tenantId: unknown,
  itemId: string | null,
  sceneId: string | null = null,
): Promise<ProjectKind | null> {
  if (!itemId || typeof tenantId !== "string" || !tenantId) return null;
  try {
    const { data } = await supabase
      .from("marketing_work_items")
      .select("payload")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const payload = (data?.payload ?? {}) as Record<string, unknown>;
    if (payload.project_type !== "video") return { video: false, edit: false };
    const edit = payload.workshop_edit === true;
    const writing =
      !edit &&
      !sceneId &&
      !scriptSettled(payload) &&
      !(await hasScenes(supabase, tenantId, itemId));
    return {
      video: true,
      edit,
      ...(sceneId ? { scene: true } : {}),
      ...(writing ? { writing: true } : {}),
    };
  } catch {
    return null;
  }
}

/** Whether the film has any scene yet (a film written before the script step has scenes, no script). */
async function hasScenes(supabase: Db, tenantId: string, itemId: string) {
  const { data, error } = await supabase
    .from("marketing_video_scenes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .limit(1);
  if (error) {
    // Unknown: keep the producer, who works on a film at any stage.
    console.error(
      "[workshop] scenes not read for routing",
      itemId,
      error.message,
    );
    return true;
  }
  return Array.isArray(data) && data.length > 0;
}
