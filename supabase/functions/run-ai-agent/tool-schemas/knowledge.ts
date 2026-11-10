export const knowledgeTools = [
  {
    name: "kb_list_folder",
    description:
      "דפדוף בממלכת הידע של כרמן. מחזיר מצביעים (pointers) בתיקייה: clients/, team/, messages/<date>/, conversations/<topic>/, system_map/. הציון `path` הוא ההיררכיה. השתמש כדי לראות מה קיים לפני kb_open.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["clients", "team", "messages", "conversations", "system_map"],
        },
        subcategory: { type: "string" },
        path_prefix: {
          type: "string",
          description:
            'תחילית נתיב לסינון, למשל "clients/" או "team/<id>/tasks"',
        },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "kb_search",
    description:
      "חיפוש סמנטי+טקסטואלי בממלכת הידע. מחזיר pointers רלוונטיים לפי דמיון embedding ל-query, מסונן אופציונלית לקטגוריה/תאריך. השתמש כשמחפשים מידע על נושא, לקוח, או אירוע ולא יודעים את הנתיב המדויק.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        category: { type: "string" },
        since_days: {
          type: "integer",
          description: "הגבל לרשומות עם ref_date מ-N הימים האחרונים",
        },
        limit: { type: "integer" },
      },
      required: ["query"],
    },
  },
  {
    name: "kb_open",
    description:
      "פתיחת pointer וקבלת הנתון החי מה-DB (clients/campaigners/tasks/chat_messages/seo_reports וכו׳ — תמיד הנתון העדכני, לא העתק). השתמש אחרי kb_list_folder/kb_search.",
    parameters: {
      type: "object",
      properties: { pointer_id: { type: "string" } },
      required: ["pointer_id"],
    },
  },
  {
    name: "kb_recall_conversation",
    description:
      "שליפת סיכומי שיחות עבר (episodes) לפי נושא או חיפוש סמנטי. מחזיר summary + source_ids להפניה להודעות המקוריות.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        topic: { type: "string" },
        since_days: { type: "integer" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "kb_learn",
    description:
      "שמירת ידע פרוצדורלי/אפיזודי חדש (לקח שנלמד, נוהל, סיכום שיחה חשובה). שונה מ-save_memory: זה נכנס לממלכת הידע עם embedding לחיפוש סמנטי. שמור פה דברים שכרמן צריכה לזכור לטווח ארוך עם הקשר.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string" },
        summary: { type: "string" },
        topic_tags: { type: "array", items: { type: "string" } },
        importance: { type: "integer", description: "1-10" },
        source_table: { type: "string" },
        source_ids: { type: "array", items: { type: "string" } },
      },
      required: ["topic", "summary"],
    },
  },
];
