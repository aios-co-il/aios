export const taskOwnershipTools = [
  // AGENT TASK OWNERSHIP
  {
    name: "take_task",
    description:
      "כרמן לוקחת בעלות על משימה - מעדכנת assigned_agent וסטטוס ל-agent_working",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        agent_name: {
          type: "string",
          description: "שם הסוכן שלוקח את המשימה (ברירת מחדל: כרמן)",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "assign_task_to_cursor",
    description:
      "מקצה משימה ל-Cursor (תור פיתוח). מעדכן assigned_agent=Cursor ומפעיל dispatch אוטומטי אם אין משימה אחרת ב-in_progress.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        notes: { type: "string", description: "הערות נוספות למשימה" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "find_dev_task_duplicates",
    description:
      "חיפוש משימות פיתוח פתוחות דומות לפי כותרת (דדופ לפני יצירה/שליחה).",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "create_dev_task",
    description:
      "יצירת משימת פיתוח מובנית (טיוטה). כולל brief: title, problem, expected/current behavior, scope, acceptance criteria. תמיד בדקי duplicates קודם.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        problem: { type: "string" },
        expected_behavior: { type: "string" },
        current_behavior: { type: "string" },
        scope: { type: "string" },
        affected_areas: { type: "string" },
        constraints: { type: "string" },
        acceptance_criteria: { type: "string" },
        base_branch: { type: "string", description: "ברירת מחדל develop" },
        environment: { type: "string", description: "ברירת מחדל staging" },
        requested_by: { type: "string" },
        priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
        assigned_agent: {
          type: "string",
          enum: ["cursor", "grok", "manus", "claude"],
        },
        dedup_of: {
          type: "string",
          description: "מזהה משימה קיימת לעדכון במקום חדשה",
        },
        goal_id: { type: "string", description: "קישור ליעד ביצוע" },
        source_message: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "approve_dev_task",
    description: "אישור משימת פיתוח לפני שליחה לסוכן קוד.",
    parameters: {
      type: "object",
      properties: { dev_task_id: { type: "string" } },
      required: ["dev_task_id"],
    },
  },
  {
    name: "dispatch_dev_task",
    description:
      "שליחת משימת פיתוח מאושרת לסוכן הקוד שלה (assigned_agent: cursor או claude). כל משימה נפתחת בסשן חדש משלה — לא בצ׳אט הישיר עם Cursor/Claude. מחזיר delivered/userStatus — אם delivered=true דווחי שנשלח גם כשיש dispatchToolError (reconciled). אם verificationFailed=true או timeout/delivery_unconfirmed — אמרי שלא אומתה הגעה (ייתכן שנשלח); אסור להגיד שקרסר לא קיבל. צייני dispatchToolError ו/או attach_dev_task_session.",
    parameters: {
      type: "object",
      properties: { dev_task_id: { type: "string" } },
      required: ["dev_task_id"],
    },
  },
  {
    name: "list_dev_tasks",
    description: "רשימת משימות פיתוח מה-Dev Task Command Center.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string" },
        priority: { type: "string" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "update_dev_task",
    description: "עדכון משימת פיתוח: PR URL, סטטוס, עדיפות, הערות.",
    parameters: {
      type: "object",
      properties: {
        dev_task_id: { type: "string" },
        pr_url: { type: "string" },
        status: { type: "string" },
        priority: { type: "string" },
        problem: { type: "string" },
        acceptance_criteria: { type: "string" },
      },
      required: ["dev_task_id"],
    },
  },
];
