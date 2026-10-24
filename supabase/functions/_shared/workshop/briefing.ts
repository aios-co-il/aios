/**
 * What Carmen must know before she spends money on pictures: which engine makes them (when the
 * tenant has more than one) and what the project should look like. The tools return this as a
 * question list instead of generating, so the briefing cannot be skipped.
 */

import { PROVIDER_LABEL } from "./capabilities.ts";
import type { ImageProvider } from "./image-providers.ts";
import type { ProjectLook } from "./look.ts";

export const ENGINE_NOTES: Record<ImageProvider, string> = {
  google:
    "Nano Banana Pro של Google: הכי טוב בעקיבות אחרי רפרנסים ובשמירה על אותה דמות, כולל טקסט קריא בתמונה",
  elevenlabs:
    "אותו מודל של Google דרך ElevenLabs: אותה איכות ועקיבות לרפרנסים, ומחויב בחשבון ElevenLabs",
  higgsfield:
    "Higgsfield Soul 2: מראה צילומי ואופנתי חזק, מקבל רפרנס תמונה אחד בלבד",
  openai:
    "OpenAI (gpt-image-2.5): איכות גבוהה ופרשנות טובה לתיאורים, פחות עקבי בדמות בין סצנות",
};

export const engineOptions = (connected: ImageProvider[]) =>
  connected.map((id) => ({
    id,
    label: PROVIDER_LABEL[id],
    note: ENGINE_NOTES[id],
  }));

export const styleQuestions = (kind: "video" | "static") =>
  kind === "video"
    ? [
        "מי מופיע בסרט ואיך הוא נראה (גיל, שיער, לבוש), או שאין דמות?",
        "איזה סגנון: צילום ריאליסטי, קולנועי, אנימציה תלת־ממדית או איור שטוח?",
        "איזו אווירה וצבעים (למשל חם ומזמין, נקי ומינימליסטי, בהיר וצבעוני)?",
        "יש תמונה או מודעה שאהבת כרפרנס? אפשר לצרף.",
      ]
    : [
        "מה הנושא או המוצר המרכזי בתמונה?",
        "איזה סגנון: צילום, איור, תלת־ממד או גרפי נקי?",
        "איזו אווירה וצבעים (ואם יש צבעי מותג)?",
        "יש תמונה או מודעה שאהבת כרפרנס? אפשר לצרף.",
      ];

export interface BriefingInput {
  look: Pick<ProjectLook, "bible" | "references">;
  styleApproved: boolean;
  connected: ImageProvider[] | null;
  engine: ImageProvider | null;
  kind: "video" | "static";
  needsEngine: boolean;
}

export interface BriefingGate {
  needs_input: true;
  missing: ("style" | "engine")[];
  questions?: string[];
  engines?: ReturnType<typeof engineOptions>;
  message: string;
}

/** Returns what is still missing, or null when Carmen can go ahead. */
export function briefingGate(input: BriefingInput): BriefingGate | null {
  const hasReferences = input.look.references.length > 0;
  const hasBible = input.look.bible.trim().length > 0;
  const styleOk = hasReferences || (hasBible && input.styleApproved);
  const askEngine =
    input.needsEngine &&
    input.connected !== null &&
    input.connected.length > 1 &&
    !(input.engine && input.connected.includes(input.engine));
  const missing: BriefingGate["missing"] = [];
  if (!styleOk) missing.push("style");
  if (askEngine) missing.push("engine");
  if (missing.length === 0) return null;

  const parts: string[] = [
    "עוד לא מייצרים. שאלי את המשתמש בהודעה אחת קצרה, והציעי לכל שאלה ברירת מחדל מתאימה לבקשה שלו כדי שיוכל פשוט לאשר.",
  ];
  if (missing.includes("style"))
    parts.push(
      hasBible
        ? "הצגת style_bible אבל המשתמש לא אישר אותו: הציגי אותו בקצרה ובקשי אישור."
        : "לא הוגדר סגנון ולא צורף רפרנס. אם המשתמש כבר אמר סגנון, דמות או אווירה, אל תשאלי שוב, אלא הציעי style_bible מסוכם ובקשי אישור.",
    );
  if (missing.includes("engine"))
    parts.push(
      "מחוברים כמה מנועי תמונה. שאלי באיזה ליצור והסבירי בשורה על כל אחד, והמלצי אחד לפי הצורך (עקביות דמות ורפרנס: Google).",
    );
  parts.push(
    "כתבי כל שאלה עם כפתורי תשובה בשורה נפרדת בפורמט [[בחירה: נושא | אפשרות | אפשרות]], 2 עד 4 אפשרויות קצרות, והראשונה היא ההמלצה שלך. הסימונים הופכים לכפתורים והמשתמש לוחץ במקום לכתוב.",
  );
  parts.push(
    "אחרי התשובה קראי שוב לכלי עם style_bible (באנגלית), style_approved=true, reference_urls אם יש, ו-engine שנבחר. הבחירה נשמרת לפרויקט ולא שואלים שוב.",
  );
  return {
    needs_input: true,
    missing,
    ...(missing.includes("style")
      ? { questions: styleQuestions(input.kind) }
      : {}),
    ...(missing.includes("engine") && input.connected
      ? { engines: engineOptions(input.connected) }
      : {}),
    message: parts.join(" "),
  };
}
