export const facebookInspectionTools = [
  // Placed early (near other FB tools) so OpenAI's 128-tool cap cannot drop them.
  {
    name: "inspect_facebook_ad",
    description:
      "קריאה בלבד: פרטי מודעת Meta מקור (adset_id, campaign_id, page_id, creative_id, lead_form_id, טקסט/כותרת נוכחיים). חובה לפני שכפול עם וריאציות קופי.",
    parameters: {
      type: "object",
      properties: { client_id: { type: "string" }, ad_id: { type: "string" } },
      required: ["client_id", "ad_id"],
    },
  },
  {
    name: "fb_duplicate_ad_variants",
    description:
      'שכפול מודעת Meta מנצחת ל-N מודעות חדשות באותו ad set, עם וריאציות primary_text/headline — שומר media/page/lead form. דורש אישור (pending_approval). אופציונלי: daily_budget בש"ח + budget_level=campaign|adset.',
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        source_ad_id: { type: "string" },
        count: { type: "integer", description: "כמה מודעות ליצור (עד 8)" },
        variants: {
          type: "array",
          description: "מערך {primary_text, headline?, name?, description?}",
          items: {
            type: "object",
            properties: {
              primary_text: { type: "string" },
              headline: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
            },
            required: ["primary_text"],
          },
        },
        daily_budget: {
          type: "number",
          description: 'תקציב יומי בש"ח (למשל 200)',
        },
        budget_level: {
          type: "string",
          enum: ["campaign", "adset"],
          description: "ברירת מחדל campaign",
        },
        status: {
          type: "string",
          enum: ["PAUSED", "ACTIVE"],
          description: "סטטוס המודעות החדשות — ברירת מחדל PAUSED",
        },
      },
      required: ["client_id", "source_ad_id", "variants"],
    },
  },
  {
    name: "duplicate_facebook_ad_variants",
    description:
      "Alias ל-fb_duplicate_ad_variants — שכפול מודעה עם וריאציות קופי (דורש אישור).",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        source_ad_id: { type: "string" },
        count: { type: "integer" },
        variants: { type: "array", items: { type: "object" } },
        daily_budget: { type: "number" },
        budget_level: { type: "string", enum: ["campaign", "adset"] },
        status: { type: "string", enum: ["PAUSED", "ACTIVE"] },
      },
      required: ["client_id", "source_ad_id", "variants"],
    },
  },
  {
    name: "update_facebook_budget",
    description:
      'עדכון תקציב יומי או כולל לקמפיין פייסבוק. מכניס בקשת אישור לתור — לא מבצע מיד. חריגה של מעל 20% או מעל 500 ש"ח דורשת התרעה מפורשת לפני הבקשה. אחרי אישור המשתמש — execute_pending_approval.',
    parameters: {
      type: "object",
      properties: {
        client_id: {
          type: "string",
          description: "מזהה הלקוח שהקמפיין שייך אליו",
        },
        campaign_id: { type: "string" },
        daily_budget: {
          type: "number",
          description: "תקציב יומי בשקלים (לא במיקרו-יחידות)",
        },
        lifetime_budget: { type: "number" },
      },
      required: ["client_id", "campaign_id"],
    },
  },
  {
    name: "duplicate_facebook_campaign",
    description:
      "שכפול קמפיין פייסבוק (במצב PAUSED). מכניס בקשת אישור לתור — לא מבצע מיד. אחרי אישור — execute_pending_approval.",
    parameters: {
      type: "object",
      properties: {
        client_id: {
          type: "string",
          description: "מזהה הלקוח שהקמפיין שייך אליו",
        },
        campaign_id: { type: "string" },
        name_suffix: { type: "string" },
      },
      required: ["client_id", "campaign_id"],
    },
  },
];
