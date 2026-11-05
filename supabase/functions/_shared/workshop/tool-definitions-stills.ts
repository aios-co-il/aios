/** workshop_make_stills: a picture for each scene that has none yet. */

import { briefAnswersField } from "./project-brief.ts";

export const MAKE_STILLS_TOOL = {
  name: "workshop_make_stills",
  description:
    'יוצרת תמונה לכל סצנה שעדיין בלי תמונה (עד 10 בקריאה; אם נשארו, קראי שוב). התמונות נוצרות לפי הרפרנסים וה-style_bible של הפרויקט, והתמונה הראשונה נקבעת כעוגן שכל השאר נוצרות לפיו, כדי לשמור על אותה דמות ואותו סגנון. סצנה עם reference_url משלה (מהסטוריבורד) נוצרת מהתמונה שלה בלבד, עם ה-style_bible, ושומרת את הדמות בדיוק כמו בתמונה; כדי לתת לכל סצנה מראה אחר מעבירים reference_url לכל סצנה ב-workshop_storyboard, לא ב-reference_urls של הפרויקט. עולה כסף ויורד מהתקציב של הפרויקט: כשהשלב נכנס בתקציב שאושר הוא רץ מיד, בלי לשאול. אם אין תקציב או שהשלב חורג ממנו, חוזר needs_budget: הציגי את התקציב המוצע ואת approval_prompt כמו שהוא, ועצרי. אחרי שהמשתמש לחץ "מאשר תקציב" קראי שוב עם approval_token שחזר.',
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string" },
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
      redo: {
        type: "boolean",
        description:
          "true כשהמשתמש רוצה ליצור מחדש את כל תמונות הסצנות (למשל כשלא תאמו את הרפרנס או לא היו אחידות). עולה כסף, דורש אישור.",
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
      film_brief: {
        type: "string",
        description:
          "בעברית, משפט לכל נושא: סגנון הסרט, קצב ואווירה, קריינות או דמות שמדברת למצלמה, מוזיקה, וסגיר (לוגו וקריאה לפעולה). רק אחרי שהמשתמש ענה או אישר. נשמר לפרויקט כהערות שלך, לא בבריף: מה שהמשתמש אמר עובר גם ב-brief_answers.",
      },
    },
    required: ["item_id"],
  },
};
