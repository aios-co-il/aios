import { aiChatJSON } from "../_shared/ai.ts";
import type { PulseInstantAlertCandidate } from "../_shared/pulse-instant-alerts.ts";
import type { PulseExceptionWording } from "../_shared/pulse/exception-wording.ts";

type ChatJSON = (
  prompt: string,
  model: string | undefined,
  opts: { signal: AbortSignal },
) => Promise<PulseExceptionWording | null>;

/**
 * Asks the model for wording only: one short Hebrew summary and one
 * recommended check for a campaign_exception alert, with no numbers. Null
 * when the call fails or `signal` aborts it (see wordPulseException).
 */
export async function phraseException(
  candidate: PulseInstantAlertCandidate,
  { signal }: { signal: AbortSignal },
  chat: ChatJSON = aiChatJSON,
): Promise<PulseExceptionWording | null> {
  return await chat(
    [
      "את מנסחת תוספת קצרה להתראת דופק שהקוד כבר החליט לשלוח לפי כללים קבועים. ההתראה תישלח בכל מקרה: אל תשפטי אם היא מוצדקת ואל תבטלי אותה.",
      "אל תכתבי מספרים, גם לא במילים (כמו אפס, ליד אחד, שלושה, עשרות, חצי, פי שניים, כפול), ואל תכתבי מכפילים (כמו פי 3), אחוזים, סכומים או תאריכים. הנתונים כבר מופיעים בהודעה, ואל תוסיפי נתון שלא מופיע בה.",
      'החזירי JSON בלבד בעברית: {"summary":"משפט אחד קצר שמסביר מה קורה בקמפיין","recommended_check":"בדיקה אחת קונקרטית שכדאי לעשות בקמפיין"}.',
      `הודעת ההתראה:\n${candidate.message}`,
      `ראיות: ${JSON.stringify(candidate.evidence || {})}`,
    ].join("\n"),
    undefined,
    { signal },
  );
}
