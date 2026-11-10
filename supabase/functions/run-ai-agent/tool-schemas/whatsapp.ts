export const whatsappTools = [
  {
    name: "create_whatsapp_instance",
    description:
      "יצירת instance חדש של WhatsApp ב-Gateway עבור לקוח. מחזיר integrationId ו-instanceId. לאחר יצירה, השתמש ב-get_whatsapp_qr_link כדי לקבל קישור סריקה.",
    parameters: {
      type: "object",
      properties: {
        displayName: {
          type: "string",
          description: 'שם תצוגה לחיבור (לדוגמה: "יוסי - עסק")',
        },
        countryCode: {
          type: "string",
          description: "קידומת מדינה (ברירת מחדל: 972 לישראל)",
        },
      },
      required: ["displayName"],
    },
  },
  {
    name: "get_whatsapp_qr_link",
    description:
      "קבלת קישור ציבורי לסריקת QR לחיבור WhatsApp. שלח את הקישור ללקוח. הקישור תקף ל-2 שעות.",
    parameters: {
      type: "object",
      properties: {
        integrationId: {
          type: "string",
          description:
            "מזהה האינטגרציה (מ-create_whatsapp_instance או מ-list_integrations)",
        },
      },
      required: ["integrationId"],
    },
  },
  {
    name: "get_whatsapp_status",
    description:
      "בדיקת סטטוס חיבור WhatsApp של instance. מחזיר CONNECTED/DISCONNECTED/QR_READY ומספר הטלפון אם מחובר.",
    parameters: {
      type: "object",
      properties: {
        integrationId: { type: "string", description: "מזהה האינטגרציה" },
      },
      required: ["integrationId"],
    },
  },
  {
    name: "send_whatsapp_via_gateway",
    description:
      "שליחת הודעת WhatsApp לכל מספר (גם למשתמש עצמו או לאיש קשר פרטי) דרך קו הוואטסאפ של הארגון. בלי integrationId נשלח מקו ה-manus_wa הפעיל של הארגון.",
    parameters: {
      type: "object",
      properties: {
        integrationId: {
          type: "string",
          description:
            "מזהה קו manus_wa מסוים (לא חובה; בלי זה נשלח מהקו הפעיל של הארגון)",
        },
        phone: { type: "string", description: "מספר טלפון (עם או בלי קידומת)" },
        message: { type: "string", description: "תוכן ההודעה" },
      },
      required: ["phone", "message"],
    },
  },
  {
    name: "delegate_to_github_agent",
    description:
      "האצלת בעיה טכנית/באג במערכת לסוכן הגיטהאב לאבחון או תיקון. השתמש כשמדווחים על תקלה במערכת או באג בקוד.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "תיאור הבעיה/הבקשה הטכנית" },
        action: {
          type: "string",
          enum: [
            "chat_support",
            "analyze_error",
            "fix_code",
            "check_permissions",
          ],
          description: "ברירת מחדל: chat_support",
        },
      },
      required: ["message"],
    },
  },
];
