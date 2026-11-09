export const agentsTools = [
  // AGENT MANAGEMENT (Carmen building & managing sub-agents)
  {
    name: "list_agents",
    description: "רשימת סוכני AI בטננט (כולל סוכנים תחתיים של כרמן).",
    parameters: {
      type: "object",
      properties: { only_active: { type: "boolean" } },
    },
  },
  {
    name: "create_agent",
    description:
      "יצירת סוכן AI חדש תחת כרמן. השתמש כשהמשתמש מבקש לבנות סוכן חדש לתפקיד ספציפי.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        talent: { type: "string", description: "תיאור התפקיד והמומחיות" },
        personality: { type: "string" },
        soul: { type: "string", description: "מטרה/ייעוד" },
        engine: { type: "string", description: "מודל (gemini-3-flash וכו׳)" },
      },
      required: ["name", "talent"],
    },
  },
  {
    name: "update_agent",
    description: "עדכון פרטי סוכן קיים.",
    parameters: {
      type: "object",
      properties: {
        agent_id: { type: "string" },
        name: { type: "string" },
        talent: { type: "string" },
        personality: { type: "string" },
        soul: { type: "string" },
        engine: { type: "string" },
        active: { type: "boolean" },
      },
      required: ["agent_id"],
    },
  },
];
