/**
 * A film's script: written after the concept is chosen and approved by the user before any scene.
 * David saw the script only as a storyboard table on Staging (4 Nov), and it was weak; now the
 * copywriter writes it beat by beat, the user approves it, and the storyboard is built from it.
 * Kept on the project (payload.workshop_script) so routing, the turn note and the storyboard read
 * the same state; a new script starts unapproved, so an approval never carries over to new text.
 */

import { isExplicitApprovalPhrase } from "../wa-approval-flow.ts";
import { answerFor, briefAnswersOf } from "./brief-answers.ts";
import { asRecord } from "./record.ts";
import { tappedAnswers } from "./tapped-answers.ts";

const KEY = "workshop_script";
export const SCRIPT_LABEL = "התסריט";
export const APPROVE_SCRIPT = "התסריט מאושר";
export const CHANGE_SCRIPT = "לתקן";
/** The tap question that ends every script Carmen shows (save-script.ts sends it). */
export const SCRIPT_CHOICE = `[[בחירה: ${SCRIPT_LABEL} | ${APPROVE_SCRIPT} | ${CHANGE_SCRIPT}]]`;
/** Hebrew voice-over pace: narration longer than this runs past its beat. */
export const WORDS_PER_SECOND = 2.5;

/** How the copywriter writes a film script; the save tool and the script gate both say it. */
export const SCRIPT_GUIDE =
  "איך כותבים: הוק ב-1 עד 2 השניות הראשונות. רעיון אחד בכל שורה. משפטים קצרים שנשמעים טבעי בקול. הטקסט על המסך קצר (עד 5 מילים) ולא חוזר על הקריינות. מהלך ברור: בעיה, תובנה, פתרון, ובסוף קריאה לפעולה אחת לפי הסגיר שנבחר. בקול של המותג, בלי קלישאות ובלי מילות מילוי. האורך מדויק: סכום השניות שווה לאורך הסרט, ובכל שורה עד 2.5 מילים לשנייה. פנייה לצופים ולמשתמש בלשון ניטרלית או ברבים (״אפשר לבחור״, ״קחו״), לא ״תבחרי״ או ״תבחר״.";

export interface ScriptBeat {
  start_s: number;
  end_s: number;
  narration: string;
  on_screen: string;
  visual: string;
}

export interface FilmScript {
  artifact_id: string;
  title: string;
  total_s: number;
  beats: Array<ScriptBeat>;
  approved: boolean;
}

export type ScriptState = FilmScript | { skipped: true } | null;

/** The project's script as stored: a script, the user's explicit skip, or nothing yet. */
export function filmScriptOf(payload: Record<string, unknown>): ScriptState {
  const stored = asRecord(payload[KEY]);
  if (stored.skipped === true) {
    return { skipped: true };
  }
  const beats = (Array.isArray(stored.beats) ? stored.beats : []).map(
    (beat) => {
      const row = asRecord(beat);
      return {
        start_s: Number(row.start_s) || 0,
        end_s: Number(row.end_s) || 0,
        narration: String(row.narration ?? ""),
        on_screen: String(row.on_screen ?? ""),
        visual: String(row.visual ?? ""),
      };
    },
  );
  if (typeof stored.artifact_id !== "string" || beats.length === 0) {
    return null;
  }
  return {
    artifact_id: stored.artifact_id,
    title: String(stored.title ?? ""),
    total_s: Number(stored.total_s) || 0,
    beats,
    approved: stored.approved === true,
  };
}

/** A new script on the project: unapproved until the user says so. */
export const withScript = (
  payload: Record<string, unknown>,
  script: Omit<FilmScript, "approved">,
) => ({ ...payload, [KEY]: { ...script, approved: false } });

/** The user skipped the script step (their own full script, or asked to go straight to scenes). */
export const withScriptSkipped = (payload: Record<string, unknown>) => ({
  ...payload,
  [KEY]: { skipped: true },
});

/** The stored script, approved. A project without a script is returned as it is. */
export function withScriptApproved(payload: Record<string, unknown>) {
  const script = filmScriptOf(payload);
  if (!script || "skipped" in script || script.approved) {
    return payload;
  }
  return {
    ...payload,
    [KEY]: { ...asRecord(payload[KEY]), approved: true },
  };
}

/** Script approved, or skipped by the user: the storyboard may be written. */
export function scriptSettled(payload: Record<string, unknown>) {
  const script = filmScriptOf(payload);
  return script !== null && ("skipped" in script || script.approved);
}

/** The user tapped approval on Carmen's script question in this turn ("לתקן" is not one). */
export function scriptApprovedByTap(lastAssistant: string, userText: string) {
  return Object.entries(tappedAnswers(lastAssistant, userText)).some(
    ([label, answer]) => label.includes("תסריט") && approves(answer),
  );
}

const approves = (answer: string) =>
  answer.trim() === APPROVE_SCRIPT ||
  /^(מאשר|מאשרת|מאשרים|מאושר)/.test(answer.trim()) ||
  isExplicitApprovalPhrase(answer);

/**
 * The film's length in seconds: the brief's length answer ("15 שניות"), else the length the
 * project was planned with; null when neither is known.
 */
export function filmSeconds(payload: Record<string, unknown>): number | null {
  const answer = answerFor(briefAnswersOf(payload), "אורך");
  if (/(?<![א-ת])דקה(?![א-ת])/.test(answer)) {
    return 60;
  }
  const said = answer.match(/(\d+(?:\.\d+)?)\s*(?:שנ|ש׳|ש'|sec|s\b)/i);
  if (said) {
    return Number(said[1]);
  }
  const planned = Number(
    asRecord(asRecord(payload.workshop).film).totalSeconds,
  );
  return planned > 0 ? planned : null;
}

/** Words in a spoken line (punctuation alone is not a word). */
export const spokenWords = (text: string) =>
  text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

/** The most words a beat of this length can say. */
export const maxWords = (seconds: number) =>
  Math.max(1, Math.floor(seconds * WORDS_PER_SECOND));

const seconds = (value: number) => `${Math.round(value * 10) / 10}`;

/** The script as the user reads it: each beat's time, voice-over, on-screen text and visual. */
export function scriptText(script: Pick<FilmScript, "title" | "beats">) {
  const beats = script.beats.map((beat) =>
    [
      `${seconds(beat.start_s)}–${seconds(beat.end_s)} שנ׳`,
      beat.narration ? `קריינות: ${beat.narration}` : "",
      beat.on_screen ? `על המסך: ${beat.on_screen}` : "",
      beat.visual ? `רואים: ${beat.visual}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return [`תסריט · ${script.title}`, ...beats].join("\n\n");
}

/** The payload with the stored script approved when the user tapped approval in this turn. */
export function withTappedScriptApproval(
  payload: Record<string, unknown>,
  turn: { lastAssistant: string; userText: string },
) {
  return scriptApprovedByTap(turn.lastAssistant, turn.userText)
    ? withScriptApproved(payload)
    : payload;
}

/** Where the film's script stands, for the turn note of a film with no scenes yet. */
export function scriptLines(
  payload: Record<string, unknown>,
  scenes: number,
): Array<string> {
  if (scenes > 0 || payload.workshop_edit === true) {
    return [];
  }
  const script = filmScriptOf(payload);
  if (!script) {
    return [
      "תסריט: עוד אין. אחרי בחירת הקונספט כותבים תסריט (workshop_save_script), והמשתמש מאשר אותו לפני הסטוריבורד.",
    ];
  }
  if ("skipped" in script) {
    return [];
  }
  return [
    script.approved
      ? "תסריט: אושר. הסטוריבורד נבנה ממנו, סצנה אחת לכל שורה."
      : "תסריט: ממתין לאישור המשתמש. אין סצנות עד שהוא מאשר; בקשת שינוי: כתבי מחדש ושמרי שוב ב-workshop_save_script.",
  ];
}
