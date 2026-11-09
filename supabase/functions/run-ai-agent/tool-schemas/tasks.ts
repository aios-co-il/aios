export const tasksTools = [
  // TASKS (team tasks - for campaigners/team members)
  {
    name: "create_task",
    description:
      "יצירת משימה לצוות (קמפיינרים/אנשי צוות). השתמש בכלי הזה רק כשרוצים ליצור משימה לאדם אחר בצוות. אם המשימה היא לכרמן עצמה — השתמש ב-create_agent_task במקום!",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        client_id: { type: "string" },
        lead_id: { type: "string" },
        campaigner_id: {
          type: "string",
          description: "מזהה קמפיינר לשיוך המשימה",
        },
        priority: { type: "integer" },
        due_date: { type: "string" },
        due_time: { type: "string" },
        notes: { type: "string" },
        duration_minutes: { type: "integer", description: "משך המשימה בדקות" },
      },
      required: ["title"],
    },
  },
];
