export const socialAlertsTools = [
  {
    name: "get_campaign_alerts",
    description:
      "שליפת התראות פתוחות על קמפיינים (קמפיין נעצר, מודעה לא מאושרת, CPL חורג, frequency גבוה). השתמש בתחילת בדיקת דופק או כשהמשתמש שואל על מצב הקמפיינים.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        severity: { type: "string", enum: ["info", "warning", "critical"] },
        only_open: { type: "boolean", description: "ברירת מחדל true" },
      },
    },
  },
  {
    name: "acknowledge_campaign_alert",
    description: "סימון התראת קמפיין כטופלה (acknowledged).",
    parameters: {
      type: "object",
      properties: { alert_id: { type: "string" } },
      required: ["alert_id"],
    },
  },
  {
    name: "resolve_campaign_alert",
    description: "סגירת התראת קמפיין (resolved) — כשהבעיה תוקנה בפועל.",
    parameters: {
      type: "object",
      properties: { alert_id: { type: "string" } },
      required: ["alert_id"],
    },
  },
  {
    name: "list_social_pages",
    description:
      "רשימת עמודים מחוברים (פייסבוק/אינסטגרם) של הטננט. שימושי לפני פרסום או טיפול בתגובות.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["facebook", "instagram"] },
        client_id: { type: "string" },
      },
    },
  },
  {
    name: "publish_social_post",
    description:
      "פרסום פוסט/תמונה/וידאו/Reel/Story לעמוד פייסבוק או אינסטגרם. דורש page_id (UUID של social_pages, לא ה-FB page id), post_type ו-caption/media_url. דורש confirmed=true.",
    parameters: {
      type: "object",
      properties: {
        page_id: { type: "string" },
        post_type: {
          type: "string",
          enum: ["post", "photo", "video", "reel", "story", "link"],
        },
        caption: { type: "string" },
        media_url: {
          type: "string",
          description: "URL ציבורי של המדיה (חובה ל-photo/video/reel/story)",
        },
        link: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["page_id", "post_type", "confirmed"],
    },
  },
  {
    name: "fetch_social_comments",
    description:
      "משיכת תגובות חדשות מעמוד פייסבוק/אינסטגרם ועדכון מסד הנתונים.",
    parameters: {
      type: "object",
      properties: { page_id: { type: "string" } },
      required: ["page_id"],
    },
  },
  {
    name: "list_social_comments",
    description: "רשימת תגובות שלא נענו, לפי לקוח/עמוד.",
    parameters: {
      type: "object",
      properties: {
        page_id: { type: "string" },
        client_id: { type: "string" },
        only_unreplied: { type: "boolean" },
      },
    },
  },
  {
    name: "reply_to_social_comment",
    description:
      "מענה לתגובה בעמוד פייסבוק/אינסטגרם. דורש comment_row_id (UUID מ-social_comments) ו-message. דורש confirmed=true.",
    parameters: {
      type: "object",
      properties: {
        comment_row_id: { type: "string" },
        message: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["comment_row_id", "message", "confirmed"],
    },
  },
  {
    name: "hide_social_comment",
    description: "הסתרת תגובה (FB בלבד). דורש confirmed=true.",
    parameters: {
      type: "object",
      properties: {
        comment_row_id: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["comment_row_id", "confirmed"],
    },
  },
];
