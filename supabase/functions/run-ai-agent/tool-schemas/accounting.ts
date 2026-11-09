export const accountingTools = [
  // Real accounting module (AccountingIntegrations)
  {
    name: "get_accounting_overview",
    description:
      "סיכום הנהלת חשבונות לחודש: ריטיינרים צפויים, הכנסות חד-פעמיות, גביות בפועל (income_payments), הוצאות ששולמו, ורווח גולמי משוער. זה המודול האמיתי — לא טבלת finance.",
    parameters: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "YYYY-MM, ברירת מחדל החודש הנוכחי",
        },
        agency_id: { type: "string" },
        agency_name: { type: "string" },
      },
    },
  },
  {
    name: "get_client_retainer",
    description:
      "ריטיינר ותקציב חודשי של לקוח (עם overlay של client_tenant_financial_data לפי טננט).",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        client_name: { type: "string" },
      },
    },
  },
  {
    name: "list_one_time_incomes",
    description: "הכנסות חד-פעמיות לחודש (one_time_incomes).",
    parameters: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM" },
        client_id: { type: "string" },
      },
    },
  },
  {
    name: "list_income_payments",
    description: "גביות בפועל לחודש (income_payments) — מה שסומן כנגבה בתזרים.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM" },
        client_id: { type: "string" },
      },
    },
  },
  {
    name: "list_expense_payments",
    description: "הוצאות ששולמו לחודש (expense_payments).",
    parameters: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM" },
        expense_type: { type: "string" },
      },
    },
  },
  {
    name: "list_invoice_uploads",
    description: "תור חשבוניות שהועלו (invoice_uploads) — סטטוס OCR/קישור.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "processed", "linked", "failed"],
        },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "create_one_time_income",
    description:
      "יצירת הכנסה חד-פעמית בהנהלת חשבונות. מכניס לתור אישורים — לא מבצע מיד.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        product_name: { type: "string" },
        amount: { type: "number" },
        payment_month: { type: "string", description: "YYYY-MM" },
        notes: { type: "string" },
      },
      required: ["client_id", "product_name", "amount", "payment_month"],
    },
  },
  {
    name: "delete_one_time_income",
    description: "מחיקת הכנסה חד-פעמית. מכניס לתור אישורים.",
    parameters: {
      type: "object",
      properties: { income_id: { type: "string" } },
      required: ["income_id"],
    },
  },
  {
    name: "record_income_payment",
    description:
      "סימון גבייה בפועל מלקוח (insert ל-income_payments). מכניס לתור אישורים.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        amount: { type: "number" },
        payment_month: { type: "string", description: "YYYY-MM" },
        notes: { type: "string" },
      },
      required: ["client_id", "amount", "payment_month"],
    },
  },
];
