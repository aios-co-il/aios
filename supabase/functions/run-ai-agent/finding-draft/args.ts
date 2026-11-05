/**
 * A finding-draft tool's arguments read against the person's own reply
 * (confirm_finding_draft, approve_card_draft): the code they typed decides,
 * never one the model read elsewhere (history, tool output).
 */

export type ToolResult = Record<string, unknown>;

/** The code the person typed, unless the model asks for another one; null without a typed code. */
export function typedCode(
  written: number | null,
  asked: unknown,
): number | null {
  const code = shortCodeOf(asked);
  return written !== null && (code === null || code === written)
    ? written
    : null;
}

/** A refusal Carmen reads back to the person. */
export function refuse(error: string, message: string): ToolResult {
  return { success: false, error, message };
}

/** A positive integer code from a number or text such as "#123". */
function shortCodeOf(raw: unknown): number | null {
  const code = Number(
    String(raw ?? "")
      .replace(/^#/, "")
      .trim(),
  );
  return Number.isInteger(code) && code > 0 ? code : null;
}
