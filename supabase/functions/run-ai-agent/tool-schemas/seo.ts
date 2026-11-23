import type { SeoReadToolName } from "../../_shared/carmen/seo-read-tools.ts";

const seoParams = {
  type: "object",
  properties: {
    client_id: {
      type: "string",
      description:
        "מזהה הלקוח (uuid). מוצאים עם search_entities / list_clients",
    },
    top_n: {
      type: "integer",
      minimum: 1,
      maximum: 50,
      description: "כמה שורות להחזיר ברשימות (ברירת מחדל 10; בסקירה 5)",
    },
  },
  required: ["client_id"],
};

/**
 * Carmen's read-only SEO / GEO tools. They read stored data only (synced
 * Search Console windows, saved Ahrefs snapshots, the SEO program, AI-detection
 * scans): no paid API call, no scan, no write.
 */
export const seoTools: Array<{
  name: SeoReadToolName;
  description: string;
  parameters: typeof seoParams;
}> = [
  {
    name: "get_seo_overview",
    description:
      "סקירת SEO / GEO של לקוח בקריאה אחת — 'איך הלקוח בקידום האורגני ומה לעשות': Search Console (קליקים, חשיפות, CTR, מיקום ממוצע, שינוי מול חודש), Ahrefs (DR, תנועה אורגנית, דומיינים מפנים), תוכנית ה-SEO (מילות מפתח, לוח תוכן, עדכון חודשי) ונראות ב-AI (ChatGPT/Gemini/Perplexity), ורשימת signals של מה דורש טיפול. מקור לא מחובר מוחזר כ'לא מחובר' עם הסבר. קריאה בלבד.",
    parameters: seoParams,
  },
  {
    name: "get_search_console_performance",
    description:
      "ביצועי Google Search Console של לקוח מהסנכרון היומי: קליקים, חשיפות, CTR ומיקום ממוצע ל-90 הימים האחרונים ולחלונות של לפני חודש / 3 חודשים / שנה (השוואה לפי ממוצע ליום), השאילתות המובילות עם שינוי מיקום, ושאילתות במקומות 4–20 (הזדמנויות). אם Search Console לא מחובר או לא שויך נכס — מחזיר הסבר. קריאה בלבד.",
    parameters: seoParams,
  },
  {
    name: "get_ahrefs_snapshot",
    description:
      "תמונת Ahrefs האחרונה ששמורה ללקוח: Domain Rating, תנועה אורגנית, מילות מפתח (כולל טופ 3 / טופ 10), בקלינקים ודומיינים מפנים מול לפני 3 ו-12 חודשים, מילות המפתח והעמודים המובילים בתנועה, וביטויים במעקב (Rank Tracker). לא מריץ סנכרון Ahrefs (עולה יחידות). דוח לדומיין אחר לא מוצג. קריאה בלבד.",
    parameters: seoParams,
  },
  {
    name: "get_seo_program",
    description:
      "מצב תוכנית ה-SEO / GEO של לקוח: מילות המפתח בתוכנית, לוח התוכן (מתוכנן, טיוטה, פורסם, נכשל, ממתין לאישור, באיחור, הכתבות הבאות והאחרונות שפורסמו) והעדכונים החודשיים האחרונים (עלייה/יציב/ירידה, סיכום העבודה, כתבות וקישורים). קריאה בלבד — לא כותב ולא מפרסם.",
    parameters: seoParams,
  },
  {
    name: "get_ai_visibility",
    description:
      "נראות הלקוח במנועי AI (GEO): ציון שבועי (ChatGPT, Gemini, Perplexity), מגמה, ומהסריקה האחרונה — אחוז אזכור לפי פלטפורמה, שאלות שבהן הלקוח לא הוזכר, המקורות שה-AI מצטט ושיעור האזכור של מתחרים. קורא סריקות שמורות בלבד; לא מריץ סריקה חדשה.",
    parameters: seoParams,
  },
];
