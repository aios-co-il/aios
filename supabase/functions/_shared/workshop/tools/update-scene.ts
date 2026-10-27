/**
 * workshop_update_scene: changes one scene of the open film, the one the user selected on the
 * board or named ("סצנה 3"). Free: it only writes the scene. A new motion marks that scene's clip
 * alone for the next workshop_produce_video, and a new talking line is recorded and lip-synced
 * again there (both priced in its quote; scene-update.ts); a new frame description of a generated
 * picture queues that picture alone for workshop_make_stills.
 */

import type { Db } from "../db.ts";
import { productionRunning } from "../production.ts";
import { loadProject, savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import { isSceneEngine } from "../video-cost.ts";
import {
  REDO_KEY,
  SCENE_COLUMNS,
  loadScenes,
  stringList,
} from "../scene-helpers.ts";
import {
  type SceneRow,
  planSceneUpdate,
  sceneSummary,
} from "../scene-update.ts";
import { type SceneText, storyboardText } from "../storyboard-text.ts";
import { type ToolContext } from "../tool-context.ts";

/** The scene asked for: by id, else by its number on the board (1 = first). */
function findScene(
  scenes: Record<string, any>[],
  args: Record<string, unknown>,
) {
  const id = String(args.scene_id ?? "").trim();
  if (id) {
    const index = scenes.findIndex((scene) => String(scene.id) === id);
    return index >= 0 ? { scene: scenes[index], number: index + 1 } : null;
  }
  const number = Math.round(Number(args.scene_number));
  return Number.isInteger(number) && number >= 1 && number <= scenes.length
    ? { scene: scenes[number - 1], number }
    : null;
}

/** The scene's still is a picture the user uploaded (workshop_edit_from_assets attaches it so). */
async function isOwnPicture(supabase: Db, tenantId: string, scene: SceneRow) {
  if (!scene.still_asset_id) return false;
  const { data } = await supabase
    .from("marketing_assets")
    .select("id, meta")
    .eq("id", scene.still_asset_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return asRecord(data?.meta).source === "user_asset";
}

/**
 * The storyboard page on the board shows the scenes as they were written: bring this scene up to
 * date there too, so the board refreshes (realtime on workshop_artifacts). Cosmetic: a failure
 * here never fails the change itself.
 */
async function refreshStoryboardPage(
  supabase: Db,
  tenantId: string,
  itemId: string,
  scene: SceneRow,
  edit: boolean,
) {
  try {
    const { data } = await supabase
      .from("workshop_artifacts")
      .select("id, meta")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("kind", "storyboard")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.id) return null;
    const meta = asRecord(data.meta);
    const rows = (Array.isArray(meta.scenes) ? meta.scenes : []).map(asRecord);
    if (!rows.some((row) => row.id === scene.id)) return null;
    const sceneMeta = asRecord(scene.meta);
    const next = rows.map((row) =>
      row.id === scene.id
        ? {
            ...row,
            title: String(scene.title ?? row.title ?? ""),
            duration_s: Number(scene.duration_s) || Number(row.duration_s) || 3,
            visual_prompt: String(scene.visual_prompt ?? ""),
            motion_prompt: String(scene.motion_prompt ?? ""),
            overlay_text: String(scene.overlay_text ?? ""),
            voiceover_text: String(scene.voiceover_text ?? ""),
            lipsync: sceneMeta.lipsync === true,
            speaker: String(sceneMeta.speaker ?? ""),
            dialogue: String(sceneMeta.dialogue ?? ""),
          }
        : row,
    );
    const updated = await supabase
      .from("workshop_artifacts")
      .update({
        meta: {
          ...meta,
          scenes: next,
          total_s: next.reduce(
            (sum, row) => sum + (Number(row.duration_s) || 0),
            0,
          ),
          text: storyboardText(next as unknown as SceneText[], edit),
        },
      })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    return updated?.error ? null : String(data.id);
  } catch {
    return null;
  }
}

export async function workshopUpdateScene(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  if (!String(args.scene_id ?? "").trim() && args.scene_number == null)
    return {
      error:
        "scene_id נדרש: הסצנה שהמשתמש בחר בלוח, או scene_number כשהוא אמר מספר סצנה.",
    };
  const loaded = await loadProject(
    supabase,
    tenantId,
    itemId,
    assertClientAccess,
  );
  if ("error" in loaded) return loaded;
  const { project } = loaded;
  const scenes = await loadScenes(supabase, tenantId, itemId);
  const found = findScene(scenes, args);
  if (!found)
    return {
      error:
        scenes.length === 0
          ? "אין סצנות בפרויקט הזה עדיין."
          : `הסצנה לא נמצאה בפרויקט הזה (יש בו ${scenes.length} סצנות). קראי ל-workshop_get_state לרשימת הסצנות.`,
    };
  const target = found.scene as SceneRow;
  const ownPicture = await isOwnPicture(supabase, tenantId, target);
  const engine = asRecord(project.payload.video).scene_engine;
  const plan = planSceneUpdate(target, args, {
    ownPicture,
    engine: isSceneEngine(engine) ? engine : null,
  });
  if ("error" in plan) return plan;

  let scene: SceneRow = target;
  if (Object.keys(plan.patch).length > 0) {
    const written = await supabase
      .from("marketing_video_scenes")
      .update(plan.patch)
      .eq("id", target.id)
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .select(SCENE_COLUMNS)
      .maybeSingle();
    if (written.error) return { error: written.error.message };
    if (!written.data) return { error: "הסצנה לא נמצאה בפרויקט הזה." };
    scene = written.data as SceneRow;
  }
  // A new description for a generated picture: only this picture waits for workshop_make_stills.
  // The payload is read again just before the write: a production that started meanwhile keeps
  // its video.production.
  if (plan.stillRedo) {
    const fresh = await supabase
      .from("marketing_work_items")
      .select("payload")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const payload = asRecord(fresh?.data?.payload ?? project.payload);
    const waiting = stringList(payload[REDO_KEY]);
    if (!waiting.includes(target.id))
      await savePayload(supabase, tenantId, itemId, {
        ...payload,
        [REDO_KEY]: [...waiting, target.id],
      });
  }
  const pageId = await refreshStoryboardPage(
    supabase,
    tenantId,
    itemId,
    scene,
    project.payload.workshop_edit === true,
  );
  const running = productionRunning(
    asRecord(asRecord(project.payload.video).production),
  );
  const next = [
    `סצנה ${found.number} עודכנה בלוח (${plan.changed.join(", ") || "redo_clip"}), בלי עלות.`,
    plan.clipRedo
      ? "רק הסרטון של הסצנה הזו ייעשה מחדש בהפקה הבאה (workshop_produce_video, לפי הצעת המחיר והתקציב). שאר הסצנות נשארות כמו שהן."
      : plan.lineRedo
        ? "הסרטון של הסצנה נשאר: בהפקה הבאה (workshop_produce_video) המשפט החדש יוקלט בקול של הפרויקט ויסונכרן לשפתיים מחדש, לפי הצעת המחיר והתקציב."
        : "שום סצנה לא מונפשת מחדש: workshop_produce_video מרכיב את הסרט מחדש עם השינוי.",
    plan.stillRedo
      ? "התמונה של הסצנה לא תואמת עוד לתיאור החדש: workshop_make_stills יוצר מחדש רק אותה (עולה כסף, דרך התקציב)."
      : "",
    running
      ? "הפקה רצה עכשיו: השינוי ייכנס בהפקה הבאה. אל תפיקי שוב עד שהנוכחית מסתיימת."
      : "",
    "אמרי למשתמש במשפט אחד מה השתנה, ושאלי אם להרכיב את הסרט מחדש.",
  ].filter(Boolean);
  return {
    success: true,
    scene: sceneSummary(scene, found.number),
    changed: plan.changed,
    ...(plan.clipRedo ? { clip_redo: true } : {}),
    ...(plan.lineRedo ? { lipsync_redo: true } : {}),
    ...(plan.stillRedo ? { still_redo: true } : {}),
    message: next.join(" "),
    workshop: {
      event: "artifacts",
      item_id: itemId,
      scene_id: target.id,
      ...(pageId ? { artifact_id: pageId } : {}),
    },
  };
}
