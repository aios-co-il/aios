/**
 * What the briefing reads from the turn before it asks anything: the reference the user gave now,
 * and whether Carmen already read the request for what it answers (briefing.ts, project-io.ts).
 */
import { briefReadTurn, REFERENCE } from "./brief-answers.ts";
import type { Choice } from "./briefing-choices.ts";
import type { WorkshopDeps } from "./gate.ts";

export interface TurnReference {
  /** Kept as the brief's רפרנס answer, which the user sees in the project brief. */
  answer: string;
  /** A picture the generation follows: it joins the project's reference pictures. */
  picture: string | null;
}

/**
 * The reference the user gave in this turn: a board picture the film is built from, an attached
 * image, or a link to an image or video file. A site or document link is not a look by itself;
 * Carmen passes it as a "רפרנס" answer when the user meant it as one.
 */
export function referenceThisTurn(
  args: Record<string, unknown>,
  userText: string,
): TurnReference | null {
  const fromArtifact =
    typeof args.from_artifact_id === "string" && args.from_artifact_id.trim();
  if (fromArtifact) {
    // The board picture is the film's source picture already (storyboard-source.ts).
    return { answer: "תמונה מהלוח", picture: null };
  }
  const attached = userText.match(ATTACHED_IMAGE);
  if (attached) {
    // The link is a long signed address; the user reads the file's name in the brief.
    const answer = `תמונה שצורפה: ${attached[1]}`.slice(0, MAX_ANSWER);
    return { answer, picture: attached[2] };
  }
  const image = userText.match(IMAGE_LINK)?.[0];
  if (image) {
    return { answer: image.slice(0, MAX_ANSWER), picture: image };
  }
  const video = userText.match(VIDEO_LINK)?.[0];
  return video ? { answer: video.slice(0, MAX_ANSWER), picture: null } : null;
}

/**
 * Whether Carmen read the request before the first questions: the gate already asked her to in
 * this turn. Asked once per turn, so the flow cannot loop; a tool
 * that cannot keep that mark (no save) never asks.
 */
export function readRequest(
  payload: Record<string, unknown>,
  args: Record<string, unknown>,
  deps: WorkshopDeps,
  canSave: boolean,
): boolean {
  // Answers Carmen sends on her own (a tapped concept, the ending) don't mean she read the
  // request: on Staging she passed those and the look the request named was asked again.
  return !canSave || briefReadTurn(payload) === turnKey(deps);
}

/**
 * Before the first questions: Carmen passes what the request (and any reference) already settles,
 * so only the open questions reach the user (briefing.ts asks this once per turn).
 */
export function readFirst(choices: Array<Choice>): string {
  const open = choices
    .map((choice) => `${choice.label} (${choice.options.join(" / ")})`)
    .join("; ");
  return [
    "עוד לא לשלוח כלום למשתמש. קודם קראי שוב לאותו כלי, עם אותם ארגומנטים ועם brief_answers (נושא → תשובה) לכל שאלה שהבקשה של המשתמש או הרפרנס שלו כבר עונים עליה, כדי שלא יישאל עליה.",
    `השאלות הפתוחות: ${open}.`,
    'רק מה שנאמר במפורש או נראה ברפרנס: "מושן גרפיק" → {"מראה": "מושן גרפיקס"}. "עם קריינות" לבד לא קובע אם קריין או קריינית, אז קול נשאר פתוח.',
    `אם המשתמש צירף, סימן או הפנה לרפרנס (תמונה, מודעה, עמוד בלוח, אתר, סרטון), העבירי ב-brief_answers {"${REFERENCE}": "מה הרפרנס ואיפה"}: עם רפרנס לא שואלים על הסגנון. קישור לתמונה עובר גם ב-reference_urls. סרטון רפרנס יכול לענות גם על קצב, קול, מוזיקה וסיום.`,
    'רק אם המשתמש עצמו כתב בבקשה את הקונספט או התסריט של הסרט, העבירי גם {"קונספט": "הקונספט במילים שלו"}. קונספט שאת ממציאה לא עובר כאן: הוא לא נשמר, והמשתמש בוחר קונספט אחרי שהוא רואה אותם.',
    'אם הבקשה לא עונה על אף שאלה: brief_answers={"none": "none"}.',
  ].join(" ");
}

/** The turn the reading mark belongs to; calls without a turn id share one mark. */
export const turnKey = (deps: WorkshopDeps) => deps.turnId ?? "no-turn";

/** Brief answers are capped at this length (brief-answers.ts). */
const MAX_ANSWER = 200;
/** commandCenterAttachments.ts writes an attached image as "- תמונה: name → url". */
const ATTACHED_IMAGE = /^-\s*תמונה:\s*(.*?)\s*→\s*(https?:\/\/\S+)/m;
const IMAGE_LINK =
  /https?:\/\/[^\s)\]]+\.(?:png|jpe?g|gif|webp|avif)(?:\?[^\s)\]]*)?/i;
const VIDEO_LINK = /https?:\/\/[^\s)\]]+\.(?:mp4|mov|webm)(?:\?[^\s)\]]*)?/i;
