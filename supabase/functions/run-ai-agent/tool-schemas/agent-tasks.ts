export const agentTasksTools = [
  {
    name: "create_agent_task",
    description:
      'יצירת משימה לכרמן עצמה (ניהול משימות סוכנים). השתמש בכלי הזה כשהמשתמש מבקש מכרמן ליצור משימה לעצמה, משימה חוזרת, או תזכורת. המשימה תופיע בלוח "ניהול משימות סוכנים". חשוב: scheduled_at חייב להיות בפורמט ISO UTC (Z). אם המשתמש נקב בשעה — היא בשעון ישראל (Asia/Jerusalem); המירי ל-UTC לפני השמירה.',
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "כותרת המשימה" },
        description: { type: "string", description: "תיאור מפורט של המשימה" },
        priority: {
          type: "integer",
          description: "עדיפות 1-10 (ברירת מחדל 5)",
        },
        schedule_type: {
          type: "string",
          enum: ["once", "daily", "weekly"],
          description: "סוג תזמון",
        },
        scheduled_at: {
          type: "string",
          description:
            "תאריך ושעה לביצוע ב-ISO UTC (לדוגמה 2026-06-20T18:30:00Z עבור 21:30 שעון ישראל)",
        },
        cron_expression: {
          type: "string",
          description: "ביטוי CRON למשימות חוזרות",
        },
        task_skills: {
          type: "array",
          items: { type: "string" },
          description: "רשימת סקילים להפעלה",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "list_my_agent_tasks",
    description:
      'רשימת המשימות המתוזמנות של כרמן עצמה (agent_tasks). השתמשי בכלי הזה כשהמשתמש שואל "מה תזמנת?", "באיזו שעה התזכורת?", "תבדקי אם הגדרת" — אסור לענות על שאלות כאלה מהזיכרון בלי לקרוא לכלי הזה. מחזיר זמני תזמון בשעון ישראל.',
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "running", "completed", "failed"],
          description: "סינון לפי סטטוס (אופציונלי)",
        },
        limit: { type: "integer", description: "ברירת מחדל 10" },
      },
    },
  },
  {
    name: "recall_recent_action",
    description:
      "בדיקה אם כרמן כבר ביצעה פעולה כבדה לאחרונה (pulse_check, campaign_analysis, lead_review וכד׳). חובה לקרוא לכלי הזה לפני סקירת קמפיינים / סקירת לידים — כדי לא לעבוד פעמיים. בדיקת דופק לא צריכה את זה: get_latest_campaign_pulse מחזיר את הבדיקה השמורה, ו-refresh_campaign_pulse מרענן אותה. מחזיר את הסיכום של הריצה האחרונה אם נמצאה בחלון הזמן. אם נמצא תוצאה: ענה על הסיכום הקיים וציין את הזמן (בשעון ישראל), ושאל את המשתמש אם לרענן.",
    parameters: {
      type: "object",
      properties: {
        action_type: {
          type: "string",
          description:
            "שם הפעולה — לדוגמה pulse_check, campaign_analysis, lead_review",
        },
        max_age_hours: {
          type: "integer",
          description: "גיל מקסימלי של הריצה הקודמת בשעות (ברירת מחדל 8)",
        },
      },
      required: ["action_type"],
    },
  },
  {
    name: "record_action_episode",
    description:
      "שמירת תוצאה של פעולה כבדה ב-long-term memory של כרמן (carmen_memory_episodes). חובה לקרוא בסיום של סקירת קמפיינים / סקירת לידים — כדי שבפעם הבאה recall_recent_action ימצא את התוצאה. כתוב summary תמציתי של מה שמצאת.",
    parameters: {
      type: "object",
      properties: {
        action_type: {
          type: "string",
          description: "pulse_check / campaign_analysis / lead_review וכד׳",
        },
        summary: {
          type: "string",
          description:
            "סיכום תמציתי של מה שמצאת — מספר לקוחות, דגלים, אזהרות, החלטות",
        },
        topic_tags: {
          type: "array",
          items: { type: "string" },
          description: "תגיות נוספות (לקוחות מעורבים, סוכנויות וכו׳)",
        },
        importance: { type: "integer", description: "1-100 (ברירת מחדל 50)" },
      },
      required: ["action_type", "summary"],
    },
  },
  {
    name: "search_tasks",
    description:
      "חיפוש משימות לפי שם/כותרת. חשוב! השתמש בכלי הזה לפני יצירת משימה כדי לוודא שהיא לא קיימת כבר",
    parameters: {
      type: "object",
      properties: {
        search_term: {
          type: "string",
          description: "מילת חיפוש בכותרת המשימה",
        },
        status: { type: "string" },
        client_id: { type: "string" },
      },
      required: ["search_term"],
    },
  },
];
