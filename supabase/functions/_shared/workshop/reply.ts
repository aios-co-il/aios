/**
 * When the model ends a turn after workshop tools without saying anything, the user sees a row of
 * tool names and silence. This says what the last tool reported instead.
 */

export interface ToolLogEntry {
  tool: string;
  result?: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function fallbackReply(log: ToolLogEntry[]): string | null {
  const workshop = log.filter((entry) => entry.tool.startsWith("workshop_"));
  const last = workshop[workshop.length - 1];
  if (!last) return null;
  const result = asRecord(last.result);
  if (typeof result.error === "string" && result.error)
    return `לא הצלחתי להשלים: ${result.error}`;
  if (typeof result.message === "string" && result.message)
    return result.message;
  return "הפעולה רצה, אבל לא קיבלתי סיכום ממנה. מה שנוצר מופיע בלוח, ואם משהו חסר אפשר לבקש ממני לבדוק את מצב הפרויקט.";
}
