export const salesPeopleTools = [
  {
    name: "list_sales_people",
    description: "רשימת אנשי מכירות",
    parameters: { type: "object", properties: { limit: { type: "integer" } } },
  },
  {
    name: "create_sales_person",
    description: "יצירת איש מכירות חדש",
    parameters: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
      },
      required: ["full_name"],
    },
  },
];
