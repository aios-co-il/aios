/**
 * The user's line when the film goes to production. In automatic mode it also names what Carmen
 * chose on her own (the concept, the script, the voice), so the user hears it even when her own
 * closing line says nothing, and they can ask to redo any of it.
 */

import { briefAnswersOf } from "../brief-answers.ts";
import { conceptAnswer, filmScriptOf } from "../film-script.ts";
import { findVoice } from "../voices.ts";
import { isAutoMode } from "../workshop-mode.ts";

export interface AutoChoices {
  concept?: string;
  script?: string;
  voice?: string;
}

const STARTED = "ההפקה התחילה ורצה ברקע. הסרט יופיע בלוח כשיהיה מוכן.";

/** The production's user_message, plus Carmen's choices in automatic mode (the user chose in semi). */
export function autoChoices(
  payload: Record<string, unknown>,
  voiceId: string | null | undefined,
): { user_message: string; auto_choices?: AutoChoices; carmen_next?: string } {
  if (!isAutoMode(payload)) {
    return { user_message: STARTED };
  }
  const script = filmScriptOf(payload);
  const choices: AutoChoices = {
    concept: conceptAnswer(briefAnswersOf(payload)) || undefined,
    script: script && !("skipped" in script) ? script.title : undefined,
    voice: findVoice(voiceId)?.name,
  };
  return {
    user_message: `${STARTED}${choicesLine(choices)}`,
    auto_choices: choices,
    carmen_next:
      "מצב אוטומטי: בתשובה שלך ספרי למשתמש בקצרה מה בחרת בעצמך (auto_choices: קונספט, תסריט, קול), ושאפשר לבקש לשנות כל אחד מהם.",
  };
}

/** "בחרתי: קונספט …; תסריט …; קול …" for the choices made, or nothing when none is known. */
function choicesLine(choices: AutoChoices) {
  const parts = [
    choices.concept ? `קונספט "${choices.concept}"` : null,
    choices.script ? `תסריט "${choices.script}"` : null,
    choices.voice ? `קול ${choices.voice}` : null,
  ].filter(Boolean);
  return parts.length > 0
    ? `\nבחרתי לבד: ${parts.join("; ")}. אפשר לבקש לשנות כל אחד מהם.`
    : "";
}
