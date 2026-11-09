// OpenAI's Chat Completions API hard-caps the tools array at 128 functions per
// request; Google/Anthropic allow far more. When targeting OpenAI with a larger
// toolset, drop low-priority niche tools first, then hard-slice as a last resort,
// so Carmen keeps her full daily toolkit and only sheds rarely-used extras.
/**
 * What to tell the user when a connected brain refuses Carmen's request. The
 * provider's own text is kept short; it never contains the key.
 */
export function connectedBrainHint(status: number, body: string): string {
  const tooLarge =
    status === 413 ||
    /request too large|tokens per minute|context length|maximum context/i.test(
      body,
    );
  if (tooLarge) {
    return "הבקשה של כרמן (כלים, ידע והיסטוריה) גדולה מהמכסה של המוח הזה. מכסה חינמית קטנה מדי לכרמן; נסו מודל או חשבון עם מכסה גדולה יותר.";
  }
  if (status === 429) {
    return "המוח הגיע למגבלת קצב. נסו שוב עוד רגע.";
  }
  if (status === 401 || status === 403) {
    return "המפתח של המוח נדחה. בדקו אותו בהגדרות המוחות.";
  }
  if (status >= 300 && status < 400) {
    return "כתובת המוח מפנה למקום אחר, וזה לא מותר.";
  }
  return body.replace(/\s+/g, " ").slice(0, 200);
}
