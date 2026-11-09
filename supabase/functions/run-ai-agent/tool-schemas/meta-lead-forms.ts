export const metaLeadFormsTools = [
  {
    name: "set_automation_meta_lead_form",
    description:
      "החלפת טופס הלידים המחובר לטריגר של אוטומציה לפי שם הטופס ב-Meta. הכלי מאמת התאמה יחידה לעמוד, לטופס ולאוטומציה, מעדכן את Form ID ורושם את הטופס לסנכרון. דורש אישור מפורש של המשתמש.",
    parameters: {
      type: "object",
      properties: {
        automation_id: {
          type: "string",
          description: "מזהה האוטומציה, אם ידוע",
        },
        automation_name: {
          type: "string",
          description: "שם מלא או חלקי של האוטומציה",
        },
        form_name: {
          type: "string",
          description: "שם טופס Meta המדויק או חלק ייחודי ממנו",
        },
        page_name: {
          type: "string",
          description: "שם עמוד Meta; מומלץ כשיש טפסים בעלי שם זהה",
        },
        confirmed: {
          type: "boolean",
          description: "חובה true ורק לאחר אישור מפורש של המשתמש",
        },
      },
      required: ["form_name", "confirmed"],
    },
  },
  {
    name: "create_meta_lead_form",
    description:
      "יצירת Instant Form חדש בעמוד Meta. ניתן גם לחבר אותו מיד לאוטומציה. טופס שפורסם ב-Meta אינו ניתן לעריכה רגילה, לכן יש להציג למשתמש את השם, השדות, מדיניות הפרטיות והעמוד ולקבל אישור מפורש לפני הקריאה.",
    parameters: {
      type: "object",
      properties: {
        page_name: {
          type: "string",
          description: "שם עמוד Meta המדויק או חלק ייחודי ממנו",
        },
        form_name: { type: "string", description: "שם הטופס החדש" },
        questions: {
          type: "array",
          description: "שדות הטופס לפי הסדר",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description:
                  "סוג שדה Meta, למשל FULL_NAME, EMAIL, PHONE, CITY, CUSTOM",
              },
              label: {
                type: "string",
                description: "חובה לשדה CUSTOM; אופציונלי לשדה רגיל",
              },
            },
            required: ["type"],
          },
        },
        privacy_policy_url: {
          type: "string",
          description: "קישור HTTPS למדיניות הפרטיות",
        },
        privacy_policy_link_text: {
          type: "string",
          description: "טקסט קישור למדיניות, ברירת מחדל מדיניות פרטיות",
        },
        follow_up_action_url: {
          type: "string",
          description: "קישור HTTPS למסך התודה/אתר לאחר השליחה",
        },
        automation_id: {
          type: "string",
          description: "אוטומציה לחיבור מיידי, אם ידועה",
        },
        automation_name: {
          type: "string",
          description: "שם אוטומציה לחיבור מיידי",
        },
        confirmed: {
          type: "boolean",
          description: "חובה true ורק לאחר אישור מפורש של המשתמש",
        },
      },
      required: [
        "page_name",
        "form_name",
        "questions",
        "privacy_policy_url",
        "follow_up_action_url",
        "confirmed",
      ],
    },
  },
];
