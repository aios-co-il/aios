export const broadcastsTools = [
  {
    name: "list_broadcasts",
    description:
      "רשימת דיוורים קיימים (broadcasts). מחזיר שם, ערוץ, סטטוס, תאריך תזמון וסטטיסטיקות שליחה. השתמש כדי לראות מה קיים לפני יצירה חדשה.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "draft",
            "scheduled",
            "sending",
            "sent",
            "paused",
            "failed",
            "canceled",
          ],
          description: "סינון לפי סטטוס (אופציונלי)",
        },
        limit: { type: "integer", description: "ברירת מחדל 20" },
      },
    },
  },
  {
    name: "create_broadcast",
    description:
      'יצירת דיוור WhatsApp חדש לקהל יעד (לקוחות / לידים / קמפיינרים / רשימה / קבוצות וואטסאפ). דורש אישור לפני שליחה. אחרי יצירה — שאל "לשלוח עכשיו או לתזמן?".',
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "שם הדיוור" },
        body_text: {
          type: "string",
          description: "תוכן ההודעה. אפשר להשתמש ב-{{contact_name}} כמשתנה.",
        },
        audience_source: {
          type: "string",
          enum: ["clients", "leads", "campaigners", "wa_groups"],
          description: "מקור הקהל",
        },
        audience_filter: {
          type: "object",
          description:
            'פרמטרים נוספים לפי source: clients→{statuses,tagIds}, leads→{statusKeys,salesPersonIds}, campaigners→{roles}, wa_groups→{groupIds:["uuid1",...]}',
        },
        scheduled_at: {
          type: "string",
          description:
            "תאריך ושעה לתזמון ב-ISO UTC (אופציונלי — ריק = שלח מיד אחרי אישור)",
        },
        integration_id: {
          type: "string",
          description:
            "UUID של חיבור WhatsApp לשימוש (אופציונלי — ישתמש בברירת מחדל)",
        },
      },
      required: ["name", "body_text", "audience_source"],
    },
  },
  {
    name: "send_broadcast_now",
    description:
      "שליחה מיידית של דיוור קיים (status=draft/scheduled). דורש אישור. מעביר לסטטוס sending ומתחיל לשלוח.",
    parameters: {
      type: "object",
      properties: {
        broadcast_id: { type: "string", description: "מזהה הדיוור" },
      },
      required: ["broadcast_id"],
    },
  },
  {
    name: "schedule_broadcast",
    description:
      "תזמון דיוור קיים לשליחה בזמן עתידי. דורש אישור. מעביר לסטטוס scheduled.",
    parameters: {
      type: "object",
      properties: {
        broadcast_id: { type: "string", description: "מזהה הדיוור" },
        scheduled_at: {
          type: "string",
          description:
            "תאריך ושעה ב-ISO UTC (לדוגמה 2026-07-01T18:00:00Z עבור 21:00 שעון ישראל)",
        },
      },
      required: ["broadcast_id", "scheduled_at"],
    },
  },
  {
    name: "cancel_broadcast",
    description: "ביטול דיוור מתוזמן או עצירת דיוור פעיל. דורש אישור.",
    parameters: {
      type: "object",
      properties: { broadcast_id: { type: "string" } },
      required: ["broadcast_id"],
    },
  },
  {
    name: "list_wa_groups",
    description:
      "רשימת קבוצות וואטסאפ הזמינות לדיוור (לא חסומות). מחזיר id, group_name, group_chat_id. השתמש כדי לקבל groupIds לפני יצירת דיוור לקבוצות.",
    parameters: {
      type: "object",
      properties: {
        name_search: {
          type: "string",
          description: "חיפוש חלקי בשם הקבוצה (אופציונלי)",
        },
        limit: { type: "integer", description: "ברירת מחדל 50" },
      },
    },
  },
];
