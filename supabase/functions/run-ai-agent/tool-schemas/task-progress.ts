export const taskProgressTools = [
  {
    name: "attach_dev_task_session",
    description: "קישור סשן Cursor קיים למשימת פיתוח (reconcile אחרי timeout).",
    parameters: {
      type: "object",
      properties: {
        dev_task_id: { type: "string" },
        cursor_session_id: { type: "string", description: "bc-…" },
        cursor_session_url: { type: "string" },
      },
      required: ["dev_task_id", "cursor_session_id"],
    },
  },
  {
    name: "complete_task_step",
    description:
      "כרמן מדווחת על השלמת שלב במשימה ומוסיפה עדכון מסוג agent_action",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        step_description: { type: "string" },
        mark_complete: {
          type: "boolean",
          description: "האם לסמן את המשימה כהושלמה",
        },
      },
      required: ["task_id", "step_description"],
    },
  },
  {
    name: "prioritize_tasks",
    description:
      "ניתוח משימות פתוחות והצעת סדר עדיפויות לפי דדליינים, יעדים ועומס",
    parameters: { type: "object", properties: { limit: { type: "integer" } } },
  },
];
