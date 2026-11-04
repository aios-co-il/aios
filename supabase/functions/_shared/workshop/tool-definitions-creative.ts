/** The workshop's creative tools: ad pictures, film concepts and copy. */

import { briefAnswersField } from "./project-brief.ts";

export const CREATIVE_TOOLS = [
  {
    name: "workshop_make_creative",
    description:
      'יוצרת תמונות מודעה או פוסט לפרויקט, בגודל לכל ערוץ שביקשו (למשל סטורי ופיד). כל תמונה מופיעה כעמוד בלוח. עולה כסף ויורד מהתקציב של הפרויקט: כשהשלב נכנס בתקציב שאושר הוא רץ מיד, בלי לשאול. אם אין תקציב או שהשלב חורג ממנו, חוזר needs_budget: הציגי את התקציב המוצע ואת approval_prompt כמו שהוא, ועצרי. אחרי שהמשתמש לחץ "מאשר תקציב" קראי שוב עם approval_token שחזר.',
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה הפרויקט" },
        prompt: {
          type: "string",
          description:
            "תיאור מפורט של הוויזואל באנגלית: נושא, סגנון, תאורה, קומפוזיציה. בלי טקסט על התמונה, אלא אם המשתמש ביקש טקסט: אז כותבים בתיאור בדיוק מה מופיע ואיפה, והמילים עצמן בתוך גרשיים כפולים בדיוק כמו שהמשתמש כתב (גם בעברית), קצר ככל האפשר.",
        },
        formats: {
          type: "array",
          items: { type: "string", enum: ["9:16", "4:5", "1:1", "16:9"] },
          description: "ברירת מחדל: הפורמטים של הפרויקט",
        },
        engine: {
          type: "string",
          enum: ["google", "elevenlabs", "higgsfield", "openai"],
          description:
            "רשות: מנוע התמונות שהמשתמש בחר. הבחירה נשמרת לפרויקט. מנוע שלא מחובר לא נחשב שגיאה: השרת בוחר מנוע מחובר ומחזיר engine_note.",
        },
        reference_urls: {
          type: "array",
          items: { type: "string" },
          description:
            "קישורי https של תמונות רפרנס שהמשתמש צירף או נתן (עד 4). חובה להעביר אותם כשיש: כל התמונות נוצרות לפיהן. נשמרים לפרויקט.",
        },
        brief_answers: briefAnswersField,
        style_approved: {
          type: "boolean",
          description:
            "true רק אחרי שהמשתמש אישר את הסגנון (style_bible) בהודעה שלו. בלי זה הכלי יחזיר שאלות במקום לייצר.",
        },
        style_bible: {
          type: "string",
          description:
            "באנגלית, 3 עד 6 משפטים שמחזיקים את אותו מראה בכל הפרויקט: הדמות (גיל, פנים, שיער, מבנה, לבוש), המקום, פלטת צבעים, תאורה וסגנון רינדור. נשמר לפרויקט ומצורף לכל תמונה.",
        },
        approval_token: {
          type: "string",
          description:
            'האסימון שחזר עם needs_budget. שולחים אותו רק אחרי שהמשתמש לחץ "מאשר תקציב".',
        },
        budget_usd: {
          type: "number",
          description:
            "תקציב שהמשתמש ציין לפרויקט בדולרים, אם ציין. בלי זה מוצע תקציב לפי העלות.",
        },
      },
      required: ["item_id", "prompt"],
    },
  },
  {
    name: "workshop_save_concepts",
    description:
      "שומרת קונספטים שכתבת לפרויקט, כל אחד כעמוד בלוח. לא עולה כסף. לקמפיין: קודם חשבי על 3 עד 5 כיוונים שונים באמת, ואז שמרי. לסרט, במקום זה: 2 עד 3 קונספטים אחרי שאלות הבריף ולפני הסצנות, לכל אחד message, narration ו-arc; אחר כך שאלי את המשתמש בשורה [[בחירה: קונספט | שם 1 | שם 2 | שם 3]] ועצרי עד שיבחר.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        concepts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              idea: { type: "string", description: "הרעיון במשפטים ספורים" },
              message: { type: "string", description: "המסר המרכזי" },
              narration: {
                type: "string",
                description: "שורת הקריינות או הקופי של הסרט",
              },
              arc: {
                type: "string",
                description: "המהלך של הסרט במשפט או שניים",
              },
              visual: { type: "string", description: "הכיוון הוויזואלי" },
            },
            required: ["title", "idea"],
          },
        },
      },
      required: ["item_id", "concepts"],
    },
  },
  {
    name: "workshop_save_copy",
    description:
      "שומרת נוסחי קופי שכתבת (כותרת, גוף, קריאה לפעולה), כל נוסח כעמוד בלוח. לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        variations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              headline: { type: "string" },
              body: { type: "string" },
              cta: { type: "string" },
            },
            required: ["headline", "body"],
          },
        },
      },
      required: ["item_id", "variations"],
    },
  },
];
