export const financeTools = [
  {
    name: "list_finance",
    description:
      "רשימת תנועות מטבלת finance הישנה (legacy). להנהלת חשבונות האמיתית השתמשי ב-get_accounting_overview / list_one_time_incomes / list_income_payments.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        type: { type: "string", enum: ["income", "expense"] },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "create_finance_entry",
    description:
      "יצירת רשומה בטבלת finance הישנה (legacy). להכנסה חד-פעמית בהנהלת חשבונות השתמשי ב-create_one_time_income (דורש אישור).",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        amount: { type: "number" },
        type: { type: "string", enum: ["income", "expense"] },
        description: { type: "string" },
        date: { type: "string" },
      },
      required: ["amount", "type", "description"],
    },
  },
  {
    name: "get_finance_summary",
    description:
      "סיכום חודשי מטבלת finance הישנה (legacy). להנהלת חשבונות האמיתית השתמשי ב-get_accounting_overview.",
    parameters: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM" } },
    },
  },
];
