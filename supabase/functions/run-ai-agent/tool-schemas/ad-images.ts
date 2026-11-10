export const adImagesTools = [
  {
    name: "generate_ad_image",
    description:
      "יצירת תמונה למודעה/פוסט באמצעות AI. מחזיר URL של התמונה שנוצרה. השתמש בכלי הזה כדי ליצור ויזואל למודעות ופוסטים ואז השתמש ב-create_social_post כדי לשמור את הפוסט.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "תיאור מפורט של התמונה הרצויה באנגלית",
        },
        aspect_ratio: {
          type: "string",
          enum: ["1:1", "16:9", "9:16", "4:5"],
          description: "יחס גובה-רוחב",
        },
        reference_urls: {
          type: "array",
          items: { type: "string" },
          description:
            "קישורי https של תמונות רפרנס (סגנון, דמות, מוצר) שהתמונה צריכה להתאים להן",
        },
        engine: {
          type: "string",
          enum: ["google", "elevenlabs", "higgsfield", "openai"],
          description:
            "מנוע תמונות מסוים. כשמחוברים כמה, שאלי את המשתמש באיזה ליצור. בלי זה נבחר אוטומטית.",
        },
      },
      required: ["prompt"],
    },
  },
];
