/**
 * workshop_save_script: the film's script as a page on the board, beat by beat. Its own tool, not
 * workshop_save_copy: a script has timed beats that must add up to the film's length and
 * narration that fits its time, and the storyboard gate reads it back (film-script.ts).
 */

import {
  filmSeconds,
  scriptText,
  withScript,
  withScriptApproved,
  type ScriptBeat,
} from "../film-script.ts";
import type { Db } from "../db.ts";
import { loadProject, savePayload } from "../project-io.ts";
import { asRecord, recordArtifact } from "../record.ts";
import { SCRIPT_CHOICE } from "../script-approval.ts";
import { type ToolContext } from "../tool-context.ts";
import { isAutoMode } from "../workshop-mode.ts";
import { beatsRefusal } from "./beats-refusal.ts";
import { scriptSaveStop } from "./save-script-guards.ts";

const MAX_BEATS = 20;

/**
 * Saves the script, shows it to the user as text and asks for approval with one tap question;
 * scriptSaveStop answers instead when there is no chosen concept or nothing new to save.
 */
export async function workshopSaveScript(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess, deps } = ctx;
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
  const stop = scriptSaveStop(payload, beats, deps);
  if (stop) {
    return stop;
  }
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
  const saved = withScript(payload, {
    artifact_id: artifact.id,
    title,
    total_s: total,
    beats,
    saved_turn: deps.turnId ?? null,
  });
  // In automatic mode the script counts as approved once saved (workshop-mode.ts).
  const auto = isAutoMode(payload);
  const script = auto ? withScriptApproved(saved, null) : saved;
  try {
    await savePayload(supabase, tenantId, itemId, script);
  } catch (error) {
    // A page whose script the project does not hold would show a script nobody can approve.
    await removePage(supabase, tenantId, artifact.id);
    return {
      error: error instanceof Error ? error.message : "שמירת התסריט נכשלה",
    };
  }
  return {
    success: true,
    total_s: total,
    beats: beats.length,
    artifact,
    ...(auto ? AUTO_SAVED : askApproval(text)),
    workshop: { event: "artifacts", item_id: itemId, artifact_id: artifact.id },
  };
}

/**
 * Semi-automatic: shown as written and the turn ends; the user reads the script as text, and the
 * tap line is exactly the one the approval is read from.
 */
const askApproval = (text: string) => ({
  say_to_user: `${text}\n\n${SCRIPT_CHOICE}`,
  carmen_next:
    "התסריט הוצג למשתמש עם כפתורי אישור. עצרי. אחרי אישור: workshop_storyboard. ביקש שינוי: כתבי מחדש ושמרי שוב.",
});

/** Automatic mode: the script is approved as saved, and Carmen goes on to the storyboard. */
const AUTO_SAVED = {
  approved: true,
  say_to_user: "",
  carmen_continues: true,
  carmen_next:
    "מצב אוטומטי: התסריט נשמר ונחשב מאושר. המשיכי מיד ל-workshop_storyboard, סצנה אחת לכל שורה בתסריט.",
};

/** Removes a script page saved before its project write failed; a failure here is logged. */
async function removePage(supabase: Db, tenantId: string, artifactId: string) {
  const { error } = await supabase
    .from("workshop_artifacts")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", artifactId);
  if (error) {
    console.error("[workshop] orphan script page", artifactId, error.message);
  }
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
