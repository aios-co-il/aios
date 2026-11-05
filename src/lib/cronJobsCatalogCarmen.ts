/** Carmen's own scheduled jobs (cron.job.jobname → meta). See cronJobsCatalog.ts. */
import type { CronJobMeta } from "./cronJobsCatalog";

export const CARMEN_CRON_JOBS: Record<string, CronJobMeta> = {
  "carmen-manager-round-15m": {
    label: "סבב כרמן מנהלת שיווק",
    description:
      "כל 15 דקות: כרמן מריצה את הבדיקות שלה ומעדכנת ממצאים, ושולחת מהקו שלה סיכום בוקר והתראות רק במצב שליחה שבעלי הארגון בחרו בחוקי ההתראות.",
    category: "carmen",
    icon: "🧭",
    sends: "whatsapp",
    sendsNote:
      "רק במצב 'רק לבעלים' או 'צוות מלא'; במצב צפייה הכול בדשבורד בלבד.",
  },
  "carmen-reconcile-nightly": {
    label: "בדיקת דוחות לילית",
    description:
      "כל לילה ב-01:30 UTC: משווה את דוחות המודעות ב-AIOS לנתוני Meta ו-Google של אתמול ורושם פערים.",
    category: "carmen",
    icon: "🧮",
    sends: "dashboard",
  },
  "carmen-health-probe": {
    label: "כרמן — בדיקת בריאות",
    description:
      "כל 10 דקות: בודק שהמוחות, המפתחות והחיבורים של כרמן עונים, ומציג את המצב בלוח הבריאות.",
    category: "carmen",
    icon: "🩺",
    sends: "dashboard",
  },
  "dispatch-agent-tasks-every-5min": {
    label: "הפעלת משימות מתוזמנות של כרמן",
    description:
      "כל 5 דקות: מפעיל את המשימות של כרמן שהגיע זמנן (חד-פעמיות, יומיות, שבועיות ולפי לו״ז).",
    category: "carmen",
    icon: "🗓️",
    sends: "whatsapp",
    sendsNote: "דרך המשימה עצמה: תזכורת או משימה של כרמן יכולה לשלוח וואטסאפ.",
  },
  "autonomous-goal-worker": {
    label: "כרמן — יעדים אוטונומיים",
    description:
      "כל דקה: מקדם את היעדים האוטונומיים של כרמן צעד אחר צעד ושולח צעדים לסוכני הפיתוח.",
    category: "carmen",
    icon: "🎯",
    sends: "none",
  },
  "meeting-bot-reconcile-every-minute": {
    label: "בוט פגישות — רשת ביטחון",
    description:
      "כל דקה: סוגר בוטי פגישות שנתקעו ושולח הקלטות שהסתיימו לתמלול.",
    category: "carmen",
    icon: "🎙️",
    sends: "none",
  },
  "carmen-memory-worker-every-2min": {
    label: "כרמן — עיבוד זיכרון",
    description:
      "כל 2 דקות: מעבד את ה-outbox של זיכרון כרמן ושומר אירועים חדשים.",
    category: "carmen",
    icon: "🧠",
    sends: "none",
  },
  "carmen-memory-worker-1m": {
    label: "כרמן — עיבוד זיכרון",
    description: "מעבד את ה-outbox של זיכרון כרמן ושומר אירועים חדשים.",
    category: "carmen",
    icon: "🧠",
    sends: "none",
  },
  "carmen-memory-consolidate-daily": {
    label: "כרמן — איחוד זיכרונות יומי",
    description: "מאחד ומקצר את הזיכרונות של כרמן פעם ביום (03:00).",
    category: "carmen",
    icon: "📚",
    sends: "none",
  },
  "carmen-heartbeat": {
    label: "כרמן — Heartbeat",
    description: "פעימה אוטונומית של כרמן: שולח תזכורות, פותח משימות תקועות.",
    category: "carmen",
    icon: "❤️",
    sends: "whatsapp",
  },
  "campaign-pulse-sunday-0730": {
    label: "בדיקת דופק שבועית",
    description:
      "ביום ראשון ב-07:30 שעון ישראל: מחשב את בדיקת הדופק השבועית ושולח אותה לנמענים שהוגדרו לארגון.",
    category: "carmen",
    icon: "💗",
    sends: "whatsapp",
  },
  "campaign-pulse-morning-0730": {
    label: "בדיקת דופק בוקר",
    description:
      "מחשב בדיקת דופק דטרמיניסטית ב-07:30 ושולח לוואטסאפ קישור לדשבורד בדיקת דופק (בלי רשימת לקוחות).",
    category: "carmen",
    icon: "💗",
    sends: "whatsapp",
  },
  "meta-operational-check-2h": {
    label: "בדיקת סטטוס קמפיינים — Meta",
    description:
      "כל שעתיים: בודק את חשבונות המודעות ב-Meta (חשבון חסום, בעיית תשלום, מודעה שנדחתה, קמפיין שנעצר) ומציג את הממצאים בדשבורד.",
    category: "carmen",
    icon: "🚦",
    sends: "dashboard",
  },
  "google-ads-operational-check-2h": {
    label: "בדיקת סטטוס קמפיינים — Google",
    description:
      "כל שעתיים: בודק את חשבונות Google Ads (חשבון חסום, קמפיין שנעצר, אין מודעות פעילות) ומציג את הממצאים בדשבורד.",
    category: "carmen",
    icon: "🚦",
    sends: "dashboard",
  },
};
