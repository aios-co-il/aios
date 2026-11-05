/**
 * Automatic mode: when the film goes to production, what Carmen chose on her own (the concept,
 * the script, the voice), so her closing line tells the user and they can ask to redo any of it.
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

/** The choices to report in automatic mode; nothing in semi-automatic mode, where the user chose. */
export function autoChoices(
  payload: Record<string, unknown>,
  voiceId: string | null | undefined,
): { auto_choices?: AutoChoices; carmen_next?: string } {
  if (!isAutoMode(payload)) {
    return {};
  }
  const script = filmScriptOf(payload);
  return {
    auto_choices: {
      concept: conceptAnswer(briefAnswersOf(payload)) || undefined,
      script: script && !("skipped" in script) ? script.title : undefined,
      voice: findVoice(voiceId)?.name,
    },
    carmen_next:
      "מצב אוטומטי: בתשובה שלך ספרי למשתמש בקצרה מה בחרת בעצמך (auto_choices: קונספט, תסריט, קול), ושאפשר לבקש לשנות כל אחד מהם.",
  };
}
