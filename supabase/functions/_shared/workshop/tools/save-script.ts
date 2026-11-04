/**
 * workshop_save_script: the film's script as a page on the board, beat by beat. Its own tool, not
 * workshop_save_copy: a script has timed beats that must add up to the film's length and
 * narration that fits its time, and the storyboard gate reads it back (film-script.ts).
 */

import {
  filmSeconds,
  maxWords,
  SCRIPT_CHOICE,
  scriptText,
  spokenWords,
  withScript,
  type ScriptBeat,
} from "../film-script.ts";
import { loadProject, savePayload } from "../project-io.ts";
import { asRecord, recordArtifact } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";

const MAX_BEATS = 20;
/** Rounding slack when the beats are compared with the film's length. */
const LENGTH_SLACK_S = 0.5;

/** Saves the script, shows it to the user as text and asks for approval with one tap question. */
export async function workshopSaveScript(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) {
    return { error: "item_id נדרש" };
  }
  const loaded = await loadProject(
    supabase,
    tenantId,
    itemId,
    assertClientAccess,
  );
  if ("error" in loaded) {
    return loaded;
  }
  const { payload } = loaded.project;
  const beats = timedBeats(args.beats);
  const refusal = beatsRefusal(beats, filmSeconds(payload));
  if (refusal) {
    return { error: refusal };
  }
  const title = String(args.title ?? "").trim() || loaded.project.title;
  const total = beats[beats.length - 1].end_s;
  const text = scriptText({ title, beats });
  const artifact = await recordArtifact(supabase, {
    tenantId,
    itemId,
    kind: "script",
    title: `תסריט · ${title}`,
    meta: { text, beats, total_s: total },
  });
  await savePayload(
    supabase,
    tenantId,
    itemId,
    withScript(payload, {
      artifact_id: artifact.id,
      title,
      total_s: total,
      beats,
    }),
  );
  return {
    success: true,
    total_s: total,
    beats: beats.length,
    artifact,
    // Shown as written and the turn ends: the user reads the script as text, and the tap line
    // is exactly the one the approval is read from.
    say_to_user: `${text}\n\n${SCRIPT_CHOICE}`,
    carmen_next:
      "התסריט הוצג למשתמש עם כפתורי אישור. עצרי. אחרי אישור: workshop_storyboard. ביקש שינוי: כתבי מחדש ושמרי שוב.",
    workshop: { event: "artifacts", item_id: itemId, artifact_id: artifact.id },
  };
}

/** The beats Carmen wrote, with their time ranges laid end to end from 0. */
function timedBeats(value: unknown): Array<ScriptBeat> {
  let start = 0;
  return (Array.isArray(value) ? value : [])
    .slice(0, MAX_BEATS)
    .map((entry) => {
      const beat = asRecord(entry);
      const length = Math.round((Number(beat.duration_s) || 0) * 10) / 10;
      const timed = {
        start_s: start,
        end_s: Math.round((start + length) * 10) / 10,
        narration: String(beat.narration ?? "").trim(),
        on_screen: String(beat.on_screen ?? "").trim(),
        visual: String(beat.visual ?? "").trim(),
      };
      start = timed.end_s;
      return timed;
    });
}

/** Why the script cannot be saved as written, or null when it fits the film. */
function beatsRefusal(beats: Array<ScriptBeat>, film: number | null) {
  if (beats.length === 0) {
    return "beats ריק: כל שורה בתסריט צריכה duration_s, narration או on_screen, ו-visual";
  }
  for (const [index, beat] of beats.entries()) {
    const length = beat.end_s - beat.start_s;
    if (length < 0.5) {
      return `שורה ${index + 1}: duration_s חייב להיות לפחות 0.5 שניות.`;
    }
    if (!beat.narration && !beat.on_screen) {
      return `שורה ${index + 1}: חסרים narration ו-on_screen.`;
    }
    const words = spokenWords(beat.narration);
    if (words > maxWords(length)) {
      return `שורה ${index + 1}: ${words} מילים בקריינות לא נכנסות ב-${length} שניות (עד ${maxWords(length)}). קצרי את השורה או הוסיפי לה זמן.`;
    }
  }
  const total = beats[beats.length - 1].end_s;
  if (film && Math.abs(total - film) > LENGTH_SLACK_S) {
    return `סכום השורות ${total} שניות, והסרט ${film} שניות. התאימי את duration_s כך שהסכום יהיה ${film}.`;
  }
  return null;
}
