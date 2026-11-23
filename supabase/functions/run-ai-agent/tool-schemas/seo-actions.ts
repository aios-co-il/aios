import type { SeoActionToolName } from "../../_shared/carmen/seo-action-tools.ts";

const clientId = {
  type: "string",
  description: "מזהה הלקוח (uuid). מוצאים עם search_entities / list_clients",
};
const entryId = {
  type: "string",
  description: "מזהה הכתבה בלוח התוכן (מ-get_seo_program)",
};
const APPROVAL =
  "לא מבוצע מיד: נוצרת בקשת אישור עם סיכום ועלות, ומבוצע רק אחרי שהמשתמש אישר (execute_pending_approval).";

/**
 * Carmen's SEO / GEO actions that change data or spend money. Each queues an
 * approval row; nothing runs before a person approves it.
 */
export const seoActionTools: Array<{
  name: SeoActionToolName;
  description: string;
  parameters: Record<string, unknown>;
}> = [
  {
    name: "run_ai_visibility_scan",
    description: `סריקת נראות ב-AI (GEO) ללקוח: שואלת את שאלות המותג שלו ומעדכנת את הציון השבועי. עולה קריאות OpenAI. ${APPROVAL}`,
    parameters: {
      type: "object",
      properties: { client_id: clientId },
      required: ["client_id"],
    },
  },
  {
    name: "check_serp_rankings",
    description: `בדיקת מיקומים בגוגל לאתר הלקוח עבור עד 10 ביטויים, ומי מדורג מעליו (מחקר מילות מפתח). חיפוש בתשלום אחד לכל ביטוי (DataForSEO / SerpAPI של הארגון). ${APPROVAL}`,
    parameters: {
      type: "object",
      properties: {
        client_id: clientId,
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "1–10 ביטויים שונים לחיפוש",
        },
        country: {
          type: "string",
          enum: ["il", "us", "uk", "au", "ca", "de", "fr", "es", "it", "nl"],
          description: "שוק החיפוש (ברירת מחדל il)",
        },
        device: { type: "string", enum: ["desktop", "mobile"] },
      },
      required: ["client_id", "keywords"],
    },
  },
  {
    name: "upsert_seo_keywords",
    description: `הוספת ביטויים לתוכנית ה-SEO / GEO של הלקוח, או עדכון כוונה/עדיפות של ביטויים קיימים. ללא עלות. ${APPROVAL}`,
    parameters: {
      type: "object",
      properties: {
        client_id: clientId,
        keywords: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword: { type: "string" },
              intent: { type: "string", description: "כוונת חיפוש (לא חובה)" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["keyword"],
          },
          description: "1–50 ביטויים",
        },
      },
      required: ["client_id", "keywords"],
    },
  },
  {
    name: "generate_seo_article_draft",
    description: `כתיבת טיוטת מאמר לכתבה מאושרת בלוח התוכן של הלקוח (לא מפרסמת). קריאת OpenAI אחת על מפתח הארגון. טיוטה קיימת נכתבת מחדש רק עם regenerate=true. ${APPROVAL}`,
    parameters: {
      type: "object",
      properties: {
        client_id: clientId,
        entry_id: entryId,
        regenerate: { type: "boolean", description: "לכתוב מחדש טיוטה קיימת" },
      },
      required: ["client_id", "entry_id"],
    },
  },
  {
    name: "publish_seo_article",
    description: `פרסום טיוטה מאושרת מלוח התוכן באתר הוורדפרס של הלקוח — פרסום ציבורי מיידי. כתבה שפורסמה לא מתפרסמת שוב. ${APPROVAL}`,
    parameters: {
      type: "object",
      properties: { client_id: clientId, entry_id: entryId },
      required: ["client_id", "entry_id"],
    },
  },
];
