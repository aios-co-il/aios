export const calendarCancellationTools = [
  {
    name: "cancel_calendar_invite",
    description:
      "ביטול פגישה ביומן — המשתתפים מקבלים הודעת ביטול. חובה event_id (מ-list_calendar_events). חובה confirmed=true אחרי שהמשתמש אישר במפורש.",
    parameters: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        confirmed: {
          type: "boolean",
          description: "חובה true — רק אחרי אישור מפורש של המשתמש",
        },
      },
      required: ["event_id", "confirmed"],
    },
  },
];
