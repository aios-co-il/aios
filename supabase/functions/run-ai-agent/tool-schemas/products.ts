export const productsTools = [
  // PRODUCTS
  {
    name: "list_products",
    description: "רשימת מוצרים/שירותים",
    parameters: { type: "object", properties: { limit: { type: "integer" } } },
  },
  {
    name: "create_product",
    description: "יצירת מוצר/שירות חדש",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        price: { type: "number" },
      },
      required: ["name", "price"],
    },
  },
];
