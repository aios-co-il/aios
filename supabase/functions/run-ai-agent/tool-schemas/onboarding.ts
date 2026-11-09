export const onboardingTools = [
  // CLIENT ONBOARDING
  {
    name: "create_onboarding",
    description: "יצירת תהליך קליטת לקוח חדש",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        client_id: { type: "string" },
        campaigner_id: { type: "string" },
        notes: { type: "string" },
      },
      required: ["title", "client_id"],
    },
  },
  {
    name: "list_onboarding",
    description: "רשימת תהליכי קליטת לקוחות",
    parameters: {
      type: "object",
      properties: { status: { type: "string" }, limit: { type: "integer" } },
    },
  },
  {
    name: "update_onboarding_status",
    description: "עדכון סטטוס קליטת לקוח",
    parameters: {
      type: "object",
      properties: {
        onboarding_id: { type: "string" },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "cancelled"],
        },
      },
      required: ["onboarding_id", "status"],
    },
  },
];
