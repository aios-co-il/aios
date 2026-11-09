export const taskMutationsTools = [
  // TASKS - full CRUD
  {
    name: "update_task",
    description:
      "עדכון פרטי משימה (כותרת, תאריך, עדיפות, הערות, סטטוס, שיוך ליד/קמפיינר)",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        due_date: { type: "string" },
        due_time: { type: "string" },
        priority: { type: "integer", description: "1-10" },
        notes: { type: "string" },
        client_id: { type: "string" },
        lead_id: { type: "string" },
        campaigner_id: { type: "string" },
        duration_minutes: { type: "integer" },
        status: {
          type: "string",
          enum: ["open", "in_progress", "done", "completed"],
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "delete_task",
    description: "מחיקת משימה",
    parameters: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "add_task_update",
    description: "הוספת הערה/עדכון למשימה",
    parameters: {
      type: "object",
      properties: { task_id: { type: "string" }, content: { type: "string" } },
      required: ["task_id", "content"],
    },
  },
  {
    name: "manage_task_collaborators",
    description: "הוספה או הסרה של שותפים (קמפיינרים) למשימה",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        campaigner_id: { type: "string" },
        action: { type: "string", enum: ["add", "remove"] },
      },
      required: ["task_id", "campaigner_id", "action"],
    },
  },
];
