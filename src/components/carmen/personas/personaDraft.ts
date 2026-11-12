import type { CarmenPersona, PersonaDraft } from "./carmenPersonas";
import { callWordProblem } from "../../../../supabase/functions/_shared/carmen/personas";

/** What removing the stored row does: drop a creation, or fall back a level. */
export function deleteLabel(
  persona: CarmenPersona | null,
  isOwn: boolean,
): string {
  if (!persona?.builtinKey) {
    return "מחיקת הדמות";
  }
  return isOwn ? "חזרה לגרסת הארגון" : "חזרה לברירת המחדל";
}

/** The form starts from the character's values, or empty for a new one. */
export function initialDraft(persona: CarmenPersona | null): PersonaDraft {
  return {
    displayName: persona?.displayName ?? "",
    callWords: persona?.callWords ?? [],
    introLine: persona?.introLine ?? "",
    look: persona?.look ?? "minime",
    mood: persona?.mood ?? null,
    personality: persona?.personality ?? "",
    soul: persona?.soul ?? "",
    writingStyle: persona?.writingStyle ?? "",
  };
}

/** The first refused call word, as "word: reason", or null when all are fine. */
export function firstCallWordProblem(words: Array<string>): string | null {
  for (const word of words) {
    const problem = callWordProblem(word);
    if (problem) {
      return `"${word}": ${problem}`;
    }
  }
  return null;
}
