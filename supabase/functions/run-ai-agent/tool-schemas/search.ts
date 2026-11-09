export const searchTools = [
  // SEARCH
  {
    name: "search_entities",
    description:
      "חיפוש סוכנויות, לקוחות, קמפיינרים, אנשי מכירות או לידים לפי שם. ללקוחות: מחפש גם aliases/אנגלית/עברית, שמות חשבונות מודעות Meta, טבלאות דוח, ולקוחות ended/paused — לא רק active. עבור קמפיינר WhatsApp התוצאות מוגבלות אלא אם all_scopes=true.",
    parameters: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          enum: ["agency", "client", "campaigner", "sales_person", "lead"],
        },
        search_term: { type: "string" },
        agency_id: {
          type: "string",
          description: "הגבלה לסוכנות מסוימת (רלוונטי ל-client/lead)",
        },
        all_scopes: {
          type: "boolean",
          description: "דרוס את סקופ הקמפיינר והחזר תוצאות מכל הארגון.",
        },
        include_inactive: {
          type: "boolean",
          description:
            "ללקוחות: כלול ended/paused (ברירת מחדל true בחיפוש לפי שם)",
        },
      },
      required: ["entity_type", "search_term"],
    },
  },
  {
    name: "query_system_graph",
    description:
      "חיפוש לקריאה בלבד בגרף הארכיטקטורה של AIOS: קוד, Edge Functions, טבלאות SQL, מודולים וקשרים ביניהם. השתמשי רק לשאלות טכניות על מבנה המערכת, מיקום מימוש, תלות בין רכיבים או השפעת שינוי. הכלי זמין למנהלים בלבד ואינו מחזיר נתוני לקוחות.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "מונחים טכניים לחיפוש, רצוי באנגלית ושמות רכיבים מדויקים",
        },
        depth: {
          type: "integer",
          minimum: 0,
          maximum: 3,
          description: "עומק ניווט בקשרים, ברירת מחדל 2",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 80,
          description: "מספר צמתים מרבי, ברירת מחדל 40",
        },
      },
      required: ["query"],
    },
  },
];
