import { sceneReferenceUrl, withLook } from "../look.ts";
import {
  briefProject,
  loadProject,
  mirrorReferences,
  savePayload,
} from "../project-io.ts";
import { asRecord, recordArtifact } from "../record.ts";
import { loadScenes, paidReplaceRefusal } from "../scene-helpers.ts";
import { storyboardText } from "../storyboard-text.ts";
import { type ToolContext } from "../tool-context.ts";

export async function workshopStoryboard(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess, deps } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  const loaded = await loadProject(
    supabase,
    tenantId,
    itemId,
    assertClientAccess,
  );
  if ("error" in loaded) return loaded;
  const { project } = loaded;
  const brief = await briefProject(deps, project.payload, args, {
    kind: "video",
    save: (next) => savePayload(supabase, tenantId, itemId, next),
    needsEngine: false,
  });
  if ("gate" in brief) return brief.gate;
  await mirrorReferences(supabase, tenantId, itemId, args.reference_urls);
  project.payload = brief.payload;
  const input = (Array.isArray(args.scenes) ? args.scenes : [])
    .map((scene) => asRecord(scene))
    .filter((scene) => String(scene.visual_prompt ?? "").trim())
    .slice(0, 20);
  if (input.length === 0)
    return { error: "scenes ריק: כל סצנה צריכה visual_prompt" };
  // A scene's own picture (the skin the character wears in it) must be one the stills can fetch:
  // a wrong address is refused here rather than silently falling back to the project's look.
  const badReference = input.findIndex(
    (scene) =>
      String(scene.reference_url ?? "").trim() !== "" &&
      !sceneReferenceUrl(scene.reference_url),
  );
  if (badReference >= 0)
    return {
      error: `סצנה ${badReference + 1}: reference_url חייב להיות קישור https ציבורי לתמונה (נכס מהפרויקט או קישור שהמשתמש נתן).`,
    };
  const old = await loadScenes(supabase, tenantId, itemId);
  if (old.length > 0 && args.replace !== true)
    return { error: "כבר יש סטוריבורד. replace=true יחליף אותו." };
  const keepsPaid = await paidReplaceRefusal(
    supabase,
    tenantId,
    old,
    deps.userText,
  );
  if (keepsPaid) return keepsPaid;
  const rows = input.map((scene, index) => ({
    id: crypto.randomUUID(),
    position: index + 1,
    title: String(scene.title ?? "").trim() || `סצנה ${index + 1}`,
    shot: String(scene.shot ?? "").trim() || "Medium shot",
    visual_prompt: String(scene.visual_prompt).trim(),
    motion_prompt: String(scene.motion_prompt ?? "").trim(),
    overlay_text: String(scene.overlay_text ?? "").trim(),
    voiceover_text: String(scene.voiceover_text ?? "").trim(),
    duration_s: Math.min(Math.max(Number(scene.duration_s) || 3, 0.5), 120),
    // The scene's own character picture: saved to meta by save_video_storyboard, and its
    // still is made from it instead of the project's anchor frame.
    ...(sceneReferenceUrl(scene.reference_url)
      ? { reference_url: sceneReferenceUrl(scene.reference_url) }
      : {}),
    // Talking scene: saved to meta by save_video_storyboard.
    ...(scene.lipsync === true
      ? {
          lipsync: true,
          speaker: String(scene.speaker ?? "").trim(),
          dialogue: String(scene.dialogue ?? "").trim(),
        }
      : {}),
  }));
  const saved = await supabase.rpc("save_video_storyboard", {
    p_item_id: itemId,
    p_scenes: rows,
  });
  if (saved.error) return { error: saved.error.message };
  if (old.length > 0) {
    const removed = await supabase
      .from("marketing_video_scenes")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .in(
        "id",
        old.map((scene) => scene.id),
      );
    if (removed.error) return { error: removed.error.message };
  }
  const folded = withLook(project.payload, {}, { anchorUrl: null });
  await savePayload(supabase, tenantId, itemId, {
    ...folded.payload,
    project_type: "video",
  });
  const total = rows.reduce((sum, scene) => sum + scene.duration_s, 0);
  const artifact = await recordArtifact(supabase, {
    tenantId,
    itemId,
    kind: "storyboard",
    title: `סטוריבורד · ${rows.length} סצנות`,
    meta: {
      total_s: total,
      scenes: rows,
      text: storyboardText(rows, false),
    },
  });
  const ownReferences = rows.filter((scene) => scene.reference_url).length;
  return {
    success: true,
    scenes: rows.length,
    ...(ownReferences > 0 ? { scenes_with_own_reference: ownReferences } : {}),
    total_s: total,
    artifact,
    workshop: {
      event: "artifacts",
      item_id: itemId,
      artifact_id: artifact.id,
    },
  };
}
