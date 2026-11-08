/**
 * Starts a gated production: charges the quote with the film's settings saved, marks redrawn
 * scenes, calls produce_video and opens the pending film page. A production that never started
 * gives the quote back.
 */

import { spendBudget } from "../budget.ts";
import { CTA_MAX_CHARS } from "../cta.ts";
import { imageFormatsFrom } from "../defaults.ts";
import { refundMissing } from "../gate.ts";
import { savePayload } from "../project-io.ts";
import { asRecord, recordArtifact } from "../record.ts";
import { ENGINE_LABEL, type SceneEngine } from "../scene-engine.ts";
import { endingOf } from "../scene-helpers.ts";
import { musicPromptFor } from "../sound-design.ts";
import type { ToolContext } from "../tool-context.ts";
import { autoChoices } from "./auto-choices.ts";
import { remakeRedrawnClips } from "./keep-design.ts";
import type { ProductionQuote } from "./produce-video-quote.ts";
import {
  productionOptions,
  productionVideo,
} from "./produce-video-settings.ts";
import { pendingFilm, runningReply } from "./produce-video-stage.ts";

const KEPT_DESIGN_NOTE =
  "הסרט שמר את העיצוב מההפקה הקודמת (keep_design): הסצנות הן תנועת מצלמה על התמונות, בלי הנפשה. אם המשתמש ביקש הנפשה אמיתית, אמרי לו והפיקי שוב עם keep_design=false.";

/** A production that passed its gate. */
export interface GatedProduction {
  itemId: string;
  title: string;
  /** The gated payload: it holds the budget and the approvals. */
  payload: Record<string, unknown>;
  engine: SceneEngine;
  keepDesign: boolean;
  stageId: string | null;
  clientId: string | null;
  /** The scenes whose redrawn clips are made again from the picture. */
  redrawnSceneIds: Array<string>;
  quote: ProductionQuote;
}

/** Saves the settings, queues the production and answers with its pending film page. */
export async function startProduction(ctx: ToolContext, film: GatedProduction) {
  const { supabase, tenantId, args, deps } = ctx;
  const { itemId, engine, keepDesign, quote } = film;
  const { estimate, soundDesign, voiceId } = quote;
  const format = imageFormatsFrom([film.payload.format], ["9:16"])[0];
  const ctaText =
    typeof args.cta_text === "string"
      ? args.cta_text.replace(/\s+/g, " ").trim().slice(0, CTA_MAX_CHARS)
      : "";
  const musicPrompt = musicPromptFor(film.payload, deps.userText ?? "");
  // The quote is charged before the RPC (the payload's video settings must be saved first); a
  // production that never started gives it back.
  const units = quote.units || 1;
  const refund = () =>
    refundMissing(supabase, tenantId, itemId, "workshop_produce_video", units);
  try {
    await savePayload(
      supabase,
      tenantId,
      itemId,
      spendBudget(
        {
          ...endingOf(film.payload, ctaText),
          video: productionVideo(film.payload, args, {
            engine,
            soundDesign,
            keepDesign,
            voiceId,
          }),
        },
        "workshop_produce_video",
        units,
      ),
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "שמירת הפרויקט נכשלה",
    };
  }
  try {
    await remakeRedrawnClips(supabase, tenantId, itemId, film.redrawnSceneIds);
  } catch (error) {
    await refund();
    return {
      error: error instanceof Error ? error.message : "סימון הסצנות נכשל",
    };
  }
  const produced = await supabase.rpc("produce_video", {
    p_item_id: itemId,
    p_options: productionOptions(
      format,
      engine,
      film.stageId,
      quote,
      musicPrompt,
    ),
  });
  if (produced.error) {
    await refund();
    return {
      error: [
        produced.error.message,
        produced.error.details,
        produced.error.code,
      ]
        .filter(Boolean)
        .join(" | "),
    };
  }
  const state = asRecord(produced.data);
  // A production that failed at once queued nothing paid, and gets no pending film page (it
  // would spin forever).
  if (state.status === "failed") {
    await refund();
    return {
      success: false,
      status: "failed",
      error: String(state.error ?? "ההפקה נכשלה"),
    };
  }
  // produce_video's lock: another production runs, and this call queued nothing.
  const alreadyRunning =
    state.status === "running" &&
    Number(state.clips ?? 0) + Number(state.voices ?? 0) === 0 &&
    Number(state.music ?? 0) === 0;
  if (alreadyRunning) {
    await refund();
  }
  const open = alreadyRunning ? await pendingFilm(ctx, itemId) : null;
  if (alreadyRunning && open?.data) {
    return runningReply(engine, film.clientId, open.data);
  }
  const artifact = await recordArtifact(supabase, {
    tenantId,
    itemId,
    kind: "film",
    title: film.title ? `${film.title} · סרט` : "הסרט",
    status: "pending",
    meta: { engine, estimated_usd: estimate.totalUsd },
  });
  return {
    success: true,
    started: true,
    status: state.status ?? "running",
    engine: ENGINE_LABEL[engine],
    client_id: film.clientId,
    ...(soundDesign ? { sound_design: true } : {}),
    // A design kept from the film's last production, not asked for now: Carmen can undo it.
    ...(keepDesign && typeof args.keep_design !== "boolean"
      ? { kept_design_note: KEPT_DESIGN_NOTE }
      : {}),
    // The user's line, with what Carmen chose on her own in automatic mode (auto-choices.ts).
    ...autoChoices(film.payload, voiceId),
    message:
      "ההפקה התחילה ורצה ברקע בשרת ההפקה. הסרט יופיע בלוח כשיהיה מוכן. אל תפיקי שוב: לבדיקה קראי ל-workshop_get_state ובדקי production.",
    artifact,
    workshop: {
      event: "artifacts",
      item_id: itemId,
      artifact_id: artifact.id,
    },
  };
}
