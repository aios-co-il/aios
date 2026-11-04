/**
 * When the model ends a turn after workshop tools without saying anything or taking the next step,
 * the user sees a row of tool names and silence. First the model is asked once to continue; if it
 * still says nothing, the user hears what the last tool actually reported.
 */

export interface ToolLogEntry {
  tool: string;
  result?: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const SILENT_TURN_NUDGE =
  "(הודעת מערכת) סיימת את התור בלי לענות ובלי לבצע את הבקשה. המשתמש ביקש משהו ברור: המשיכי עכשיו לשלב הבא בעצמך. אם הבקשה ברורה, קראי לכלי היצירה המתאים (הוא יחזור אליך עם עלות לאישור אם צריך). אם באמת חסר פרט אחד, שאלי עליו שאלה אחת קצרה. אל תבקשי מהמשתמש לכתוב את הבקשה מחדש.";

/** Workshop tools ran, but none of them moved the work forward or reported an outcome. */
export function shouldNudgeSilentTurn(log: ToolLogEntry[]): boolean {
  const workshop = log.filter((entry) => entry.tool.startsWith("workshop_"));
  if (workshop.length === 0) return false;
  return !workshop.some((entry) => {
    const result = asRecord(entry.result);
    return (
      result.started === true ||
      result.already_running === true ||
      result.needs_budget === true ||
      result.needs_input === true ||
      (typeof result.error === "string" && !!result.error)
    );
  });
}

const reportsProgress = (result: Record<string, unknown>) =>
  result.started === true ||
  result.already_running === true ||
  result.needs_budget === true ||
  result.needs_input === true;

/** Tools that only read the project: they never carry the outcome of the turn. */
const READ_ONLY = new Set(["workshop_get_state", "workshop_check_connections"]);

const textOf = (value: unknown) =>
  typeof value === "string" && value ? value : null;

/**
 * The round limit stopped the turn mid-work: every round ran and the last one ended on tool
 * results the model never saw back.
 */
export function stoppedAtStepLimit(
  roundsRun: number,
  maxRounds: number,
  lastRole: string | undefined,
): boolean {
  return roundsRun >= maxRounds && lastRole === "tool";
}

/** Why the turn ended without text: `outOfSteps` when the round limit stopped it mid-work. */
export interface FallbackContext {
  outOfSteps?: boolean;
}

/**
 * The user's reply when the model said nothing: the outcome the last workshop tool reported,
 * else a plain note that says whether the step limit stopped the work. The server cannot tell
 * the user's gender, so the note addresses them in neutral Hebrew ("אפשר לכתוב").
 */
export function fallbackReply(
  log: Array<ToolLogEntry>,
  context: FallbackContext = {},
): string | null {
  const workshop = log.filter((entry) => entry.tool.startsWith("workshop_"));
  if (workshop.length === 0) return null;
  // The latest tool that did something; a status check after it says nothing new.
  const telling =
    [...workshop].reverse().find((entry) => !READ_ONLY.has(entry.tool)) ??
    workshop[workshop.length - 1];
  const result = asRecord(telling.result);
  const error = textOf(result.error);
  if (error) return `לא הצלחתי להשלים: ${error}`;
  // A question or a budget request carries the user's message ready to send.
  const say = textOf(result.say_to_user);
  if (say) return say;
  if (reportsProgress(result)) {
    // message is written for Carmen; user_message, when there is one, for the user.
    const text = textOf(result.user_message) ?? textOf(result.message);
    if (text) return text;
  }
  return context.outOfSteps
    ? "עצרתי באמצע: הגעתי למספר הצעדים המרבי לתור אחד. אפשר לכתוב לי 'תמשיכי' ואמשיך מאותה נקודה."
    : "לא הצלחתי להתקדם בבקשה הזו. אפשר לכתוב לי 'תמשיכי' ואמשיך משם.";
}
