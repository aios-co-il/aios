export const accountingPaymentsTools = [
  {
    name: "delete_income_payment",
    description:
      "ביטול סימון גבייה (מחיקת income_payments). מכניס לתור אישורים.",
    parameters: {
      type: "object",
      properties: { payment_id: { type: "string" } },
      required: ["payment_id"],
    },
  },
  {
    name: "record_expense_payment",
    description:
      "סימון הוצאה כשולמה (insert ל-expense_payments). מכניס לתור אישורים.",
    parameters: {
      type: "object",
      properties: {
        expense_type: {
          type: "string",
          description:
            "supplier | client_fixed | supplier_payment | campaigner",
        },
        expense_id: { type: "string", description: "מזהה ספק/לקוח" },
        expense_name: { type: "string" },
        amount: { type: "number" },
        payment_month: { type: "string", description: "YYYY-MM" },
        notes: { type: "string" },
      },
      required: [
        "expense_type",
        "expense_id",
        "expense_name",
        "amount",
        "payment_month",
      ],
    },
  },
  {
    name: "delete_expense_payment",
    description: "ביטול סימון תשלום הוצאה. מכניס לתור אישורים.",
    parameters: {
      type: "object",
      properties: { payment_id: { type: "string" } },
      required: ["payment_id"],
    },
  },
  {
    name: "update_client_retainer",
    description:
      "עדכון ריטיינר/תקציב חודשי של לקוח (upsert ל-client_tenant_financial_data). מכניס לתור אישורים.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        retainer: { type: "number" },
        monthly_budget: { type: "number" },
        notes: { type: "string" },
      },
      required: ["client_id"],
    },
  },
];
