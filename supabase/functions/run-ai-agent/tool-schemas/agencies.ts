export const agenciesTools = [
  {
    name: "list_agencies",
    description: "רשימת סוכנויות בטננט",
    parameters: { type: "object", properties: { limit: { type: "integer" } } },
  },
  {
    name: "create_agency",
    description: "יצירת סוכנות חדשה",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        contact_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
      },
      required: ["name"],
    },
  },
];
