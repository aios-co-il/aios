/**
 * The open workshop project, as far as routing needs it: is it a film, is it cut from the user's
 * own materials, and did the user pick one of its scenes on the board. A short reply ("תמשיכי")
 * then stays with the specialist of that project, and so does a comment on the picked scene.
 */

import type { ProjectKind } from "./roles.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const UUID =
  /item_id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

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

const SCENE =
  /scene_id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** The scene the user picked on the board, from the workshop context line (workshopBridge.ts). */
export function workshopSceneIdFrom(body: Record<string, unknown>) {
  const addon =
    typeof body.system_prompt_addon === "string"
      ? body.system_prompt_addon
      : "";
  return addon.match(SCENE)?.[1] ?? null;
}

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
    return {
      video: true,
      edit: payload.workshop_edit === true,
      ...(sceneId ? { scene: true } : {}),
    };
  } catch {
    return null;
  }
}
