export const adAccountConnectionsTools = [
  {
    name: "connect_google_ads_account",
    description:
      "שיוך חשבון Google Ads (customer_id) ללקוח ב-CRM. שומר את המזהה ב-clients.google_ads_account_id.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "מזהה הלקוח" },
        customer_id: {
          type: "string",
          description: "מזהה חשבון Google Ads (ספרות בלבד, ללא מקפים)",
        },
      },
      required: ["client_id", "customer_id"],
    },
  },
  {
    name: "connect_client_meta_ad_account",
    description:
      "שיוך חשבון מודעות Meta/Facebook (act_...) ללקוח ב-CRM. מעדכן clients.meta_ads_account_id (מקור האמת ל-analyze_campaign/get_client_info) ומסנכרן טבלת facebook_insights אם קיימת. אם כבר מחובר חשבון אחר — דורש confirm_replace=true אחרי אזהרה מפורשת.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "מזהה הלקוח (UUID)" },
        ad_account_id: {
          type: "string",
          description: "מזהה חשבון מודעות Meta (act_XXXXX או ספרות)",
        },
        account_name: {
          type: "string",
          description:
            "שם חשבון המודעות (אופציונלי, לעדכון טבלת facebook_insights)",
        },
        platform: {
          type: "string",
          enum: ["facebook", "meta", "facebook/meta"],
          description: "ברירת מחדל facebook/meta",
        },
        confirm_replace: {
          type: "boolean",
          description: "חובה true כדי להחליף חשבון Meta קיים אחר",
        },
      },
      required: ["client_id", "ad_account_id"],
    },
  },
];
