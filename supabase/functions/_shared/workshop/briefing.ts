/**
 * What Carmen must know before she spends money on pictures: which engine makes them (when the
 * tenant has more than one) and what the project should look like. The tools return this as a
 * question list instead of generating, so the briefing cannot be skipped.
 */

import { PROVIDER_LABEL } from "./capabilities.ts";
import type { ImageProvider } from "./image-providers.ts";
import type { ProjectLook } from "./look.ts";
import {
  choiceLine,
  FILM_CHOICES,
  STYLE_CHOICES,
  type Choice,
} from "./briefing-choices.ts";
import { unanswered, type BriefAnswers } from "./brief-answers.ts";

export const ENGINE_NOTES: Record<ImageProvider, string> = {
  google:
    "Nano Banana Pro של Google: הכי טוב בעקיבות אחרי רפרנסים ובשמירה על אותה דמות, כולל טקסט קריא בתמונה",
  elevenlabs:
    "אותו מודל של Google דרך ElevenLabs: אותה איכות ועקיבות לרפרנסים, ומחויב בחשבון ElevenLabs",
  higgsfield:
    "Higgsfield Soul 2: מראה צילומי ואופנתי חזק, מקבל רפרנס תמונה אחד בלבד",
  openai:
    "OpenAI (gpt-image-2.5): איכות גבוהה ופרשנות טובה לתיאורים, פחות עקבי בדמות בין סצנות",
};

export const engineOptions = (connected: ImageProvider[]) =>
  connected.map((id) => ({
    id,
    label: PROVIDER_LABEL[id],
    note: ENGINE_NOTES[id],
  }));

export interface BriefingInput {
  look: Pick<ProjectLook, "bible" | "references" | "film">;
  styleApproved: boolean;
  connected: ImageProvider[] | null;
  engine: ImageProvider | null;
  kind: "video" | "static";
  needsEngine: boolean;
  /** Editing the user's own footage: the look is the footage, only the film brief is asked. */
  needsStyle?: boolean;
  /** What the user already answered (payload.workshop_brief); answered questions are not asked again. */
  answers?: BriefAnswers;
}

export interface BriefingGate {
  needs_input: true;
  missing: ("style" | "film" | "engine")[];
  /** The message for the user, with the questions as buttons. Shown as is. */
  say_to_user: string;
  /** For Carmen only: what to do with the answers. Never shown to the user. */
  carmen_next: string;
  engines?: ReturnType<typeof engineOptions>;
}

/** Returns what is still missing, or null when Carmen can go ahead. */
export function briefingGate(input: BriefingInput): BriefingGate | null {
  const hasReferences = input.look.references.length > 0;
  const hasBible = input.look.bible.trim().length > 0;
  const styleOk =
    input.needsStyle === false ||
    hasReferences ||
    (hasBible && input.styleApproved);
  // The engine is never a question for the user: the best connected one is used.
  const askEngine = false;
  const missing: BriefingGate["missing"] = [];
  if (!styleOk) missing.push("style");
  if (input.kind === "video" && !input.look.film.trim()) missing.push("film");
  if (askEngine) missing.push("engine");
  if (missing.length === 0) return null;

  const answers = input.answers ?? {};
  const choices: Choice[] = unanswered(
    [
      ...(missing.includes("style") ? STYLE_CHOICES[input.kind] : []),
      ...(missing.includes("film") ? FILM_CHOICES : []),
      ...(missing.includes("engine") && input.connected
        ? [
            {
              label: "מנוע תמונות",
              options: input.connected.map((id) => PROVIDER_LABEL[id]),
            },
          ]
        : []),
    ],
    answers,
  );
  const answeredLines = Object.entries(answers)
    .map(([label, answer]) => `${label}: ${answer}`)
    .join("; ");
  const fromAnswers =
    "התשובות נשמרו בבריף של הפרויקט" +
    (answeredLines ? ` (${answeredLines})` : "") +
    ". כתבי מהן style_bible באנגלית שמתאר את המראה (דמות, מקום, צבעים, תאורה, סגנון רינדור), וקראי שוב לכלי עם style_bible ו-style_approved=true, ו-engine אם נבחר.";
  if (choices.length === 0)
    return {
      needs_input: true,
      missing,
      say_to_user: "",
      carmen_next: fromAnswers,
    };
  const intro =
    input.kind === "video"
      ? "לפני שאני כותבת את הסרט, כמה בחירות קצרות כדי שייצא בדיוק כמו שצריך:"
      : "לפני שאני מעצבת, כמה בחירות קצרות:";
  const reference = missing.includes("style")
    ? "\nיש תמונה או מודעה שאהבת? אפשר לצרף אותה כרפרנס."
    : "";
  return {
    needs_input: true,
    missing,
    say_to_user: [intro + reference, ...choices.map(choiceLine)].join("\n"),
    carmen_next:
      "שלחי למשתמש את say_to_user כמו שהוא, בלי להוסיף ובלי להסביר, ועצרי. אם המשתמש כבר ענה על חלק מהבחירות בבקשה שלו, השמיטי את השורות האלה. התשובות שלו נשמרות לבריף של הפרויקט לבד. אם הוא ענה במילים חופשיות, העבירי אותן ב-brief_answers (נושא → תשובה). " +
      fromAnswers,
    ...(missing.includes("engine") && input.connected
      ? { engines: engineOptions(input.connected) }
      : {}),
  };
}
