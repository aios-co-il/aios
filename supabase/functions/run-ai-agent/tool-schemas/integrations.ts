export const integrationsTools = [
  {
    name: "list_integrations",
    description:
      "רשימת אינטגרציות מוגדרות בטננט (סוג, סטטוס פעיל, הגדרות בסיסיות). שימושי כשרוצים לדעת מה מחובר ומה לא.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            'סינון לפי סוג אינטגרציה. "whatsapp" מחזיר את כל קווי הוואטסאפ (manus_wa, green_api, meta_whatsapp).',
        },
        only_active: { type: "boolean" },
      },
    },
  },
  {
    name: "toggle_integration",
    description: "הפעלה או השבתה של אינטגרציה לפי מזהה.",
    parameters: {
      type: "object",
      properties: {
        integration_id: { type: "string" },
        is_active: { type: "boolean" },
      },
      required: ["integration_id", "is_active"],
    },
  },
];
