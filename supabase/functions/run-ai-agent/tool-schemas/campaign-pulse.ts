import { REFRESH_CAMPAIGN_PULSE_TOOL } from "../pulse-refresh/tool.ts";

export const campaignPulseTools = [
  {
    name: "sync_social_pages",
    description:
      "סנכרון מחדש של כל העמודים (כולל Page Access Tokens) מפייסבוק. הרץ אחרי חיבור חדש או כשעמוד חסר.",
    parameters: {
      type: "object",
      properties: { client_id: { type: "string" } },
    },
  },
  {
    name: "analyze_campaign_performance",
    description:
      "ניתוח ביצועי קמפיינים מטבלאות CRM. מזהה טבלאות קמפיין לפי שדות (spend+campaign_name) ולא לפי שם — תופס גם טבלאות בעברית. מחזיר coverage_summary (כמה לקוחות מסונכרנים מתוך הסקופ), synced_clients (עם spend/CPL/שינוי 7 מול 30 יום; לידים רק מקמפייני לידים ורכישות רק מקמפייני מכירות, כמו בדוח) ו-not_connected_clients (לקוחות שאין להם טבלת קמפיין). חובה לדווח על שני הסלוטים, ולא רק על מי שיש לו נתונים.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "מזהה לקוח ספציפי" },
        agency_id: { type: "string", description: "סינון לסוכנות מסוימת" },
        agency_name: {
          type: "string",
          description: "סינון לפי שם סוכנות (case-insensitive, חיפוש חלקי)",
        },
      },
    },
  },
  {
    name: "get_latest_campaign_pulse",
    description:
      "שליפת תמונת הדופק האחרונה שכבר חושבה ונשמרה. בוואטסאפ מחזיר whatsapp_digest קצר (סיכום סטטוסים + קישור לדשבורד) בלבד — בלי טבלת לקוחות. בדשבורד הפנימי אפשר גם formatted_markdown. לבדיקת דופק עדכנית — refresh_campaign_pulse. רק אם המשתמש מבקש נתונים חיים/ניתוח עמוק עבור לקוח — analyze_campaign_performance.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        client_name: { type: "string", description: "חיפוש חלקי בשם הלקוח" },
        agency_id: { type: "string" },
        agency_name: { type: "string", description: "חיפוש חלקי בשם הסוכנות" },
        status: {
          type: "string",
          enum: ["healthy", "warning", "critical", "no_data"],
        },
      },
    },
  },
  REFRESH_CAMPAIGN_PULSE_TOOL,
];
