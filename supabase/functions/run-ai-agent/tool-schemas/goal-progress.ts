export const goalProgressTools = [
  {
    name: "add_goal_blocker",
    description: "רישום חסם על יעד ביצוע (מעדכן סטטוס ל-blocked).",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["goal_id", "title"],
    },
  },
  {
    name: "link_task_to_execution_goal",
    description: "קישור משימת tasks קיימת ליעד ביצוע.",
    parameters: {
      type: "object",
      properties: { goal_id: { type: "string" }, task_id: { type: "string" } },
      required: ["goal_id", "task_id"],
    },
  },
  {
    name: "get_autonomous_goal_status",
    description:
      "סטטוס יעד (כולל אוטונומי): engine_status, קריטריונים, Evidence, Completion Gate. alias ל-get_execution_goal_report על יעד אוטונומי.",
    parameters: {
      type: "object",
      properties: { goal_id: { type: "string" } },
      required: ["goal_id"],
    },
  },
];
