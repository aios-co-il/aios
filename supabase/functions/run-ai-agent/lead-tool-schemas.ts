export const leadCreationTools = [
  // LEADS
  {
    name: "create_lead",
    description: "יצירת ליד חדש",
    parameters: {
      type: "object",
      properties: {
        company_name: { type: "string" },
        contact_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        source: { type: "string" },
        notes: { type: "string" },
      },
      required: ["contact_name"],
    },
  },
  {
    name: "list_leads",
    description:
      "רשימת הלידים של הסוכנות עצמה (לקוחות פוטנציאליים של הסוכנות). לא הלידים של לקוחות הסוכנות: אלה מגיעים מהדוחות (get_latest_campaign_pulse, get_facebook_campaign_data).",
    parameters: {
      type: "object",
      properties: { status: { type: "string" }, limit: { type: "integer" } },
    },
  },
  {
    name: "update_lead_status",
    description: "עדכון סטטוס ליד",
    parameters: {
      type: "object",
      properties: { lead_id: { type: "string" }, status: { type: "string" } },
      required: ["lead_id", "status"],
    },
  },
  {
    name: "add_lead_update",
    description: "הוספת עדכון לליד",
    parameters: {
      type: "object",
      properties: { lead_id: { type: "string" }, content: { type: "string" } },
      required: ["lead_id", "content"],
    },
  },
];

export const leadMutationTools = [
  // LEADS - full CRUD
  {
    name: "update_lead",
    description: "עדכון פרטי ליד קיים (שם, טלפון, אימייל, מקור, הערות)",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        company_name: { type: "string" },
        contact_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        source: { type: "string" },
        notes: { type: "string" },
        follow_up_date: {
          type: "string",
          description: "תאריך מעקב בפורמט YYYY-MM-DD",
        },
      },
      required: ["lead_id"],
    },
  },
  {
    name: "delete_lead",
    description:
      "העברת ליד לארכיון (לא מחיקה לצמיתות). אפשר לשחזר מארכיון הלידים.",
    parameters: {
      type: "object",
      properties: { lead_id: { type: "string" } },
      required: ["lead_id"],
    },
  },
];
