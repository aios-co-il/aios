import { leadMutationTools } from "../lead-tool-schemas.ts";

export const clientMutationsTools = [
  // CLIENTS - full CRUD
  {
    name: "create_client",
    description: "יצירת לקוח חדש במערכת",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "שם העסק/לקוח" },
        contact_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        agency_id: { type: "string", description: "מזהה סוכנות (אופציונלי)" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_client",
    description: "עדכון פרטי לקוח קיים",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        name: { type: "string" },
        contact_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        status: { type: "string", enum: ["active", "inactive", "lead"] },
        notes: { type: "string" },
        follow_up_date: {
          type: "string",
          description: "תאריך לדבר עם הלקוח בפורמט YYYY-MM-DD",
        },
      },
      required: ["client_id"],
    },
  },
  {
    name: "update_client_status",
    description: "עדכון סטטוס לקוח",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        status: { type: "string", enum: ["active", "inactive", "lead"] },
      },
      required: ["client_id", "status"],
    },
  },
  {
    name: "set_campaign_table_active",
    description:
      "סימון טבלת קמפיין כפעילה/כבויה (crm_tables.campaign_active). השתמשי כשאומרים לך שקמפיין של לקוח הופסק או חזר לפעול — בדיקות דופק ובדיקות חיבורים מדווחות רק על טבלאות שמסומנות פעילות. זיהוי לפי client_id (כל טבלאות הקמפיינים של הלקוח), table_id מדויק, או table_name (חיפוש חלקי).",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        table_id: { type: "string" },
        table_name: {
          type: "string",
          description: "שם או slug של הטבלה (חיפוש חלקי)",
        },
        active: {
          type: "boolean",
          description:
            "true=הקמפיין פעיל ומדווחים עליו, false=כבוי ולא מדווחים",
        },
      },
      required: ["active"],
    },
  },
  ...leadMutationTools,
];
