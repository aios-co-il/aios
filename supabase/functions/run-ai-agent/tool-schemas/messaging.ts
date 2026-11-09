export const messagingTools = [
  // MESSAGES
  {
    name: "send_message",
    description: "שליחת הודעת WhatsApp ללקוח או ליד",
    parameters: {
      type: "object",
      properties: {
        contact_type: { type: "string", enum: ["lead", "client"] },
        contact_id: { type: "string" },
        message_text: { type: "string" },
      },
      required: ["contact_type", "contact_id", "message_text"],
    },
  },
  {
    name: "lookup_staff_whatsapp",
    description:
      "מיפוי אנשי צוות לשליחת WhatsApp: קמפיינרים, אנשי מכירות ופרופילי צוות עם מספרי טלפון מה-DB. השתמשי לפני send_whatsapp_to_staff כשצריך לבחור לפי שם.",
    parameters: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          enum: ["campaigner", "sales_person", "team_member", "auto"],
          description: "סוג ישות (ברירת מחדל auto = הכל)",
        },
        search: { type: "string", description: "חיפוש חלקי בשם" },
        only_with_phone: {
          type: "boolean",
          description: "רק מי שיש להם טלפון (ברירת מחדל true)",
        },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "send_whatsapp_to_staff",
    description:
      "שליחת WhatsApp ישירות לחבר צוות לפי מיפוי המערכת (campaigner / sales_person / team_member). פותרת טלפון מה-DB בלבד — לא ממספר ידני. עדיף על send_message (שמיועד לליד/לקוח) ועל send_whatsapp_via_gateway כשלא יודעים את המספר.",
    parameters: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          enum: ["campaigner", "sales_person", "team_member", "auto"],
        },
        staff_id: {
          type: "string",
          description: "UUID של הקמפיינר / איש מכירות / פרופיל",
        },
        name: { type: "string", description: "שם לחיפוש אם אין staff_id" },
        message: { type: "string", description: "תוכן ההודעה" },
        campaigner_id: {
          type: "string",
          description: "alias ל-staff_id כשentity_type=campaigner",
        },
        message_text: { type: "string", description: "alias ל-message" },
      },
      required: ["message"],
    },
  },
  {
    name: "send_message_to_campaigner",
    description:
      "שליחת WhatsApp לקמפיינר לפי campaigner_id (עטיפה ל-send_whatsapp_to_staff).",
    parameters: {
      type: "object",
      properties: {
        campaigner_id: { type: "string", description: "מזהה הקמפיינר (UUID)" },
        message_text: { type: "string", description: "תוכן ההודעה" },
        name: { type: "string", description: "אופציונלי — שם אם אין id" },
      },
      required: ["message_text"],
    },
  },
  {
    name: "get_openai_billing_status",
    description:
      "סטטוס חיוב/שימוש OpenAI לארגון (super_admin בלבד): עלות החודש הנוכחי, טוקנים אם זמינים, ומגבלות אם זמינות. יתרת קרדיט לא נחשפת ב-API הרשמי — מחזיר unavailable במקום להמציא. דורש OPENAI_ADMIN_KEY (או openai_admin_api_key באינטגרציית llm).",
    parameters: {
      type: "object",
      properties: {
        include_tokens: {
          type: "boolean",
          description:
            "כלול גם סיכום טוקנים מ-usage/completions (ברירת מחדל true)",
        },
      },
    },
  },
];
