/**
 * The budget gate of workshop_make_stills: one budget covers the whole film, the pictures and the
 * production that follows them, so the approval is asked once.
 */

import { costSceneOf } from "../cost-scene.ts";
import { estimateImages, type Format } from "../defaults.ts";
import { gatePaid } from "../gate.ts";
import type { ImageProvider } from "../image-providers.ts";
import { wantsSoundDesign } from "../sound-design.ts";
import type { ToolContext } from "../tool-context.ts";
import { quotedProductionEstimate } from "../video-cost.ts";
import type { SceneRow } from "./make-stills-render.ts";

/** The pictures this call is asked to make, out of all the scenes still waiting for one. */
export interface StillsOrder {
  itemId: string;
  payload: Record<string, unknown>;
  scenes: Array<SceneRow>;
  pending: Array<SceneRow>;
  batch: Array<SceneRow>;
  format: Format;
  engine: ImageProvider | null;
}

/** Runs the paid gate for the waiting pictures, with a project budget sized for the whole film. */
export async function gateStills(ctx: ToolContext, order: StillsOrder) {
  const { supabase, tenantId, args, deps } = ctx;
  const { pending, batch, format } = order;
  const estimate = estimateImages([format], batch.length);
  const whole = estimateImages([format], pending.length);
  const filmUsd = await filmEstimateUsd(ctx, order);
  const projectBudget = Math.max(
    Number(args.budget_usd) || 0,
    (whole.usd + filmUsd) * 1.2,
  );
  return await gatePaid(
    supabase,
    tenantId,
    order.itemId,
    order.payload,
    {
      tool: "workshop_make_stills",
      engine: order.engine ?? "auto",
      count: pending.length,
      usd: whole.usd,
    },
    { ...args, budget_usd: projectBudget },
    deps,
    {
      scenes: pending.length,
      this_call: batch.length,
      estimated_usd: whole.usd,
      message:
        pending.length > batch.length
          ? `${pending.length} תמונות לסצנות יעלו עד כ-$${whole.usd} (${batch.length} בקריאה הזו, כ-$${estimate.usd}). אשר/י והתחל.`
          : `${batch.length} תמונות לסצנות יעלו עד כ-$${estimate.usd}. אשר/י והתחל.`,
    },
  );
}

/** The quote of the production that follows the pictures, on the tenant's default engine. */
async function filmEstimateUsd(ctx: ToolContext, order: StillsOrder) {
  const { deps } = ctx;
  const filmEngine =
    (deps.defaultEngine ? await deps.defaultEngine() : null) ?? "mock";
  const film = quotedProductionEstimate(
    filmEngine,
    order.scenes.map(costSceneOf),
    {
      withVoice: order.scenes.some((scene) =>
        String(scene.voiceover_text ?? "").trim(),
      ),
      withMusic: true,
      withSoundEffects: wantsSoundDesign(order.payload, {
        userText: deps.userText,
      }),
    },
    deps.videoConnections ? await deps.videoConnections() : {},
  );
  return film.totalUsd;
}
