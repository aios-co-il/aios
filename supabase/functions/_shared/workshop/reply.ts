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

export function fallbackReply(log: ToolLogEntry[]): string | null {
  const workshop = log.filter((entry) => entry.tool.startsWith("workshop_"));
  const last = workshop[workshop.length - 1];
  if (!last) return null;
  const result = asRecord(last.result);
  if (typeof result.error === "string" && result.error)
    return `לא הצלחתי להשלים: ${result.error}`;
  // A question or a budget request carries the user's message ready to send.
  if (typeof result.say_to_user === "string" && result.say_to_user)
    return result.say_to_user;
  const reports =
    result.started === true ||
    result.already_running === true ||
    result.needs_budget === true ||
    result.needs_input === true;
  if (reports && typeof result.message === "string" && result.message)
    return result.message;
  return "לא הצלחתי להתקדם בבקשה הזו. כתבי לי 'תמשיכי' ואני אמשיך משם.";
}
