export const taskListTools = [
  {
    name: "list_tasks",
    description: "רשימת משימות",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string" },
        client_id: { type: "string" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "update_task_status",
    description: "עדכון סטטוס משימה",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: {
          type: "string",
          enum: ["open", "in_progress", "done", "completed"],
        },
      },
      required: ["task_id", "status"],
    },
  },
];
