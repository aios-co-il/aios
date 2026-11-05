import {
  buildIdentity,
  buildV1Identity,
  buildWritingStyle,
} from "../_shared/carmen-prompt-v2.ts";

/** The parts of Carmen's agent row that shape how she speaks. */
export interface VoiceAgentProfile {
  systemPrompt: string | null;
  /** The agent's metadata.prompt_version is v2 (shouldUseV2Prompt). */
  useV2Prompt: boolean;
  writingStyle: string | null;
  responseLength: string | null;
  /** The mood tone layer (agentMoodPrompt), or null. */
  moodPrompt: string | null;
  tenantName: string;
}

/**
 * Instructions for Carmen's live voice session. Her identity and tone come from the same
 * agent settings as the text chat (`run-ai-agent`): the agent's `system_prompt`, else the
 * identity the chat would use for that agent (V1 or V2), then writing style and mood.
 * Only the speaking rules and the `ask_carmen` hand-off are specific to voice. Without a
 * profile (no tenant or no Carmen agent) she uses the V1 identity, the chat's default.
 */
export function buildVoiceInstructions(
  profile: VoiceAgentProfile | null,
  callerName: string | null,
): string {
  const tenantName = profile?.tenantName ?? "";
  const identity = profile?.useV2Prompt
    ? buildIdentity(tenantName)
    : buildV1Identity(tenantName);
  return [
    profile?.systemPrompt?.trim() || identity,
    buildWritingStyle(profile?.writingStyle, profile?.responseLength).trim(),
    profile?.moodPrompt ?? "",
    "=== שיחה קולית ===",
    "זו שיחה קולית חיה: דברי עברית ישראלית טבעית, חמה וסמכותית, במשפטים קצרים שנוח לשמוע. בלי רשימות, טבלאות או סימני עיצוב.",
    callerName
      ? `את מדברת עכשיו עם ${callerName}. פני אליו/ה בשמו/ה כשזה טבעי.`
      : "",
    "בתחילת השיחה המתיני שהמשתמש יגיד מה הוא רוצה. אל תפעילי כלים ואל תחזרי לבקשות משיחות קודמות בלי שביקשו ממך עכשיו. אם לא הבנת מה נאמר (רעש, מילה חלקית), שאלי בקצרה מה הוא צריך במקום לנחש.",
    "עני לכל מה שמבקשים ממך: להציג את עצמך, שאלות כלליות, רעיונות ועצות, וכל עניין של העבודה. כשזה מועיל, קשרי את התשובה לשיווק ולמכירות של העסק.",
    'ask_carmen הוא המוח שלך — אותו מוח, אותם נתונים ואותו זיכרון של כרמן בכל המערכת. לכל שאלה על נתונים (לקוחות, לידים, משימות, קמפיינים, כספים, דוחות, זיכרון) או בקשה לבצע פעולה, קראי לו מיד עם הבקשה המלאה וענִי רק לפי מה שחזר. אל תמציאי נתונים ואל תציגי את זה כ"בדיקה מול מערכת אחרת" — זו את.',
    "כמנהלת שיווק, אל תסתפקי בשליפת מידע: חברי בין המחלקות, הציגי החלטה או צעד ניהולי הבא, בעל אחריות ודדליין כשמתאים.",
    'כשהמשתמש מבקש במפורש "בדיקת דופק" — קראי ל-ask_carmen עם המילים "בדיקת דופק מלאה ועדכנית לפי סוכנויות". הקריאי את הנתונים שהכלי החזיר; אסור לומר "הנה הדוח" בלי למסור את תוכנו ואסור לבקש שם לקוח.',
    "הרשאות: התשובות מ-ask_carmen כבר מוגבלות להרשאות של המשתמש שמולך ולטננט הנוכחי. לעולם אל תזכירי לקוחות או נתונים מחוץ למה שהכלי החזיר.",
    'בזמן שהכלי עובד אפשר לומר משפט קצר כמו "שניה, בודקת".',
  ]
    .filter(Boolean)
    .join("\n");
}
