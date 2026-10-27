/**
 * How a film sounds beyond its voice: the music bed's prompt for ElevenLabs Music, and whether
 * the render adds trailer-style sound design (a whoosh at each cut, a low hit on the opening
 * title and on the end card; render-worker jobs/sound-effects.mjs). Both follow the film brief
 * (workshop_look.film and the brief's answers) and what the user wrote. Plain TypeScript.
 */
import { answerFor, briefAnswersOf } from "./brief-answers.ts";
import { lookOf } from "./look.ts";

/** A trailer, a cinematic cut or sound design asked for in the brief or by the user. */
const SOUND_DESIGN =
  /טריילר|trailer|קולנוע|cinematic|sound ?design|סאונד ?דיזיין|עיצוב (סאונד|קול|שמע)|אפקטי(ם|) (סאונד|קול|שמע)|אפקטים קוליים|sound ?effects?|\bsfx\b|whoosh|ווש/i;
const TRAILER = /טריילר|trailer|אקשן|action (music|film|movie|score)/i;
/** "Not over the top": the user wants it held back. */
const RESTRAINED =
  /לא מוגז|לא מעל|לא להגזים|בלי להגזים|בלי הגזמה|לא מתלהב|מאופק|עדי[ןנ]|מינימלי|לא רועש|subtle|restrained|understated|tasteful|not over the top|not too much/i;
const NO_EFFECTS =
  /בלי (אפקטים|סאונד דיזיין|עיצוב סאונד)|ללא אפקטים|no (sound )?effects|no sfx/i;

/** Mood words of the brief's music and pace answers, in the words a music model reads. */
const MOODS: [RegExp, string][] = [
  [/קולנוע|cinematic|\bepic\b/i, "cinematic"],
  [/אלקטרונ|electronic/i, "electronic"],
  [/אקוסטי|acoustic/i, "warm acoustic"],
  [/תזמורת|orchestral/i, "orchestral"],
  [/אנרגטי|מהיר|קצבי|energetic|upbeat/i, "upbeat and energetic"],
  [/רגוע|רגשי|calm|emotional/i, "calm and emotional"],
  [/מצחיק|קליל|playful|\blight\b/i, "playful and light"],
  [/מעורר השראה|השראה|inspir/i, "inspiring"],
];

export const DEFAULT_MUSIC_PROMPT =
  "Instrumental commercial bed matching the storyboard, no vocals and no lyrics.";

const briefTexts = (payload: Record<string, unknown>, userText = "") => {
  const answers = briefAnswersOf(payload);
  return {
    music: answerFor(answers, "מוזיקה"),
    pace: answerFor(answers, "קצב"),
    film: lookOf(payload).film,
    user: userText,
  };
};

/**
 * True when the film should get trailer sound design: the user's choice (the tool argument)
 * wins, then the user's message, then the film brief.
 */
export function wantsSoundDesign(
  payload: Record<string, unknown>,
  input: { choice?: unknown; userText?: string | null } = {},
): boolean {
  if (typeof input.choice === "boolean") return input.choice;
  const user = String(input.userText ?? "");
  if (NO_EFFECTS.test(user)) return false;
  const { music, pace, film } = briefTexts(payload);
  return [user, music, pace, film].some((text) => SOUND_DESIGN.test(text));
}

/** The ElevenLabs Music prompt for the film's bed, in English, from the brief. */
export function musicPromptFor(
  payload: Record<string, unknown>,
  userText = "",
): string {
  const { music, pace, film, user } = briefTexts(payload, userText);
  const all = [music, pace, film, user].join(" \n ");
  const sound = [music, film, user].join(" \n ");
  const held = RESTRAINED.test(sound) || /רגוע|calm/i.test(all);
  const lines: string[] = [];
  if (TRAILER.test(sound))
    lines.push(
      held
        ? "Restrained cinematic trailer score: a steady low pulse, deep strings, soft synth swells and sparse percussion hits that build tension and momentum without ever turning bombastic, loud or over the top."
        : "Cinematic action-trailer score: driving percussion, deep strings, rising tension and a confident build.",
    );
  else {
    const moods = MOODS.filter(([pattern]) => pattern.test(all)).map(
      ([, mood]) => mood,
    );
    if (moods.length === 0) return DEFAULT_MUSIC_PROMPT;
    lines.push(
      `Instrumental commercial music bed, ${[...new Set(moods)].join(", ")}${held ? ", restrained and understated" : ""}.`,
    );
  }
  lines.push(
    "Instrumental only: no vocals, no lyrics, no spoken words. It plays under a Hebrew voice-over, so it leaves room for the voice.",
  );
  return lines.join(" ");
}
