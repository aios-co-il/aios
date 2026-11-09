export const suppliersTools = [
  // SUPPLIERS
  {
    name: "list_suppliers",
    description: "רשימת ספקים",
    parameters: { type: "object", properties: { limit: { type: "integer" } } },
  },
  {
    name: "create_supplier",
    description: "יצירת ספק חדש",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
      },
      required: ["name"],
    },
  },
];
