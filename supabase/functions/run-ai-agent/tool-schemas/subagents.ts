export const subagentsTools = [
  // ===========================
  // SUBAGENT DELEGATION (Phase 4) — spawn focused background sub-tasks
  // ===========================
  {
    name: "delegate_to_subagent",
    description:
      "יצירת תת-סוכן (subagent) שירוץ ברקע על משימה ממוקדת — מחקר, ניתוח רב-לקוחות, סריקה ארוכה, או כל עבודה שלא חייבת להיענות בשיחה הנוכחית. מחזיר sub_task_id מיידית. השתמשי בכלי הזה במקום delegate_to_manus כשהמשימה היא פנימית למערכת (מצריכה כלים של כרמן עצמה). אסור להשתמש בו לתשובה קצרה שאפשר לענות מיד — רק כשהמשימה תיקח זמן או צריכה לרוץ ברקע במקביל לשיחה.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "כותרת קצרה לתת-המשימה" },
        prompt: {
          type: "string",
          description:
            "הוראה מפורטת מה לבצע. כתבי כאילו את מדריכה כרמן אחרת — כללי המטרה, היקף, ומה חייב להחזיר בסוף.",
        },
        task_mode: {
          type: "string",
          enum: [
            "analyst",
            "sales",
            "support",
            "copywriting",
            "scheduler",
            "onboarding",
          ],
          description: "מוד פעולה (אופציונלי)",
        },
        task_skills: {
          type: "array",
          items: { type: "string" },
          description: "סקילים להפעיל בתת-הסוכן",
        },
        priority: { type: "integer", description: "1-10" },
      },
      required: ["title", "prompt"],
    },
  },
  {
    name: "get_subagent_result",
    description:
      "בדיקת מצב/קבלת תוצאה של תת-סוכן שנוצר ב-delegate_to_subagent. מחזיר status, done, ואם הסתיים — output. אל תקראי לזה בלולאה צמודה; אם done=false פשוט המשיכי בעבודה אחרת או הודיעי למשתמש שהמשימה עדיין רצה.",
    parameters: {
      type: "object",
      properties: {
        sub_task_id: {
          type: "string",
          description: "המזהה שהוחזר מ-delegate_to_subagent",
        },
      },
      required: ["sub_task_id"],
    },
  },
  {
    name: "delegate_parallel",
    description:
      "מולטיטאסק: פיזור כמה תת-משימות עצמאיות לרקע (עד 8). משימות קריאה/ניתוח/מחקר (side_effects=false) רצות במקביל; משימות שמשנות משהו/שולחות החוצה (side_effects=true, ברירת מחדל) נכנסות לתור סדרתי ורצות אחת-בכל-רגע — לעולם לא שתיים מסוכנות יחד. סמני side_effects נכון לכל תת-משימה. כל תת-משימה עצמאית ולא חופפת. מחזיר batch_id; אספי עם get_batch_results וסנתזי. אל תשתמשי בזה למשימה אחת — לזה יש delegate_to_subagent.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          description: "מערך תת-משימות עצמאיות",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              prompt: {
                type: "string",
                description:
                  'הוראה עצמאית מלאה — מטרה, היקף, פורמט פלט, ובמפורש "אל תחפפי עם תת-משימות אחרות".',
              },
              task_skills: {
                type: "array",
                items: { type: "string" },
                description: 'סקינז לכפות על תת-משימה זו (למשל ["campaigner"])',
              },
              side_effects: {
                type: "boolean",
                description:
                  "true = משנה/שולח (תור סדרתי) · false = קריאה/ניתוח בלבד (מקבילי). ברירת מחדל true.",
              },
            },
            required: ["title", "prompt"],
          },
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "get_batch_results",
    description:
      "איסוף תוצאות של batch שנוצר ב-delegate_parallel. מחזיר לכל תת-משימה status/output (גם אם חלקן נכשלו — בידוד כשל חלקי), וכן total/completed/failed/running ו-all_done. כשהכל הושלם — סנתזי את התוצאות לתשובה אחת.",
    parameters: {
      type: "object",
      properties: {
        batch_id: {
          type: "string",
          description: "ה-batch_id שהוחזר מ-delegate_parallel",
        },
      },
      required: ["batch_id"],
    },
  },
];
