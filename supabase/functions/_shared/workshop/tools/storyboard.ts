import { withLook } from "../look.ts";
import {
  PRODUCTION_LOCKED,
  productionLockError,
  productionRunning,
} from "../production.ts";
import {
  briefProject,
  loadProject,
  mirrorReferences,
  savePayload,
} from "../project-io.ts";
import { asRecord, recordArtifact } from "../record.ts";
import { loadScenes, paidReplaceRefusal } from "../scene-helpers.ts";
import { storyboardText } from "../storyboard-text.ts";
import { forgetKeptDesign } from "./keep-design.ts";
import { filmConcept } from "./film-concept.ts";
import { scriptStep } from "./script-step.ts";
import { sceneRows, storyboardInput } from "./storyboard-scenes.ts";
import { storyboardSource } from "./storyboard-source.ts";
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
  // A running production's paid runs belong to the scenes it has (save_video_storyboard refuses
  // too, for a production that starts meanwhile).
  if (productionRunning(asRecord(asRecord(project.payload.video).production)))
    return { ...PRODUCTION_LOCKED };
  const brief = await briefProject(deps, project.payload, args, {
    kind: "video",
    save: (next) => savePayload(supabase, tenantId, itemId, next),
    needsEngine: false,
  });
  if ("gate" in brief) return brief.gate;
  await mirrorReferences(supabase, tenantId, itemId, args.reference_urls);
  const old = await loadScenes(supabase, tenantId, itemId);
  // Briefing first (it shapes the concepts), then the concept the user chose, then the scenes.
  const chosen = await filmConcept(ctx, itemId, brief.payload, old.length > 0);
  if ("stop" in chosen) {
    return chosen.stop;
  }
  // Then the script the user approved: the scenes are its beats.
  const scripted = await scriptStep(ctx, itemId, chosen.payload, {
    hasScenes: old.length > 0,
    concept: chosen.concept,
  });
  if ("stop" in scripted) {
    return scripted.stop;
  }
  project.payload = scripted.payload;
  const input = storyboardInput(args.scenes, scripted.script);
  if ("error" in input) {
    return input;
  }
  const source = await storyboardSource(ctx, itemId);
  if ("error" in source) {
    return source;
  }
  if (old.length > 0 && args.replace !== true)
    return { error: "כבר יש סטוריבורד. replace=true יחליף אותו." };
  const keepsPaid = await paidReplaceRefusal(supabase, tenantId, old, deps);
  if (keepsPaid) return keepsPaid;
  const rows = sceneRows(input.scenes, source.url);
  const saved = await supabase.rpc("save_video_storyboard", {
    p_item_id: itemId,
    p_scenes: rows,
  });
  if (saved.error)
    return productionLockError(saved.error)
      ? { ...PRODUCTION_LOCKED }
      : { error: saved.error.message };
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
    ...forgetKeptDesign(folded.payload),
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
      ...(chosen.concept ? { concept: chosen.concept } : {}),
      ...(scripted.script
        ? { script: { artifact_id: scripted.script.artifact_id } }
        : {}),
    },
  });
  const ownReferences = rows.filter((scene) => scene.reference_url).length;
  return {
    success: true,
    scenes: rows.length,
    ...(chosen.concept ? { concept: chosen.concept.title } : {}),
    ...(scripted.script ? { script: scripted.script.title } : {}),
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
