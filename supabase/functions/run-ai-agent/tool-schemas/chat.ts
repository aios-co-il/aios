export const chatTools = [
  {
    name: "get_chat_history",
    description: "שליפת היסטוריית שיחות WhatsApp עם ליד או לקוח",
    parameters: {
      type: "object",
      properties: {
        contact_type: { type: "string", enum: ["lead", "client"] },
        contact_id: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["contact_type", "contact_id"],
    },
  },
  {
    name: "search_conversation_history",
    description:
      "שליפת היסטוריית WhatsApp. כברירת מחדל בשיחת WhatsApp פעילה — רק הצ׳אט הנוכחי (chat_id). לדפדוף בכל הארגון: browse_all_chats=true. מצבים: (1) חיפוש מילות תוכן (לא מילות זמן כמו אתמול) (2) דפדוף לפי זמן בלי query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "מילות תוכן לחיפוש (עד 4). השמיטי לדפדוף לפי זמן.",
        },
        days_back: {
          type: "integer",
          description:
            "כמה ימים אחורה (ברירת מחדל 180; לדפדוף אתמול השתמשי ב-2)",
        },
        only_carmen_chats: {
          type: "boolean",
          description: "רק ערוץ manus_wa (ברירת מחדל true בדפדוף)",
        },
        with_phone: { type: "string", description: "סינון למספר טלפון" },
        browse_all_chats: {
          type: "boolean",
          description: "true = חפשי בכל שיחות הארגון, לא רק הצ׳אט הנוכחי",
        },
        limit: {
          type: "integer",
          description: "מקסימום תוצאות (ברירת מחדל 20, בדפדוף 40)",
        },
      },
    },
  },
  {
    name: "get_recent_inbound_messages",
    description: "שליפת הודעות נכנסות אחרונות מכל השיחות",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer" },
        hours: {
          type: "integer",
          description: "כמה שעות אחורה (ברירת מחדל 24)",
        },
      },
    },
  },
];
