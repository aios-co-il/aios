export const automationTools = [
  {
    name: "list_automations",
    description:
      "רשימת אוטומציות (id, name, active, trigger_type, is_flow). לפרטי שלבים השתמשי ב-get_automation_details.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer" },
        active_only: { type: "boolean" },
        name_search: { type: "string" },
      },
    },
  },
  {
    name: "get_automation_details",
    description:
      "פרטי אוטומציה כולל צעדי flow (automation_flow_steps) — טריגר, agent, action, condition.",
    parameters: {
      type: "object",
      properties: {
        automation_id: { type: "string" },
        name_search: { type: "string" },
      },
    },
  },
  {
    name: "toggle_automation",
    description: "הפעלה/כיבוי אוטומציה. מכניס לתור אישורים — לא מבצע מיד.",
    parameters: {
      type: "object",
      properties: {
        automation_id: { type: "string" },
        active: { type: "boolean" },
      },
      required: ["automation_id", "active"],
    },
  },
  {
    name: "delete_automation",
    description: "מחיקת אוטומציה (כולל צעדי flow). מכניס לתור אישורים.",
    parameters: {
      type: "object",
      properties: { automation_id: { type: "string" } },
      required: ["automation_id"],
    },
  },
  {
    name: "propose_automation_edit",
    description:
      "הצעת עריכה לאוטומציה קיימת (שם/תיאור/טריגר/החלפת steps). מכניס לתור אישורים; אחרי אישור מעדכן את האוטומציה.",
    parameters: {
      type: "object",
      properties: {
        automation_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        trigger_type: { type: "string" },
        trigger_config: { type: "object" },
        steps: {
          type: "array",
          description:
            "אם מסופק — מחליף את כל צעדי ה-flow (חוץ מהטריגר נבנה מחדש)",
          items: { type: "object" },
        },
      },
      required: ["automation_id"],
    },
  },
  {
    name: "inspect_meta_lead_forms",
    description:
      "בדיקה חיה של טפסי לידים ב-Meta ושל הטופס המחובר לאוטומציה. מחזיר אוטומציות, Page/Form ID, שמות, סטטוס ושדות. השתמשי בכלי זה לפני החלפה או יצירה של טופס, וניתן לחפש לפי שם אוטומציה, עמוד או טופס.",
    parameters: {
      type: "object",
      properties: {
        automation_name: {
          type: "string",
          description: "שם מלא או חלקי של האוטומציה",
        },
        page_name: {
          type: "string",
          description: "שם מלא או חלקי של עמוד Meta",
        },
        form_name: {
          type: "string",
          description: "שם מלא או חלקי של טופס הלידים",
        },
      },
    },
  },
];
