export const automationProposalTools = [
  {
    name: "propose_automation",
    description:
      'הצעת אוטומציה חדשה לבנייה — כרמן מתכננת פלואו (טריגר + שלבים) ושולחת לאישור המשתמש. האוטומציה תיווצר כבויה רק לאחר אישור, אז בטוח להציע. השתמשי בזה כשהמשתמש מבקש "תבני/תחברי לי אוטומציה". כל שלב agent יכול לכפות סקין (campaigner/seo/...). מחזיר approval_id; הסבירי למשתמש מה תכננת ובקשי אישור.',
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "שם האוטומציה" },
        description: { type: "string" },
        trigger_type: {
          type: "string",
          description:
            "סוג טריגר, למשל scheduled_daily / lead_created / whatsapp_message_received",
        },
        trigger_config: {
          type: "object",
          description:
            'הגדרת הטריגר, למשל {"hour":8,"minute":0} ל-scheduled_daily',
        },
        steps: {
          type: "array",
          description: "שלבי הפלואו בסדר לינארי",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["agent", "action", "condition", "delay", "merge"],
                description: "סוג השלב",
              },
              skin: {
                type: "string",
                description: "לשלב agent — סקין לכפות (slug)",
              },
              instruction: {
                type: "string",
                description: "לשלב agent — ההוראה לשלב",
              },
              action_type: {
                type: "string",
                description:
                  "לשלב action — למשל notification / send_greenapi_message / create_task",
              },
              config: { type: "object", description: "הגדרת השלב" },
              label: { type: "string" },
            },
            required: ["type"],
          },
        },
      },
      required: ["name", "trigger_type", "steps"],
    },
  },
];
