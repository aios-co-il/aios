export const campaignersTools = [
  // CAMPAIGNERS
  {
    name: "list_campaigners",
    description: "רשימת קמפיינרים בטננט",
    parameters: { type: "object", properties: { limit: { type: "integer" } } },
  },
  {
    name: "create_campaigner",
    description: "יצירת קמפיינר חדש",
    parameters: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        role: { type: "array", items: { type: "string" } },
      },
      required: ["full_name"],
    },
  },
];
