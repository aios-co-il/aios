export const campaignSchedulingTools = [
  // ===========================
  // SCHEDULED PAUSE/RESUME
  // ===========================
  {
    name: "schedule_campaign_toggle",
    description:
      'תזמון אוטומטי של כיבוי/הדלקה בלוח זמנים (cron) או חד-פעמי (run_at). דורש אישור. דוגמה: לכבות כל יום ב-22:00 → cron_expression "0 22 * * *". להדליק ראשון-חמישי 07:00 → "0 7 * * 1-5".',
    parameters: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        entity_type: {
          type: "string",
          enum: ["fb_campaign", "fb_adset", "fb_ad", "google_campaign"],
        },
        action: { type: "string", enum: ["pause", "resume"] },
        cron_expression: { type: "string" },
        run_at: { type: "string", description: "ISO datetime לחד-פעמי" },
        timezone: { type: "string", description: "ברירת מחדל Asia/Jerusalem" },
        client_id: { type: "string" },
        notes: { type: "string" },
      },
      required: ["entity_id", "entity_type", "action"],
    },
  },
  {
    name: "list_campaign_schedules",
    description: "רשימת תזמונים פעילים של פעולות על קמפיינים (כיבוי/הדלקה).",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        only_enabled: { type: "boolean" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "cancel_campaign_schedule",
    description: "ביטול תזמון קיים.",
    parameters: {
      type: "object",
      properties: { schedule_id: { type: "string" } },
      required: ["schedule_id"],
    },
  },
];
