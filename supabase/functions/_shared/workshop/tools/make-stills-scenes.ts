/** Which scenes workshop_make_stills makes pictures for, and whether a call is already making them. */

import type { Db } from "../db.ts";
import {
  REDO_KEY,
  RUNNING_WINDOW_MS,
  hasOwnClip,
  stringList,
} from "../scene-helpers.ts";
import type { SceneRow } from "./make-stills-render.ts";

/**
 * The scenes to redo (every picture on redo, else the ones the project marked) and the scenes
 * waiting for a picture: those without one or with their own clip, and those to redo.
 */
export function pendingStills(
  scenes: Array<SceneRow>,
  payload: Record<string, unknown>,
  redo: boolean,
) {
  const redoIds = new Set(
    redo
      ? scenes
          // A scene of the user's own video keeps its footage: no picture replaces it.
          .filter((scene) => scene.still_asset_id || !scene.clip_asset_id)
          .map((scene) => String(scene.id))
      : stringList(payload[REDO_KEY]),
  );
  const pending = scenes.filter(
    (scene) =>
      (!scene.still_asset_id && !hasOwnClip(scene)) ||
      redoIds.has(String(scene.id)),
  );
  return { redoIds, pending };
}

/** True while an earlier call's picture placeholders are still pending on the board. */
export async function stillsRunning(
  supabase: Db,
  tenantId: string,
  itemId: string,
) {
  const running = await supabase
    .from("workshop_artifacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("status", "pending")
    .eq("kind", "scene_still")
    .eq("meta->>placeholder", "true")
    .gte("created_at", new Date(Date.now() - RUNNING_WINDOW_MS).toISOString());
  return Array.isArray(running.data) && running.data.length > 0;
}
