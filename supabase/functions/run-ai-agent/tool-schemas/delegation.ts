export const delegationTools = [
  {
    name: "delegate_to_manus",
    description:
      "שליחת משימה מורכבת ל-Manus AI לביצוע ברקע (מחקר שוק, ניתוח קמפיינים, יצירת תוכן, ניתוח נתונים). המשימה רצה ברקע ועשויה לקחת דקות עד שעות.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "תיאור מפורט של המשימה לביצוע" },
        context_data: {
          type: "string",
          description: "נתוני הקשר רלוונטיים (למשל נתוני קמפיינים)",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "send_message_to_manus",
    description:
      "שליחת הודעה ישירה ל-Manus agent פעיל (תקשורת ישירה). משמש לשאלות, עדכונים, או המשך שיחה עם Manus על משימה קיימת. מחזיר מיידית ללא המתנה לתשובה.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "ההודעה לשליחה ל-Manus" },
        task_id: {
          type: "string",
          description:
            "מזהה המשימה הקיימת (אופציונלי — אם לא מוגדר ישתמש ב-agent-default)",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "get_facebook_campaign_data",
    description:
      "שליפת נתוני קמפיינים מפייסבוק לצורך ניתוח. לכל קמפיין goal ו-results כמו בדוח: רכישות לקמפיין מכירות (ecommerce), לידים לקמפיין לידים (leads), ובקמפיין תנועה (traffic) אין תוצאה.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        days: {
          type: "integer",
          description: "מספר ימים אחורה (ברירת מחדל 30)",
        },
      },
    },
  },
  {
    name: "list_facebook_campaigns",
    description:
      "רשימת קמפיינים פעילים/מושבתים של לקוח עם campaign_id, שם וסטטוס. השתמש כדי למצוא את ה-campaign_id לפני toggle.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        name_search: { type: "string", description: "חיפוש חלקי בשם הקמפיין" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "toggle_facebook_campaign",
    description:
      "הפעלה (ACTIVE) או השהיה (PAUSED) של קמפיין/ad set/מודעה בפייסבוק. campaign_id יכול להיות גם ad_id. מכניס בקשת אישור לתור — לא מבצע מיד. אחרי אישור — execute_pending_approval.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "מזהה הלקוח" },
        campaign_id: {
          type: "string",
          description: "Facebook campaign_id / adset_id / ad_id",
        },
        status: { type: "string", enum: ["ACTIVE", "PAUSED"] },
        level: {
          type: "string",
          enum: ["campaign", "adset", "ad"],
          description: "ברירת מחדל campaign; עבור מודעה בודדת העבירי level=ad",
        },
      },
      required: ["client_id", "campaign_id", "status"],
    },
  },
  {
    name: "analyze_facebook_campaign",
    description:
      "ניתוח עומק של קמפיין פייסבוק יחיד: היום/7/30 ימים + פירוט מודעות (ad-level) עם spend/leads/CPL. השתמשי לפני הפעלה/כיבוי סלקטיבי של מודעות.",
    parameters: {
      type: "object",
      properties: {
        client_id: {
          type: "string",
          description: "מזהה הלקוח שהקמפיין שייך אליו",
        },
        campaign_id: { type: "string" },
      },
      required: ["client_id", "campaign_id"],
    },
  },
  {
    name: "list_facebook_ads",
    description:
      "רשימת מודעות (ads) תחת קמפיין פייסבוק עם סטטוס ו-CPL/spend/leads ל-7 ימים. להשתמש לפני הדלקה סלקטיבית של מודעות עם CPL נמוך.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        campaign_id: { type: "string" },
      },
      required: ["client_id", "campaign_id"],
    },
  },
];
