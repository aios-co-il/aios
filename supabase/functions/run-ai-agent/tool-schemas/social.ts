export const socialTools = [
  // SOCIAL MEDIA
  {
    name: "create_social_post",
    description:
      "יצירת פוסט/מודעה חדשה במודול ניהול סושיאל מדיה. השתמש בכלי הזה כדי ליצור פוסטים עם תוכן טקסטואלי ותמונות. הפוסט יישמר כטיוטה במערכת.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "כותרת הפוסט/מודעה" },
        content: {
          type: "string",
          description: "תוכן הפוסט - הקופי של המודעה",
        },
        post_type: {
          type: "string",
          enum: ["text", "image", "video", "carousel"],
          description: "סוג הפוסט",
        },
        media_urls: {
          type: "array",
          items: { type: "string" },
          description: "קישורי מדיה (תמונות/וידאו)",
        },
      },
      required: ["title", "content"],
    },
  },
];
