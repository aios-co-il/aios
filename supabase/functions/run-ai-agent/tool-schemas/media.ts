export const mediaTools = [
  {
    name: "save_media_from_chat",
    description:
      "שמירת מדיה (תמונה/וידאו) מהודעת צ'אט אל ספריית המדיה של הלקוח. אם message_id ניתן — מושך את כתובת הקובץ מההודעה אוטומטית. אם רק media_url — שומר ישירות. אסור להמציא URL — או לקבל מהמשתמש או להשתמש ב-message_id מההיסטוריה.",
    parameters: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "מזהה ההודעה ב-chat_messages (עדיף)",
        },
        media_url: { type: "string" },
        mime_type: { type: "string" },
        client_id: { type: "string" },
        lead_id: { type: "string" },
        caption: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "list_client_media",
    description:
      "רשימת קבצי מדיה ששמורים ללקוח (או ליד). מחזיר media_id, mime, ad_ready, caption.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        lead_id: { type: "string" },
        only_ad_ready: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        limit: { type: "integer" },
      },
    },
  },
];
