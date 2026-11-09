export const meetingsTools = [
  // ===========================
  // MEETING BOT (Zoom / Meet / Teams)
  // ===========================
  {
    name: "join_meeting_for_client",
    description:
      "שליחת כרמן (בוט תמלול גלוי) לפגישת Zoom, Google Meet או Microsoft Teams — גם בלי זימון ביומן. מתמללת ומסכמת פגישת לקוח, פגישה פנימית שמשויכת לאיש צוות/קמפיינר, או פגישה כללית של הסוכנות. בלי יעד מפורש כרמן מזהה לקוח/צוות ואם אין התאמה שומרת סיכום סוכנות כללי.",
    parameters: {
      type: "object",
      properties: {
        meeting_url: {
          type: "string",
          description:
            "קישור מלא לפגישה (zoom.us/j/..., meet.google.com/..., teams.microsoft.com/...)",
        },
        client_id: { type: "string", description: "מזהה לקוח לשיוך הסיכום" },
        lead_id: { type: "string", description: "מזהה ליד" },
        campaigner_ids: {
          type: "array",
          items: { type: "string" },
          description: "מזהי אנשי צוות/קמפיינרים לפגישה פנימית",
        },
        agency_id: {
          type: "string",
          description: "מזהה סוכנות לסיכום כללי או פנימי",
        },
        summary_scope: {
          type: "string",
          enum: ["auto", "client", "lead", "campaigner", "agency"],
          description: "סוג יעד הסיכום",
        },
        meeting_topic: {
          type: "string",
          description: "שם/נושא הפגישה (אופציונלי)",
        },
      },
      required: ["meeting_url"],
    },
  },
  {
    name: "get_meeting_bot_status",
    description:
      "סטטוס בוט פגישה של כרמן — האם הצטרפה, מקליטה, מעבדת סיכום, או נכשלה. לפי session_id או bot_id.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        bot_id: { type: "string" },
      },
    },
  },
];
