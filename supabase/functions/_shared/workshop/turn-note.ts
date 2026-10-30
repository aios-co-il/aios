/**
 * Before Carmen acts on a workshop message: approve a waiting budget when the user's message
 * carries its code, and tell her where the open project stands and what comes next. Without
 * this she re-wrote the storyboard on every turn and an approval was lost whenever she called
 * something else first (seen in end-to-end runs on the preview).
 */

import { approveFromMessage } from "./budget-approve.ts";
import {
  answerFor,
  briefAnswersOf,
  withBriefAnswers,
} from "./brief-answers.ts";
import { tappedAnswers } from "./tapped-answers.ts";
import {
  loadSelectedArtifact,
  selectedArtifactLine,
} from "./selected-artifact.ts";
import { failStalePictures } from "./stale-pictures.ts";
import { talkingLine } from "./talking.ts";

export { failStalePictures };

// deno-lint-ignore no-explicit-any
type Db = any;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const TOOL_STEP: Record<string, string> = {
  workshop_make_creative: "יצירת התמונות (workshop_make_creative)",
  workshop_make_stills: "יצירת התמונות לסצנות (workshop_make_stills)",
  workshop_produce_video: "הפקת הסרט (workshop_produce_video)",
};

export interface FilmState {
  scenes: number;
  withStill: number;
  narrated: boolean;
  /** A scene's character says a line to the camera: it is recorded in the chosen voice too. */
  talking?: boolean;
  voiceChosen: boolean;
  producing: boolean;
}

/** The next film step for the project as it stands. */
export function nextFilmStep(state: FilmState): string {
  if (state.scenes === 0) return "כתיבת סטוריבורד (workshop_storyboard)";
  if (state.withStill < state.scenes)
    return "יצירת התמונות לסצנות (workshop_make_stills)";
  if ((state.narrated || state.talking === true) && !state.voiceChosen)
    return "בחירת קול (workshop_choose_voice)";
  if (state.producing) return "ההפקה רצה; לעדכון workshop_get_state";
  return "הפקת הסרט (workshop_produce_video)";
}

/** How many concept and copy pages the project already has on the board. */
async function boardCounts(supabase: Db, tenantId: string, itemId: string) {
  const { data } = await supabase
    .from("workshop_artifacts")
    .select("kind")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .in("kind", ["concept", "copy"]);
  const rows = (Array.isArray(data) ? data : []) as { kind: string }[];
  return {
    concept: rows.filter((row) => row.kind === "concept").length,
    copy: rows.filter((row) => row.kind === "copy").length,
  };
}

export async function workshopTurnNote(
  supabase: Db,
  tenantId: unknown,
  itemId: string | null,
  userText: string,
  lastAssistant = "",
  selectedArtifactId: string | null = null,
): Promise<string | null> {
  if (!itemId || typeof tenantId !== "string" || !tenantId) return null;
  try {
    const { data } = await supabase
      .from("marketing_work_items")
      .select("payload")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!data) return null;
    await failStalePictures(supabase, tenantId, itemId).catch(() => {});
    let payload = asRecord(data.payload);
    const lines: string[] = ["=== מצב הפרויקט (מהשרת) ==="];
    const approved = approveFromMessage(payload, userText);
    // Every tapped answer goes into the brief, so Carmen can come back to it later.
    const tapped = tappedAnswers(lastAssistant, userText);
    const next = withBriefAnswers(approved?.payload ?? payload, tapped);
    if (next !== payload) {
      const { error } = await supabase
        .from("marketing_work_items")
        .update({ payload: next })
        .eq("id", itemId)
        .eq("tenant_id", tenantId);
      if (!error) {
        payload = next;
        if (approved)
          lines.push(
            `המשתמש אישר עכשיו תקציב של $${approved.capUsd} לפרויקט. אל תבקשי אישור שוב. המשיכי מיד ל${approved.tool ? TOOL_STEP[approved.tool] : "שלב שחיכה לאישור"}.`,
          );
      }
    }
    const marked = selectedArtifactLine(
      await loadSelectedArtifact(
        supabase,
        tenantId,
        itemId,
        selectedArtifactId,
      ),
    );
    if (marked) {
      lines.push(marked);
    }
    const answers = Object.entries(briefAnswersOf(payload));
    if (answers.length > 0)
      lines.push(
        `תשובות הבריף (עבדי לפיהן ואל תשאלי שוב): ${answers.map(([q, a]) => `${q}: ${a}`).join(" · ")}.`,
      );
    const onBoard = await boardCounts(supabase, tenantId, itemId);
    if (onBoard.concept + onBoard.copy > 0)
      lines.push(
        `בלוח כבר יש ${onBoard.concept} קונספטים ו-${onBoard.copy} טקסטים: אל תשמרי קונספטים או קופי שוב אלא אם המשתמש ביקש חדשים.`,
      );
    if (payload.project_type === "video") {
      const scenes = await supabase
        .from("marketing_video_scenes")
        .select(
          "still_asset_id, clip_asset_id, clip_stale, voiceover_text, meta",
        )
        .eq("item_id", itemId)
        .eq("tenant_id", tenantId);
      const rows = (Array.isArray(scenes.data) ? scenes.data : []) as Record<
        string,
        unknown
      >[];
      const production = asRecord(asRecord(payload.video).production);
      const state: FilmState = {
        scenes: rows.length,
        // A scene made from the user's own video has its clip and needs no picture.
        withStill: rows.filter(
          (row) =>
            row.still_asset_id ||
            (row.clip_asset_id && row.clip_stale !== true),
        ).length,
        narrated: rows.some((row) => String(row.voiceover_text ?? "").trim()),
        talking: rows.some((row) => talkingLine(row.meta, row.voiceover_text)),
        voiceChosen: Boolean(asRecord(payload.video).voice_id),
        producing: production.status === "running",
      };
      lines.push(
        `סטוריבורד: ${state.scenes} סצנות, ${state.withStill} עם תמונה. קול לקריינות: ${state.voiceChosen ? "נבחר" : "עוד לא"}.`,
      );
      if (state.scenes > 0)
        lines.push(
          "יש כבר סטוריבורד: אל תכתבי אותו מחדש אלא אם המשתמש ביקש לשנות אותו. שינוי בסצנה אחת: workshop_update_scene.",
        );
      lines.push(`השלב הבא: ${nextFilmStep(state)}.`);
      if (/קריאה לפעולה/.test(answerFor(briefAnswersOf(payload), "סיום")))
        lines.push(
          "הסיום שנבחר כולל קריאה לפעולה: בהפקה העבירי cta_text קצר (עד 6 מילים).",
        );
    }
    return lines.length > 1 ? lines.join("\n") : null;
  } catch {
    return null;
  }
}
