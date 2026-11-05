/**
 * The scenes workshop_produce_video makes clips for, and the engine that makes them: the clips it
 * animates and the kept talking clips it lip-syncs again.
 */

import type { WorkshopDeps } from "../gate.ts";
import { type SceneEngine, isSceneEngine } from "../scene-engine.ts";
import { type loadScenes, previewClipIds } from "../scene-helpers.ts";
import { clipSaysLine, talkingLine } from "../talking.ts";
import type { ToolContext } from "../tool-context.ts";
import { redrawnClipIds } from "./keep-design.ts";

/** A storyboard scene as loadScenes reads it. */
type Scene = Awaited<ReturnType<typeof loadScenes>>[number];

/**
 * The scene engine: the one asked for, else the project's, re-checked through defaultEngine when
 * none or ElevenLabs; the free preview when nothing else, and always for a kept design.
 */
export async function sceneEngineFor(
  args: Record<string, unknown>,
  video: Record<string, unknown>,
  deps: WorkshopDeps,
  keepDesign: boolean,
): Promise<SceneEngine> {
  let engine: SceneEngine | null = isSceneEngine(args.engine)
    ? args.engine
    : isSceneEngine(video.scene_engine) && video.scene_engine !== "mock"
      ? video.scene_engine
      : null;
  // A remembered ElevenLabs choice is re-checked: Starter cannot animate or narrate,
  // and defaultEngine then returns Higgsfield or the free preview.
  if (!engine || engine === "elevenlabs") {
    const resolved = deps.defaultEngine ? await deps.defaultEngine() : null;
    if (resolved) {
      engine = resolved;
    }
  }
  if (!engine) {
    engine = "mock";
  }
  // A finished design keeps its own text: the camera moves over the original picture.
  if (keepDesign) {
    engine = "mock";
  }
  return engine;
}

/**
 * The scenes produce_video queues a clip for (none yet, stale, failed, made by the free preview on
 * a paid engine, or redrawn by a video model in a kept design), the redrawn clips, and the kept
 * talking scenes it lip-syncs again.
 */
export async function scenesToMake(
  ctx: ToolContext,
  itemId: string,
  scenes: Array<Scene>,
  engine: SceneEngine,
  keepDesign: boolean,
) {
  const { supabase, tenantId } = ctx;
  const previewClips =
    engine === "mock"
      ? new Set<string>()
      : await previewClipIds(
          supabase,
          tenantId,
          itemId,
          scenes.map((scene) => scene.clip_asset_id).filter(Boolean),
        );
  // A finished design's scenes that a video model already redrew are made again from the picture.
  const redrawnClips = keepDesign
    ? await redrawnClipIds(
        supabase,
        tenantId,
        itemId,
        scenes.map((scene) => scene.clip_asset_id).filter(Boolean),
      )
    : new Set<string>();
  const animated = scenes.filter(
    (scene) =>
      !scene.clip_asset_id ||
      scene.clip_stale === true ||
      scene.status === "failed" ||
      previewClips.has(String(scene.clip_asset_id)) ||
      redrawnClips.has(String(scene.clip_asset_id)),
  );
  // A kept clip that does not say the scene's current line (a line changed on the board) is
  // lip-synced again by the production (queue_video_lipsync), so the quote prices that too.
  const relip = await relipScenes(
    supabase,
    tenantId,
    scenes.filter((scene) => !animated.includes(scene)),
  );
  return { animated, redrawnClips, relip };
}

/**
 * Of the scenes kept as they are, the talking ones the production lip-syncs again: a still to
 * lip-sync and a clip that does not say the current line (advance_video_production's rule).
 */
async function relipScenes(
  supabase: ToolContext["supabase"],
  tenantId: string,
  kept: Array<Scene>,
): Promise<Array<Scene>> {
  const talking = kept.filter(
    (scene) =>
      scene.still_asset_id && talkingLine(scene.meta, scene.voiceover_text),
  );
  const ids = talking
    .map((scene) => String(scene.clip_asset_id ?? ""))
    .filter(Boolean);
  if (ids.length === 0) {
    return talking;
  }
  const { data } = await supabase
    .from("marketing_assets")
    .select("id, meta")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  const clips = new Map(
    (Array.isArray(data) ? data : []).map((row: Scene) => [
      String(row.id),
      row.meta,
    ]),
  );
  return talking.filter(
    (scene) =>
      !clipSaysLine(
        clips.get(String(scene.clip_asset_id ?? "")),
        talkingLine(scene.meta, scene.voiceover_text),
      ),
  );
}
