/**
 * What workshop_produce_video makes and its quote: the clips, a narration and a music bed when
 * the film needs them, the trailer sound design and the talking scenes' lip sync.
 */

import { costSceneOf } from "../cost-scene.ts";
import type { SceneEngine } from "../scene-engine.ts";
import { wantsSoundDesign } from "../sound-design.ts";
import { talkingLine } from "../talking.ts";
import type { ToolContext } from "../tool-context.ts";
import { quotedProductionEstimate } from "../video-cost.ts";
import { narrationVoiceId } from "../voices.ts";

type Scene = Record<string, unknown>;

/** The film as produce_video is asked to make it: its scenes, what it animates and lip-syncs. */
export interface ProductionOrder {
  itemId: string;
  payload: Record<string, unknown>;
  video: Record<string, unknown>;
  scenes: Array<Scene>;
  engine: SceneEngine;
  animated: Array<Scene>;
  relip: Array<Scene>;
}

/** The production's sound choices and its quote. */
export async function quoteProduction(
  ctx: ToolContext,
  order: ProductionOrder,
) {
  const { supabase, tenantId, args, deps } = ctx;
  const { scenes, video } = order;
  const costScenes = order.animated.map(costSceneOf);
  const relip = order.relip.map(costSceneOf);
  const withVoice = scenes.some((scene) =>
    String(scene.voiceover_text ?? "").trim(),
  );
  // A talking scene's own line is recorded in the project's voice too (queue_video_lipsync
  // reads video.voice_id), so it also needs a voice the user chose.
  const talking = scenes.some((scene) =>
    talkingLine(scene.meta, scene.voiceover_text),
  );
  const withMusic = args.music !== false;
  // Trailer sound design (a transition sound at each cut, a soft hit on title and end card) and
  // the music bed both follow the film brief; the render worker reads video.sound_design and
  // makes the effects in this production's render only, so the quote includes them.
  const soundDesign = wantsSoundDesign(order.payload, {
    choice: args.sound_design,
    userText: deps.userText,
  });
  // The narration is checked against this voice; a new one re-narrates the film.
  const voiceId = narrationVoiceId(args.voice_id, video.voice_id);
  // Narration and music are made for the whole film, also when no scene is animated (a film cut
  // from the user's own videos, or one line changed).
  const newVoice = voiceId !== narrationVoiceId(undefined, video.voice_id);
  const due = await soundDue(supabase, tenantId, order.itemId, newVoice);
  const estimate = quotedProductionEstimate(
    order.engine,
    costScenes,
    {
      withVoice: withVoice && due.narration,
      withMusic: withMusic && due.music,
      withSoundEffects: soundDesign,
      film: scenes.map(costSceneOf),
    },
    deps.videoConnections ? await deps.videoConnections() : {},
    relip,
  );
  return {
    withVoice,
    talking,
    withMusic,
    soundDesign,
    voiceId,
    newVoice,
    estimate,
    units: costScenes.length + relip.length,
  };
}

/** A production's quote and sound choices, as quoteProduction returns them. */
export type ProductionQuote = Awaited<ReturnType<typeof quoteProduction>>;

/**
 * What produce_video makes for the whole film besides the clips: a narration when the current one
 * does not read the script in the film's voice (video_narration_ready; a new voice narrates
 * again), and a music bed when the film has none. A check that cannot be read counts as due, so
 * the quote never leaves them out.
 */
async function soundDue(
  supabase: ToolContext["supabase"],
  tenantId: string,
  itemId: string,
  newVoice: boolean,
) {
  try {
    const ready = newVoice
      ? null
      : await supabase.rpc("video_narration_ready", { p_item_id: itemId });
    const { data } = await supabase
      .from("marketing_assets")
      .select("id, type, url")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("type", "music")
      .limit(5);
    const bed = (Array.isArray(data) ? data : []).some(
      (row: Scene) => row.type === "music" && String(row.url ?? "") !== "",
    );
    return { narration: ready?.data !== true, music: !bed };
  } catch {
    return { narration: true, music: true };
  }
}
