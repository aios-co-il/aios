/**
 * A scene's motion prompt without the sentences that ask for on-screen text. The film's editor
 * (Remotion) draws every caption; a video model asked for text draws garbled letters. On Staging
 * (2 Nov) motion prompts asking for "Hebrew overlay text floating in the water" came back with
 * unreadable pseudo-Hebrew, although every clip prompt ends with the no-text rule.
 */

/** Words that ask a video model to draw text, in English and Hebrew. */
const TEXT_WORDS =
  /\b(?:text|texts|letters?|lettering|captions?|subtitles?|titles?|overlays?|typography|slogans?|logos?|hebrew)\b|טקסט|כיתוב|כתובית|כותרת/i;

/** Sentences and clauses (split at . ! ? and ;) of `prompt` that do not ask for text. */
export function textlessMotion(prompt) {
  return String(prompt ?? "")
    .split(/(?<=[.!?;])\s+/)
    .filter((part) => part.trim() && !TEXT_WORDS.test(part))
    .join(" ")
    .trim();
}
