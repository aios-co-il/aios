import {
  type Pronunciation,
  pronunciationLines,
} from "../_shared/carmen/pronunciations/dictionary.ts";

/** The Realtime function the voice model calls when the user corrects how she said a word. */
export const SAVE_PRONUNCIATION_TOOL = {
  type: "function",
  name: "save_pronunciation",
  description:
    "שמירת הגייה נכונה של מילה במילון ההגייה של כרמן, כשהמשתמש מתקן איך אמרת אותה. ההגייה נשמרת לשיחות הבאות.",
  parameters: {
    type: "object",
    properties: {
      term: {
        type: "string",
        description: "המילה כפי שהיא נכתבת (שם, לקוח, מותג או מונח באנגלית)",
      },
      spoken: {
        type: "string",
        description:
          "איך להגות אותה: בעברית עם ניקוד או בכתיב פונטי, למשל אֵיי-אַיי-או-אֶס",
      },
    },
    required: ["term", "spoken"],
  },
} as const;

/**
 * The voice instructions for pronunciation: the dictionary, and when to save a correction.
 */
export function pronunciationInstructions(
  entries: Array<Pronunciation>,
): string {
  return [
    "=== הגייה ===",
    'כשהמשתמש מתקן איך אמרת מילה ("זה נהגה...", "לא X אלא Y"), קראי מיד ל-save_pronunciation עם המילה וההגייה הנכונה, אמרי שתזכרי, והגי אותה נכון מעכשיו.',
    "הגי את המילים האלה בדיוק כך:",
    ...pronunciationLines(entries),
  ].join("\n");
}
