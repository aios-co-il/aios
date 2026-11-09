export const approvalsTools = [
  // ===========================
  // APPROVAL FLOW
  // ===========================
  {
    name: "list_pending_approvals",
    description:
      'רשימת בקשות אישור פתוחות שהמשתמש רשאי לאשר, כל אחת עם קוד קצר. לאישור בקשה מהרשימה המשתמש עונה "כן" ואחריו הקוד.',
    parameters: { type: "object", properties: { limit: { type: "integer" } } },
  },
  {
    name: "execute_pending_approval",
    description:
      'ביצוע בקשת אישור פתוחה — אחרי שהמשתמש אישר ("כן"/"מאשר"/"תעשי את זה"). מבצע רק בקשה שהמשתמש עצמו ביקש בשיחה הזו ב-30 הדקות האחרונות. אחרת לא מבוצע כלום ומוחזרת רשימת בקשות עם קודים — הציגי אותה ובקשי לענות "כן" ואחריו הקוד. כספים, שליחות החוצה והגדרות דורשים בעלים/מנהל סוכנות. אסור לטעון שבוצע אלא אם success=true.',
    parameters: {
      type: "object",
      properties: {
        approval_id: { type: "string" },
        tool_name: {
          type: "string",
          description: "אופציונלי: העדף pending עם tool_name הזה",
        },
      },
    },
  },
  {
    name: "reject_pending_approval",
    description: "דחיית בקשת אישור פתוחה — אחרי שהמשתמש סירב.",
    parameters: {
      type: "object",
      properties: {
        approval_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["approval_id"],
    },
  },
];
