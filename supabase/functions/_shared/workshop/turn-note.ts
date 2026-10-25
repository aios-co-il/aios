/**
 * Before Carmen acts on a workshop message: approve a waiting budget when the user's message
 * carries its code, and tell her where the open project stands and what comes next. Without
 * this she re-wrote the storyboard on every turn and an approval was lost whenever she called
 * something else first (seen in end-to-end runs on the preview).
 */

import { approveFromMessage } from "./budget-approve.ts";

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
  voiceChosen: boolean;
  producing: boolean;
}

/** The next film step for the project as it stands. */
export function nextFilmStep(state: FilmState): string {
  if (state.scenes === 0) return "כתיבת סטוריבורד (workshop_storyboard)";
  if (state.withStill < state.scenes)
    return "יצירת התמונות לסצנות (workshop_make_stills)";
  if (state.narrated && !state.voiceChosen)
    return "בחירת קול (workshop_choose_voice)";
  if (state.producing) return "ההפקה רצה; לעדכון workshop_get_state";
  return "הפקת הסרט (workshop_produce_video)";
}

/** A picture page still pending after this was cut off: the request making it has ended. */
const STALE_PICTURE_MS = 5 * 60_000;

/** Turns pictures a cut-off request left spinning on the board into failed pages. */
export async function failStalePictures(
  supabase: Db,
  tenantId: string,
  itemId: string,
  now = Date.now(),
) {
  await supabase
    .from("workshop_artifacts")
    .update({
      status: "failed",
      meta: { text: "נקטע לפני שהסתיים. אפשר לבקש שוב." },
    })
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("status", "pending")
    .eq("meta->>placeholder", "true")
    .in("kind", ["image", "scene_still"])
    .lt("created_at", new Date(now - STALE_PICTURE_MS).toISOString());
}

export async function workshopTurnNote(
  supabase: Db,
  tenantId: unknown,
  itemId: string | null,
  userText: string,
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
    if (approved) {
      const { error } = await supabase
        .from("marketing_work_items")
        .update({ payload: approved.payload })
        .eq("id", itemId)
        .eq("tenant_id", tenantId);
      if (!error) {
        payload = approved.payload;
        lines.push(
          `המשתמש אישר עכשיו תקציב של $${approved.capUsd} לפרויקט. אל תבקשי אישור שוב. המשיכי מיד ל${approved.tool ? TOOL_STEP[approved.tool] : "שלב שחיכה לאישור"}.`,
        );
      }
    }
    if (payload.project_type === "video") {
      const scenes = await supabase
        .from("marketing_video_scenes")
        .select("still_asset_id, voiceover_text")
        .eq("item_id", itemId)
        .eq("tenant_id", tenantId);
      const rows = (Array.isArray(scenes.data) ? scenes.data : []) as Record<
        string,
        unknown
      >[];
      const production = asRecord(asRecord(payload.video).production);
      const state: FilmState = {
        scenes: rows.length,
        withStill: rows.filter((row) => row.still_asset_id).length,
        narrated: rows.some((row) => String(row.voiceover_text ?? "").trim()),
        voiceChosen: Boolean(asRecord(payload.video).voice_id),
        producing: production.status === "running",
      };
      lines.push(
        `סטוריבורד: ${state.scenes} סצנות, ${state.withStill} עם תמונה. קול לקריינות: ${state.voiceChosen ? "נבחר" : "עוד לא"}.`,
      );
      if (state.scenes > 0)
        lines.push(
          "יש כבר סטוריבורד: אל תכתבי אותו מחדש אלא אם המשתמש ביקש לשנות אותו.",
        );
      lines.push(`השלב הבא: ${nextFilmStep(state)}.`);
    }
    return lines.length > 1 ? lines.join("\n") : null;
  } catch {
    return null;
  }
}
