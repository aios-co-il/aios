export const googleAdsTools = [
  // inspect_facebook_ad / fb_duplicate_ad_variants live next to list_facebook_ads (early in ALL_TOOLS).
  {
    name: "gads_pause",
    description: "השהיית קמפיין Google Ads. דורש אישור.",
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        campaign_id: { type: "string" },
      },
      required: ["customer_id", "campaign_id"],
    },
  },
  {
    name: "gads_resume",
    description: "הדלקת קמפיין Google Ads. דורש אישור.",
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        campaign_id: { type: "string" },
      },
      required: ["customer_id", "campaign_id"],
    },
  },
  {
    name: "gads_update_budget",
    description: "שינוי תקציב יומי לקמפיין Google Ads. דורש אישור.",
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        campaign_id: { type: "string" },
        daily_budget: { type: "number" },
      },
      required: ["customer_id", "campaign_id", "daily_budget"],
    },
  },
  {
    name: "list_google_ad_accounts",
    description:
      "שליפת כל חשבונות Google Ads המחוברים לטננט. מחזיר customer_id, name, status, client_id (אם משויך ללקוח).",
    parameters: {
      type: "object",
      properties: {
        client_id: {
          type: "string",
          description: "סינון לפי לקוח ספציפי (אופציונלי)",
        },
      },
    },
  },
  {
    name: "list_google_campaigns",
    description:
      "רשימת קמפיינים בחשבון Google Ads (חי מ-API). ספקי customer_id או client_id (ייפתר מטבלת google_ads משויכת או clients.google_ads_account_id).",
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        client_id: { type: "string" },
        name_search: { type: "string" },
        status: {
          type: "string",
          enum: ["ENABLED", "PAUSED", "REMOVED", "ALL"],
        },
      },
      required: [],
    },
  },
  {
    name: "create_google_ads_report_table",
    description:
      "יצירת טבלת דוח Google Ads ב-CRM ללקוח (integration_type=google_ads). לא מריץ sync — קראי ל-sync_google_ads_report אחרי.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        customer_id: { type: "string", description: "מזהה חשבון Google Ads" },
        account_name: { type: "string" },
        date_range: { type: "string", description: "ברירת מחדל last_30_days" },
      },
      required: ["client_id", "customer_id"],
    },
  },
  {
    name: "sync_google_ads_report",
    description:
      "סנכרון נתוני Google Ads לטבלת CRM. זהה לפי table_id או client_id (טבלת google_ads של הלקוח).",
    parameters: {
      type: "object",
      properties: {
        table_id: { type: "string" },
        client_id: { type: "string" },
      },
    },
  },
  {
    name: "sync_facebook_insights",
    description:
      "סנכרון נתוני Facebook Insights לטבלת CRM. זהה לפי table_id או client_id (טבלת facebook_insights של הלקוח).",
    parameters: {
      type: "object",
      properties: {
        table_id: { type: "string" },
        client_id: { type: "string" },
      },
    },
  },
];
