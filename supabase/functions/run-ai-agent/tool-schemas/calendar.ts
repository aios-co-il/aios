export const calendarTools = [
  // ===========================
  // CALENDAR INVITES
  // ===========================
  {
    name: "send_calendar_invite",
    description:
      "שליחת זימון Google Calendar דרך מייל. אפשר להוסיף Google Meet (ברירת מחדל כש-add_conference=true) או Zoom אם האינטגרציה מוגדרת, ומוזמנים נוספים. גוגל שולחת מייל עם אישור/דחייה.",
    parameters: {
      type: "object",
      properties: {
        attendee_email: {
          type: "string",
          description: "כתובת המייל של המוזמן הראשי",
        },
        attendee_name: { type: "string", description: "שם המוזמן (אופציונלי)" },
        title: { type: "string", description: "שם הפגישה/האירוע" },
        date: { type: "string", description: "תאריך בפורמט YYYY-MM-DD" },
        time: { type: "string", description: "שעת התחלה בפורמט HH:MM" },
        duration_minutes: {
          type: "integer",
          description: "משך בדקות (ברירת מחדל 60)",
        },
        notes: {
          type: "string",
          description: "הערות / תיאור הפגישה (אופציונלי)",
        },
        add_conference: {
          type: "boolean",
          description: "true = הוסף שיחת וידאו. ברירת מחדל Google Meet.",
        },
        conference_type: {
          type: "string",
          description: "meet | zoom. zoom נופל ל-Meet אם Zoom לא מוגדר בטננט.",
        },
        add_attendee_emails: {
          type: "array",
          items: { type: "string" },
          description: "מיילים נוספים למוזמנים",
        },
        add_carmen: {
          type: "boolean",
          description:
            "הוסף את כרמן כמוזמנת (מייל) אם יש carmen_email / קמפיינר כרמן",
        },
        carmen_email: {
          type: "string",
          description: "מייל כרמן כמוזמנת, אם ידוע",
        },
      },
      required: ["attendee_email", "title", "date", "time"],
    },
  },
  {
    name: "list_calendar_events",
    description:
      'רשימת אירועים ביומן הארגון בטווח תאריכים (ברירת מחדל: 14 הימים הקרובים). השתמשי כדי למצוא event_id לפני עדכון/ביטול פגישה, או כשנשאלת "מה יש ביומן".',
    parameters: {
      type: "object",
      properties: {
        date_from: {
          type: "string",
          description: "YYYY-MM-DD (ברירת מחדל היום)",
        },
        date_to: {
          type: "string",
          description: "YYYY-MM-DD (ברירת מחדל +14 ימים)",
        },
        search: {
          type: "string",
          description: "סינון טקסט חופשי (שם פגישה/משתתף)",
        },
      },
    },
  },
  {
    name: "update_calendar_invite",
    description:
      "עדכון פגישה קיימת לפי event_id: מועד/כותרת/הערות, הוספת Google Meet או Zoom, והוספת מוזמנים בלי למחוק קיימים. מחזיר event_link, conference_url ורשימת attendees. Zoom נופל ל-Meet אם האינטגרציה לא מוגדרת.",
    parameters: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM שעון ישראל" },
        duration_minutes: { type: "integer" },
        title: { type: "string" },
        notes: { type: "string" },
        add_conference: {
          type: "boolean",
          description: "true = הוסף שיחת וידאו לאירוע הקיים",
        },
        conference_type: {
          type: "string",
          description:
            "meet | zoom. zoom מנסה Zoom API ואם חסר — Google Meet + zoom_available=false",
        },
        add_attendee_emails: {
          type: "array",
          items: { type: "string" },
          description: "מיילים להוספה; לא מחליפים מוזמנים קיימים",
        },
        add_carmen: {
          type: "boolean",
          description: "הוסף את כרמן כמוזמנת מייל אם ניתן לזהות מייל",
        },
        carmen_email: {
          type: "string",
          description: "מייל כרמן כמוזמנת",
        },
      },
      required: ["event_id"],
    },
  },
];
