export const goalsTools = [
  {
    name: "create_goal",
    description: "יצירת יעד חדש במערכת היעדים ההיררכית",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        parent_goal_id: {
          type: "string",
          description: "מזהה יעד-אב (אופציונלי)",
        },
        due_date: { type: "string" },
        owner_type: { type: "string", enum: ["agent", "campaigner"] },
        owner_id: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_goals",
    description: "רשימת יעדים עם אחוז התקדמות",
    parameters: {
      type: "object",
      properties: { status: { type: "string" }, limit: { type: "integer" } },
    },
  },
  {
    name: "find_execution_goal_duplicates",
    description: "חיפוש יעדי ביצוע פתוחים דומים (דדופ לפני יצירה).",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "create_execution_goal",
    description:
      "יצירת יעד במרכז הפיקוד. autonomous=true: לולאה אוטונומית עם Completion Gate + worker. autonomous=false (ברירת מחדל): ניהול ידני עם אבני דרך. פעולות פיננסיות/פרודקשן דורשות execute_pending_approval.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        due_date: { type: "string" },
        priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
        completion_criteria: { type: "string" },
        next_action: { type: "string" },
        autonomous: {
          type: "boolean",
          description: "true = Autonomous Goal Engine (worker + evidence gate)",
        },
        objective: { type: "string" },
        risk_level: {
          type: "string",
          enum: [
            "READ",
            "SAFE_WRITE",
            "REVERSIBLE",
            "PRODUCTION",
            "DESTRUCTIVE",
          ],
        },
        success_criteria: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              description: { type: "string" },
              required: { type: "boolean" },
            },
            required: ["description"],
          },
        },
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              due_date: { type: "string" },
            },
            required: ["title"],
          },
        },
      },
      required: ["title"],
    },
  },
  {
    name: "get_execution_goal_report",
    description:
      "דוח ביצוע יעד: מה השתנה, חסמים, מה ממתין לאישור דוד, 3 פעולות הבאות.",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string" },
        since_hours: { type: "integer" },
      },
      required: ["goal_id"],
    },
  },
  {
    name: "add_goal_milestone",
    description: "הוספת אבן דרך ליעד ביצוע.",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        due_date: { type: "string" },
      },
      required: ["goal_id", "title"],
    },
  },
];
