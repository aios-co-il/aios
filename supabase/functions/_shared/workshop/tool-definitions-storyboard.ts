/** workshop_storyboard: the film's scenes as Carmen writes them. */

import { motionField } from "./motion-text.ts";
import { pictureField } from "./picture-text.ts";
import { briefAnswersField } from "./project-brief.ts";
import { spokenField } from "./spoken-text.ts";

export const STORYBOARD_TOOL = {
  name: "workshop_storyboard",
  description:
    "שומרת סטוריבורד שכתבת לסרטון. הסדר בסרט חדש: בריף, 2 עד 3 קונספטים (workshop_save_concepts), בחירת קונספט, תסריט (workshop_save_script), אישור התסריט, סטוריבורד, תמונות (workshop_make_stills), הפקה. בלי קונספט שנבחר ותסריט שאושר הכלי לא שומר סצנות ומחזיר מה לעשות קודם. עם תסריט מאושר: סצנה אחת לכל שורה לפי הסדר, והקריינות, הטקסט על המסך והאורך נלקחים מהתסריט כמו שאושר. סצנות עם תיאור ויזואלי, תנועה, טקסט על המסך וקריינות. כל סצנה כ-3 שניות, אלא אם יש סיבה. כשהמשתמש נתן תמונה אחרת לכל סצנה (למשל הסקין של כל יכולת), כל תמונה עוברת ב-reference_url של הסצנה שלה, לא ב-reference_urls של הפרויקט. כשהמשתמש העלה את התמונות האמיתיות לסצנות ורוצה סרט מהן, workshop_edit_from_assets ולא סטוריבורד. אם כבר יש סטוריבורד, replace=true מחליף אותו; שינוי בסצנה אחת: workshop_update_scene. לא עולה כסף.",
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string" },
      from_artifact_id: {
        type: "string",
        description:
          "תמונה מהפרויקט (artifact_id, למשל מה שהמשתמש סימן) שהסרטון נבנה ממנה: כל סצנה בלי reference_url משלה נוצרת ממנה. כך תמונה בפרויקט הופכת לסרטון בלי לבקש מהמשתמש רפרנס",
      },
      replace: { type: "boolean" },
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
      concept: {
        type: "string",
        description:
          'הקונספט שהמשתמש בחר כשענה במילים (למשל "השני" → שם הקונספט השני), או קונספט שתיאר בעצמו. נשמר לבריף, והסצנות נכתבות לפיו. בחירה בכפתור נשמרת לבד.',
      },
      skip_concepts: {
        type: "boolean",
        description:
          'true רק כשהמשתמש נתן תסריט מלא משלו או ביקש במפורש לוותר על קונספטים ("בלי קונספטים, תכתבי ישר"). אחרת אל תשלחי.',
      },
      script_approved: {
        type: "boolean",
        description:
          'true רק כשהמשתמש אישר את התסריט במילים שלו בהודעה הזו ("מאשר", "מעולה, אפשר להמשיך"). אישור בכפתור נשמר לבד. בקשת שינוי היא לא אישור.',
      },
      skip_script: {
        type: "boolean",
        description:
          'true רק כשהמשתמש נתן תסריט מלא משלו או ביקש במפורש לוותר על התסריט ("בלי תסריט, ישר לסצנות"). אחרת אל תשלחי.',
      },
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            shot: {
              type: "string",
              description: "למשל Medium shot, Close-up, Wide shot",
            },
            visual_prompt: {
              type: "string",
              description: pictureField("תיאור הפריים באנגלית."),
            },
            motion_prompt: {
              type: "string",
              description: motionField("איך הפריים זז, באנגלית."),
            },
            overlay_text: { type: "string" },
            voiceover_text: {
              type: "string",
              description: spokenField("מה נאמר בסצנה, בעברית."),
            },
            duration_s: { type: "number" },
            lipsync: {
              type: "boolean",
              description:
                "true כשדמות מדברת בסצנה מול המצלמה והפה שלה צריך להתאים למילים",
            },
            speaker: {
              type: "string",
              description:
                "מי מדברת בסצנה, באנגלית (למשל young woman in a red coat)",
            },
            dialogue: {
              type: "string",
              description: spokenField(
                "המשפט שהדמות אומרת, בעברית. בלי זה היא אומרת את voiceover_text.",
              ),
            },
            reference_url: {
              type: "string",
              description:
                "רשות: קישור https לתמונה של הדמות כפי שהיא צריכה להיראות בסצנה הזו בלבד: נכס מלשונית הנכסים (url מ-workshop_get_state) או תמונה שהמשתמש נתן. כשהמשתמש נותן תמונה אחרת לכל סצנה (למשל סקין או לבוש אחר לכל יכולת שמוצגת), מעבירים את התמונה של כל סצנה כאן. התמונה של הסצנה נוצרת אז מהתמונה הזו בדיוק (פנים, שיער, לבוש, צבעים) במקום מתמונת העוגן של הפרויקט. רק תמונות אמיתיות שקיבלת, אף פעם לא מראה שהמצאת. בלי זה הסצנה הולכת לפי הרפרנסים של הפרויקט.",
            },
          },
          required: ["visual_prompt"],
        },
      },
    },
    required: ["item_id", "scenes"],
  },
};
