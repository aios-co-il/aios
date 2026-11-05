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
import {
  answerFor,
  REFERENCE,
  unanswered,
  type BriefAnswers,
} from "./brief-answers.ts";
import { readFirst } from "./brief-reading.ts";
import { autoBriefingGate } from "./briefing-auto.ts";

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
  /**
   * The questions were already shown to the user once. Until then a style or film brief that
   * Carmen wrote herself does not count: the user is asked first (only their answers count).
   */
  asked?: boolean;
  /**
   * Carmen already read the request for what it answers: the gate asked her to in this turn
   * (brief-reading.ts). Answers she sends on her own do not count. Until then the first questions are not shown: say_to_user goes out as is,
   * so she cannot leave out a question the user already answered.
   */
  read?: boolean;
  /** Automatic mode (workshop-mode.ts): Carmen writes the style and film brief, nobody is asked. */
  auto?: boolean;
}

export interface BriefingGate {
  needs_input: true;
  missing: ("style" | "film" | "engine")[];
  /** The message for the user, with the questions as buttons. Shown as is. */
  say_to_user: string;
  /** For Carmen only: what to do with the answers. Never shown to the user. */
  carmen_next: string;
  engines?: ReturnType<typeof engineOptions>;
  /** Asks Carmen to read the request first; the questions come on her next call. */
  reading?: true;
  /** Automatic mode: the gate is Carmen's to answer, with no question for the user. */
  carmen_continues?: true;
}

/** Returns what is still missing, or null when Carmen can go ahead. */
export function briefingGate(input: BriefingInput): BriefingGate | null {
  const answers = input.answers ?? {};
  // In automatic mode what Carmen writes counts as if the user had seen the questions.
  const asked = input.asked === true || input.auto === true;
  // Reference pictures are the look itself: every picture is generated from them.
  const hasReferences = input.look.references.length > 0;
  // Any other reference the brief names (a board picture, a video, a site): the user is not asked
  // about the style, Carmen writes the style bible from it (brief-reading.ts).
  const namedReference = answerFor(answers, REFERENCE);
  const hasBible = input.look.bible.trim().length > 0;
  const answered = (choices: Choice[]) =>
    choices.some((choice) => Boolean(answerFor(answers, choice.label)));
  const userStyle = answered(STYLE_CHOICES[input.kind]);
  const styleOk =
    input.needsStyle === false ||
    hasReferences ||
    (hasBible &&
      input.styleApproved &&
      (userStyle || asked || Boolean(namedReference)));
  // A film brief counts once the user answered the film questions or saw them once.
  const filmOk =
    input.kind !== "video" ||
    (input.look.film.trim().length > 0 && (answered(FILM_CHOICES) || asked));
  // The engine is never a question for the user: the best connected one is used.
  const askEngine = false;
  const missing: BriefingGate["missing"] = [];
  if (!styleOk) missing.push("style");
  if (!filmOk) missing.push("film");
  if (askEngine) missing.push("engine");
  if (missing.length === 0) return null;

  const choices: Choice[] = unanswered(
    [
      ...(missing.includes("style") && !namedReference
        ? STYLE_CHOICES[input.kind]
        : []),
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
    (namedReference && missing.includes("style")
      ? `. את הסגנון לא שואלים את המשתמש: יש רפרנס (${namedReference}). כתבי ממנו`
      : ". כתבי מהן") +
    " style_bible באנגלית שמתאר את המראה (דמות, מקום, צבעים, תאורה, סגנון רינדור), וקראי שוב לכלי עם style_bible ו-style_approved=true, ו-engine אם נבחר.";
  if (input.auto) {
    return autoBriefingGate(missing, fromAnswers);
  }
  if (choices.length === 0)
    return {
      needs_input: true,
      missing,
      say_to_user: "",
      carmen_next: fromAnswers,
    };
  if (input.asked !== true && input.read !== true) {
    return {
      needs_input: true,
      missing,
      say_to_user: "",
      carmen_next: readFirst(choices),
      reading: true,
    };
  }
  const intro =
    input.kind === "video"
      ? "לפני שאני כותבת את הסרט, כמה בחירות קצרות כדי שייצא בדיוק כמו שצריך:"
      : "לפני שאני מעצבת, כמה בחירות קצרות:";
  const reference =
    missing.includes("style") && !namedReference
      ? "\nיש תמונה או מודעה שאהבת? אפשר לצרף אותה כרפרנס."
      : "";
  return {
    needs_input: true,
    missing,
    say_to_user: [intro + reference, ...choices.map(choiceLine)].join("\n"),
    carmen_next:
      "שלחי למשתמש את say_to_user כמו שהוא, בלי להוסיף ובלי להסביר, ועצרי. התשובות שלו נשמרות לבריף של הפרויקט לבד. אם הוא ענה במילים חופשיות, העבירי אותן ב-brief_answers (נושא → תשובה). " +
      fromAnswers,
    ...(missing.includes("engine") && input.connected
      ? { engines: engineOptions(input.connected) }
      : {}),
  };
}
