/** The budget gate of workshop_produce_video: the production's quote, offered for approval. */

import { gatePaid } from "../gate.ts";
import { ENGINE_LABEL, type SceneEngine } from "../scene-engine.ts";
import type { ToolContext } from "../tool-context.ts";
import type { ProductionQuote } from "./produce-video-quote.ts";

/** Runs the paid gate for the production, with the offer the user approves. */
export async function gateProduction(
  ctx: ToolContext,
  itemId: string,
  payload: Record<string, unknown>,
  film: { engine: SceneEngine; scenes: number; quote: ProductionQuote },
) {
  const { supabase, tenantId, args, deps } = ctx;
  const { engine } = film;
  const { estimate, withVoice, withMusic, soundDesign } = film.quote;
  return await gatePaid(
    supabase,
    tenantId,
    itemId,
    payload,
    {
      tool: "workshop_produce_video",
      engine,
      count: film.quote.units,
      usd: estimate.totalUsd,
    },
    args,
    deps,
    {
      engine,
      engine_label: ENGINE_LABEL[engine],
      scenes: film.scenes,
      clip_seconds: estimate.clipSeconds,
      with_voice: withVoice,
      with_music: withMusic,
      // Talking scenes and what their voice lines and lip sync add to the price.
      ...(estimate.talkingScenes > 0
        ? {
            talking_scenes: estimate.talkingScenes,
            lipsync_usd: estimate.lipsync.usd,
          }
        : {}),
      ...(soundDesign
        ? {
            with_sound_effects: true,
            sound_effects_usd: estimate.soundEffects.usd,
          }
        : {}),
      estimated_usd: estimate.totalUsd,
      message:
        engine === "mock"
          ? estimate.totalUsd > 0
            ? `הסצנות יונפשו במנוע התצוגה החינמי (תנועה פשוטה על התמונות); הקריינות והסאונד יעלו עד כ-$${estimate.totalUsd}. אשר/י והתחל.`
            : "הסרט יופק במנוע התצוגה החינמי (תנועה פשוטה על התמונות), בלי עלות. אשר/י והתחל."
          : `ההפקה במנוע ${ENGINE_LABEL[engine]} תעלה עד כ-$${estimate.totalUsd}. אשר/י והתחל.`,
    },
  );
}
