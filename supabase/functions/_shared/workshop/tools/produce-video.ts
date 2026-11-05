import { productionRunning } from "../production.ts";
import { loadProject, voiceHelpers } from "../project-io.ts";
import { asRecord } from "../record.ts";
import { hasOwnClip, loadScenes } from "../scene-helpers.ts";
import { type ToolContext } from "../tool-context.ts";
import { chooseVoice } from "../voice-tool.ts";
import { keepsDesign } from "./keep-design.ts";
import { narrationStep } from "./narration-review.ts";
import { gateProduction } from "./produce-video-gate.ts";
import { quoteProduction } from "./produce-video-quote.ts";
import { sceneEngineFor, scenesToMake } from "./produce-video-scenes.ts";
import { linkStage, pendingFilm, runningReply } from "./produce-video-stage.ts";
import { startProduction } from "./produce-video-start.ts";
import { stillsStep } from "./stills-approval.ts";

/**
 * Produces the film: animates the scenes, narrates, adds music and assembles it in the background.
 * Each step that waits for the user (the pictures, the voice, the narration in semi-automatic
 * mode, the budget) answers instead of starting.
 */
export async function workshopProduceVideo(ctx: ToolContext) {
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
  const scenes = await loadScenes(supabase, tenantId, itemId);
  if (scenes.length === 0)
    return { error: "אין סטוריבורד. קודם workshop_storyboard." };
  const noStill = scenes.filter(
    (scene) => !scene.still_asset_id && !hasOwnClip(scene),
  ).length;
  if (noStill > 0)
    return {
      error: `לא לכל הסצנות יש תמונה (${noStill} חסרות). קודם workshop_make_stills.`,
      missing_stills: noStill,
    };

  const video = asRecord(project.payload.video);
  // produce_video queues nothing while a production runs: no quote, no second charge.
  const production = asRecord(video.production);
  if (productionRunning(production))
    return runningReply(
      production.provider,
      project.client_id,
      (await pendingFilm(ctx, itemId))?.data,
    );

  const linked = await linkStage(ctx, itemId, project);
  if ("error" in linked) {
    return linked;
  }

  // Semi-automatic: the user approves the pictures before they are animated (stills-approval.ts).
  const approval = await stillsStep(ctx, itemId, project.payload, scenes);
  if ("stop" in approval) {
    return approval.stop;
  }
  project.payload = approval.payload;

  const keepDesign = keepsDesign(args, video);
  const engine = await sceneEngineFor(args, video, deps, keepDesign);
  const made = await scenesToMake(ctx, itemId, scenes, engine, keepDesign);
  const quote = await quoteProduction(ctx, {
    itemId,
    payload: project.payload,
    video,
    scenes,
    engine,
    animated: made.animated,
    relip: made.relip,
  });
  const { withVoice, talking, voiceId, estimate } = quote;
  // Narration needs a voice the user chose after hearing it.
  if ((withVoice || talking) && !voiceId)
    return await chooseVoice(
      {},
      voiceHelpers(supabase, tenantId, itemId, project.payload, deps),
    );
  // Semi-automatic: the user hears the narration before anything is animated (narration-review.ts).
  const review = await narrationStep(ctx, itemId, project.payload, {
    narrated: withVoice,
    newVoice: quote.newVoice,
    voiceId: voiceId ?? "",
    stageId: linked.stageId,
    engine,
    scenes,
    filmUsd: estimate.totalUsd - estimate.voice.usd,
    units: quote.units,
  });
  if ("stop" in review) {
    return review.stop;
  }
  project.payload = review.payload;
  const gate = await gateProduction(ctx, itemId, project.payload, {
    engine,
    scenes: scenes.length,
    quote,
  });
  if ("stop" in gate) return gate.stop;

  return await startProduction(ctx, {
    itemId,
    title: project.title,
    payload: gate.payload,
    engine,
    keepDesign,
    stageId: linked.stageId,
    clientId: linked.clientId,
    redrawnSceneIds: scenes
      .filter((scene) => made.redrawnClips.has(String(scene.clip_asset_id)))
      .map((scene) => String(scene.id)),
    quote,
  });
}
