import type { RunInputs } from "./contracts.ts";

/** Suppresses repeated streamed text while retaining the final-answer suffix. */
export function createLoopTextEmitter(
  emit: RunInputs["emit"],
  emittedTexts: Array<string>,
) {
  function emitText(text: string) {
    const key = text.trim();
    if (!emit || !key || emittedTexts.includes(key)) {
      return;
    }
    // A final answer that opens with texts already sent adds only the rest.
    let fresh = key;
    for (const sent of emittedTexts) {
      if (fresh.startsWith(sent)) {
        fresh = fresh.slice(sent.length).trim();
      }
    }
    emittedTexts.push(key);
    if (!fresh) {
      return;
    }
    emit({
      type: "token",
      content: emittedTexts.length > 1 ? `\n\n${fresh}` : fresh,
    });
  }
  return emitText;
}
