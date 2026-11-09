export const facebookAccountsTools = [
  // FACEBOOK AD ACCOUNTS
  {
    name: "list_facebook_ad_accounts",
    description:
      "שליפת כל חשבונות המודעות מפייסבוק. מחזיר id, name, status, currency.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_facebook_report_table",
    description:
      "חיבור חשבון מודעות פייסבוק ללקוח — יוצר טבלת דוח facebook_insights ב-CRM",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "מזהה הלקוח" },
        ad_account_id: {
          type: "string",
          description: "מזהה חשבון מודעות פייסבוק (act_XXXXX)",
        },
        ad_account_name: { type: "string", description: "שם חשבון המודעות" },
      },
      required: ["client_id", "ad_account_id", "ad_account_name"],
    },
  },
  {
    name: "list_unconnected_clients",
    description:
      "רשימת לקוחות פעילים שאין להם עדיין טבלת דוח פייסבוק (facebook_insights) ב-CRM. שימושי לזיהוי לקוחות שצריכים חיבור.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "verify_report_vs_meta",
    description:
      'בדיקת אמינות דוחות: משווה את מה שהדוח של הלקוח ב-AIOS מציג מול מטא עצמה (נתונים חיים) לאותם קמפיינים, יום אחר יום לפי אזור הזמן של חשבון המודעות — הוצאה, תוצאה עיקרית (לידים/רכישות) והכנסות לכל קמפיין, ימים חסרים, קמפיינים חסרים, והתאמת סוג הדוח (לידים/איקומרס) ליעד הקמפיין במטא. השתמשי בכלי הזה כשמבקשים "תבדקי שהדוחות תואמים למטא", "הדוח לא נכון", או לפני שליחת דוח ללקוח. בלי client_id בודק את כל הלקוחות הפעילים עם דוח פייסבוק (מנהלים בלבד); לתוצאות הבדיקה הלילית לכל הלקוחות (כולל גוגל) השתמשי ב-get_reconciliation_status. ימים שעוד לא סונכרנו מופיעים ב-not_yet_synced — אל תציגי אותם כתואמים. ענו בקצרה: כמה תקינים, ולכל לקוח עם פער — מה הפער.',
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        agency_name: {
          type: "string",
          description: "סינון לסוכנות (חיפוש חלקי בשם)",
        },
        days: {
          type: "integer",
          description: "כמה ימים מלאים אחורה (ברירת מחדל 7, עד 30)",
        },
      },
    },
  },
  {
    name: "get_reconciliation_status",
    description:
      'תוצאות הבדיקה הלילית שמשווה את הדוחות ב-AIOS מול מטא וגוגל (7 ימים מלאים, לכל קמפיין ולכל יום: הוצאה, תוצאה עיקרית והכנסות; ימים חסרים; קמפיינים שחסרים בצד אחד; ולבעלים — חשבונות מודעות עם הוצאה שלא משויכים ללקוח). קריאה בלבד מהתוצאה השמורה האחרונה — לא פונה לפלטפורמות. השתמשי כששואלים "הדוחות תואמים?", "יש פערים מול הפלטפורמה?" או לפני דוח ללקוח. בלי client_id מחזיר את כל הלקוחות (מנהלים בלבד).',
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
      },
    },
  },
  {
    name: "check_ad_accounts_health",
    description:
      'בדיקת תקינות חשבונות מודעות פייסבוק לכל הלקוחות בסקופ הקורא. מחזיר לכל לקוח: status (active/disabled/closed), has_spend_7d (האם יש הוצאה ב-7 ימים אחרונים), all_paused (האם כל הקמפיינים מושהים), token_ok (האם הטוקן תקף), flags (מערך של בעיות). השתמשי ב-pulse check ובכל בקשת "תקינות/מצב חשבונות מודעות".',
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        agency_id: { type: "string" },
      },
    },
  },
];
