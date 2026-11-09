export const memoryTools = [
  // MEMORY
  {
    name: "save_memory",
    description: "שמירת מידע לזיכרון מתמשך (העדפות, פרויקטים, הוראות)",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "מפתח זיהוי" },
        content: { type: "string", description: "התוכן לשמירה" },
        category: {
          type: "string",
          enum: [
            "preferences",
            "projects",
            "clients",
            "workflows",
            "personal",
            "instructions",
          ],
        },
      },
      required: ["key", "content"],
    },
  },
  {
    name: "recall_memory",
    description: "שליפת זיכרונות שנשמרו (key/value, מהיר)",
    parameters: {
      type: "object",
      properties: { category: { type: "string" }, search: { type: "string" } },
    },
  },
  {
    name: "search_agent_tools",
    description:
      "חיפוש כלים רלוונטיים למשימה מתוך קטלוג הכלים (אינדקס embedding). השתמשי כשחסר כלי לביצוע המשימה — הכלים שיימצאו יתווספו ויהיו זמינים מסבב הבא.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "תיאור קצר של מה צריך לבצע" },
        limit: { type: "integer", description: "ברירת מחדל 12" },
      },
      required: ["query"],
    },
  },
  {
    name: "recall_memory_fts",
    description:
      "חיפוש זיכרונות חוצה-שיחות עם Full-Text Search ודירוג לפי importance. השתמשי כדי למצוא הקשר רלוונטי משיחות עבר על נושא, לקוח, או הוראה. שונה מ-recall_memory: זה מחפש בכל ה-agent_memory (זיכרונות שנוצרו אוטומטית מסיכומי ריצות + זיכרונות ידניים) ומדורג לפי חשיבות.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "טקסט חיפוש (מילות מפתח, שם לקוח, נושא)",
        },
        limit: { type: "integer", description: "ברירת מחדל 5" },
        min_importance: {
          type: "integer",
          description: "סף חשיבות מינימלי 0-100",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "delete_memory",
    description: "מחיקת זיכרון",
    parameters: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
];
