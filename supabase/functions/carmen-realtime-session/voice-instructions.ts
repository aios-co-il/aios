import {
  buildIdentity,
  buildWritingStyle,
} from "../_shared/carmen-prompt-v2.ts";

/** The parts of Carmen's agent row that shape how she speaks. */
export interface VoiceAgentProfile {
  systemPrompt: string | null;
  writingStyle: string | null;
  responseLength: string | null;
  voice: string | null;
  tenantName: string;
}

/**
 * Instructions for Carmen's live voice session. Her identity and tone come from the same
 * agent settings as the text chat (`run-ai-agent`); only the speaking rules and the
 * `ask_carmen` hand-off are specific to voice.
 */
export function buildVoiceInstructions(
  profile: VoiceAgentProfile,
  callerName: string | null,
): string {
  return [
    profile.systemPrompt?.trim() || buildIdentity(profile.tenantName),
    buildWritingStyle(profile.writingStyle, profile.responseLength).trim(),
    "=== שיחה קולית ===",
    "זו שיחה קולית חיה: דברי עברית ישראלית טבעית, חמה וסמכותית, במשפטים קצרים שנוח לשמוע. בלי רשימות, טבלאות או סימני עיצוב.",
    callerName
      ? `את מדברת עכשיו עם ${callerName}. פני אליו/ה בשמו/ה כשזה טבעי.`
      : "",
    "עני לכל מה שמבקשים ממך: להציג את עצמך, שאלות כלליות, רעיונות ועצות, וכל עניין של העבודה. כשזה מועיל, קשרי את התשובה לשיווק ולמכירות של העסק.",
    'ask_carmen הוא המוח שלך — אותו מוח, אותם נתונים ואותו זיכרון של כרמן בכל המערכת. לכל שאלה על נתונים (לקוחות, לידים, משימות, קמפיינים, כספים, דוחות, זיכרון) או בקשה לבצע פעולה, קראי לו מיד עם הבקשה המלאה וענִי רק לפי מה שחזר. אל תמציאי נתונים ואל תציגי את זה כ"בדיקה מול מערכת אחרת" — זו את.',
    'כשנאמר "בדיקת דופק", "דופק", או ניסוח דומה/שגיאת תמלול של הביטוי — חובה לקרוא מיד ל-ask_carmen עם המילים "בדיקת דופק מלאה ועדכנית לפי סוכנויות". הקריאי את הנתונים שהכלי החזיר; אסור לומר "הנה הדוח" בלי למסור את תוכנו ואסור לבקש שם לקוח.',
    "הרשאות: התשובות מ-ask_carmen כבר מוגבלות להרשאות של המשתמש שמולך ולטננט הנוכחי. לעולם אל תזכירי לקוחות או נתונים מחוץ למה שהכלי החזיר.",
    'בזמן שהכלי עובד אפשר לומר משפט קצר כמו "שניה, בודקת".',
  ]
    .filter(Boolean)
    .join("\n");
}
