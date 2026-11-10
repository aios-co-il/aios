import { HEALTH_CARD_ENTRY_ERROR_HINT } from "../carmen-client-card-tools.ts";

export const callReportingTools = [
  {
    name: "get_maskyoo_calls_report",
    description:
      "דוח שיחות מסקיו לדוחות SEO. מחזיר ספירות שיחות נכנסות לפי לקוח וקטגוריה (organic/paid) מ-seo_call_snapshots. אם אין snapshot — שולף ישירות מ-call_logs. מחזיר השוואה בין תקופות אם period_compare=true.",
    parameters: {
      type: "object",
      properties: {
        client_id: {
          type: "string",
          description: "מזהה לקוח (אופציונלי — בלעדיו מחזיר כל הלקוחות)",
        },
        client_name: {
          type: "string",
          description: "חיפוש לקוח לפי שם אם אין client_id",
        },
        period_start: {
          type: "string",
          description:
            "תחילת תקופה YYYY-MM-DD (ברירת מחדל: תחילת החודש הנוכחי)",
        },
        period_end: {
          type: "string",
          description: "סוף תקופה YYYY-MM-DD (ברירת מחדל: היום)",
        },
        category: {
          type: "string",
          enum: ["organic", "paid", "all"],
          description: "ברירת מחדל: all",
        },
        period_compare: {
          type: "boolean",
          description: "אם true — מחזיר גם תקופה קודמת מקבילה להשוואה",
        },
      },
    },
  },
  {
    name: "sync_maskyoo_cdr",
    description:
      "סנכרון CDRs (Call Detail Records) מ-API של מסקיו אל call_logs. הרץ כשהנתונים לא עדכניים. מחזיר כמה רשומות נוספו.",
    parameters: {
      type: "object",
      properties: {
        from_date: {
          type: "string",
          description:
            "YYYY-MM-DD — תאריך התחלה לסנכרון (ברירת מחדל 7 ימים אחורה)",
        },
      },
    },
  },
  {
    name: "update_client_health",
    description: `עדכון מצב בריאות לקוח: מעדכן mood_status בטבלת clients ויוצר רשומה ב-communication_logs. השתמש בכלי הזה כדי להדליק דגל על לקוח כשמזהים בעיה (התייקרות, ירידה בביצועים). ${HEALTH_CARD_ENTRY_ERROR_HINT}`,
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        mood_status: {
          type: "string",
          enum: ["happy", "wavering", "churn_risk"],
          description:
            "מצב הלקוח: happy=תקין, wavering=מתלבט, churn_risk=סיכון נטישה",
        },
        communication_status: {
          type: "string",
          enum: ["normal", "sensitive", "complaint"],
          description: "סטטוס תקשורת לרשומת communication_logs",
        },
        note: { type: "string", description: "הערה/סיכום — מה הבעיה שזוהתה" },
      },
      required: ["client_id", "mood_status", "note"],
    },
  },
  {
    name: "get_client_retention_scan",
    description:
      "דופק שימור: מדרג לקוחות פעילים לטיפול עכשיו או למעקב לפי דופק שמור ומצב CRM. לא מחשב דופק חדש, לא קורא למודל, ולא שולח הודעה ללקוח. בוואטסאפ החזירי רק whatsapp_digest.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        client_name: { type: "string", description: "חיפוש חלקי בשם הלקוח" },
      },
    },
  },
  {
    name: "batch_update_client_health",
    description: `עדכון בריאות לכמה לקוחות בבת אחת (עד 25). לכל שורה חובה client_id, mood_status ו-note. רק אחרי בקשה מפורשת לעדכן את הדשבורד — לא כחלק מסריקת שימור. ${HEALTH_CARD_ENTRY_ERROR_HINT}`,
    parameters: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              client_id: { type: "string" },
              mood_status: {
                type: "string",
                enum: ["happy", "wavering", "churn_risk"],
              },
              communication_status: {
                type: "string",
                enum: ["normal", "sensitive", "complaint"],
              },
              note: { type: "string" },
            },
            required: ["client_id", "mood_status", "note"],
          },
        },
      },
      required: ["updates"],
    },
  },
];
