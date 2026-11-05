/** workshop_save_script: the film's script, written after the concept and approved before scenes. */

import { SCRIPT_GUIDE, WORDS_PER_SECOND } from "./film-script.ts";

export const SAVE_SCRIPT_TOOL = {
  name: "workshop_save_script",
  description: `שומרת את התסריט של הסרט כעמוד בלוח ומציגה אותו למשתמש עם כפתורי אישור. הסדר בסרט חדש: בריף, קונספטים, בחירת קונספט, תסריט (הכלי הזה), אישור התסריט, סטוריבורד, תמונות, הפקה. כותבים רק אחרי שהמשתמש בחר קונספט, לפיו (בלי קונספט שנבחר הכלי מסרב). ${SCRIPT_GUIDE} השרת מחשב את הזמנים, בודק שהסכום שווה לאורך הסרט ושכל שורה נאמרת בזמן שלה (${WORDS_PER_SECOND} מילים לשנייה). say_to_user נשלח למשתמש כמו שהוא; עצרי אחריו. בקשת שינוי: כתבי מחדש ושמרי שוב. אחרי שהמשתמש אישר לא שומרים שוב: ממשיכים ל-workshop_storyboard. לא עולה כסף.`,
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string" },
      title: { type: "string", description: "שם התסריט, בדרך כלל שם הקונספט" },
      beats: {
        type: "array",
        description: "שורות התסריט לפי הסדר; כל שורה תהיה סצנה בסטוריבורד",
        items: {
          type: "object",
          properties: {
            duration_s: { type: "number", description: "כמה שניות השורה" },
            narration: {
              type: "string",
              description: "מה הקריין אומר, בעברית, משפט קצר שנשמע טבעי",
            },
            on_screen: {
              type: "string",
              description:
                "הכותרת הקצרה על המסך (מושן גרפיקס), עד 5 מילים, לא חזרה על הקריינות",
            },
            visual: { type: "string", description: "מה רואים, בעברית" },
          },
          required: ["duration_s", "visual"],
        },
      },
    },
    required: ["item_id", "beats"],
  },
};
