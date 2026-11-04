/** workshop_produce_video: animate, narrate, score and render the film. */

import { CTA_MAX_CHARS } from "./cta.ts";
import {
  END_CARD_BACKGROUNDS,
  END_CARD_BACKGROUND_HELP,
  END_CARD_GLASS_HELP,
  END_CARD_STYLES,
  END_CARD_STYLE_HELP,
} from "./film-look.ts";
import { SCENE_OVERLAYS, SCENE_OVERLAY_HELP } from "./scene-overlays.ts";
import { TITLE_EMPHASES, TITLE_EMPHASIS_HELP } from "./title-emphasis.ts";
import {
  FILM_FONTS,
  FILM_FONT_HELP,
  TITLE_SIZES,
  TITLE_SIZE_HELP,
  TITLE_STYLES,
  TITLE_STYLE_HELP,
} from "./title-styles.ts";

export const PRODUCE_VIDEO_TOOL = {
  name: "workshop_produce_video",
  description:
    'מפיקה את הסרט: מנפישה את הסצנות, מקריינת, מוסיפה מוזיקה ומרכיבה, ברקע, והסרט מופיע בלוח כשהוא מוכן. דורש שלכל סצנה יש תמונה או סרטון של המשתמש. כשהמשתמש ביקש לאשר את התסריט או את המשפטים של הדמות לפני ההפקה, לא קוראים לזה עד שהוא אישר בהודעה שלו את מה שהצגת. סצנה מדברת (lipsync) כלולה בהצעת המחיר עם הליפ סינק שלה, ובתמונה של המשתמש היא אומרת את המשפט בקול שנבחר לפרויקט. עולה כסף ויורד מהתקציב של הפרויקט: כשהשלב נכנס בתקציב שאושר הוא רץ מיד, בלי לשאול. אם אין תקציב או שהשלב חורג ממנו, חוזר needs_budget: הציגי את התקציב המוצע ואת approval_prompt כמו שהוא, ועצרי. אחרי שהמשתמש לחץ "מאשר תקציב" קראי שוב עם approval_token שחזר. לקוח לא נדרש: בלי לקוח הפרויקט נשמר ללא שיוך, ואפשר לשייך אותו אחר כך עם workshop_assign_client.',
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
      client_id: { type: "string" },
      engine: {
        type: "string",
        enum: ["mock", "kling", "elevenlabs", "higgsfield", "openrouter"],
        description:
          "רק אם המשתמש ביקש מנוע מסוים; אחרת נבחר לפי המפתחות של הארגון. מנוע שלא מחובר לא נחשב שגיאה: השרת בוחר מנוע מחובר ומחזיר engine_note.",
      },
      voice_id: { type: "string" },
      music: { type: "boolean", description: "false רק אם ביקשו בלי מוזיקה" },
      sound_design: {
        type: "boolean",
        description:
          "עיצוב סאונד של טריילר: צליל מעבר עדין ושונה בכל מעבר בין הסצנות (שישה צלילים שלא חוזרים ברצף) ומכה נמוכה ורכה על כותרת הפתיחה ועל הסגיר, מתחת לקול. בלי זה נקבע לפי הבריף (טריילר, קולנועי, סאונד דיזיין). true כשהמשתמש ביקש אפקטים או סאונד של טריילר, false כשביקש בלי. האפקטים נוצרים פעם אחת בהפקה הזאת (כ-$0.09, כלול בהצעת המחיר); הרכבה חוזרת משתמשת בהם בחינם.",
      },
      keep_design: {
        type: "boolean",
        description:
          "true כשהתמונות הן עיצוב מוכן עם טקסט (מודעה, פוסטר, באנר): כל תמונה נשארת בדיוק כמו שהיא, שלמה בתוך הפריים, והסרט מזיז עליה מצלמה ומוסיף כתוביות, קריינות ומוזיקה. בלי מנוע וידאו, כי מנוע וידאו מצייר את התמונה מחדש ומשבש את הטקסט שבה. לא עולה כסף על הסצנות. הבחירה נשמרת לסרט: false כשהמשתמש מבקש הנפשה אמיתית (דמויות שזזות, לא רק מצלמה), גם אם הסרט שמר את העיצוב קודם.",
      },
      title_style: {
        type: "string",
        enum: [...TITLE_STYLES],
        description: `${TITLE_STYLE_HELP} לכל הסרט; סצנה יכולה לקבל סגנון משלה ב-workshop_update_scene.`,
      },
      title_size: {
        type: "string",
        enum: [...TITLE_SIZES],
        description: `${TITLE_SIZE_HELP} לכל הסרט.`,
      },
      title_emphasis: {
        type: "string",
        enum: [...TITLE_EMPHASES],
        description: `${TITLE_EMPHASIS_HELP} לכל הסרט; סצנה יכולה לקבל אפקט משלה ב-workshop_update_scene.`,
      },
      font: {
        type: "string",
        enum: [...FILM_FONTS],
        description: FILM_FONT_HELP,
      },
      scene_overlay: {
        type: "string",
        enum: [...SCENE_OVERLAYS],
        description: `${SCENE_OVERLAY_HELP} לכל הסרט; סצנה יכולה לקבל גרפיקה משלה ב-workshop_update_scene.`,
      },
      end_card_style: {
        type: "string",
        enum: [...END_CARD_STYLES],
        description: END_CARD_STYLE_HELP,
      },
      end_card_background: {
        type: "string",
        enum: [...END_CARD_BACKGROUNDS],
        description: END_CARD_BACKGROUND_HELP,
      },
      end_card_glass: {
        type: "boolean",
        description: END_CARD_GLASS_HELP,
      },
      cta_text: {
        type: "string",
        description: `קריאה לפעולה לסגיר הסרט, כשהסיום שנבחר כולל קריאה לפעולה: בדרך כלל קצרה (למשל "מחכים לכם בגפן"), וכשהמשתמש נתן משפט שלם מעבירים אותו בדיוק כמו שכתב (עד ${CTA_MAX_CHARS} תווים). משפט ארוך נשבר לעד שלוש שורות בסגיר. מופיעה בסוף הסרט עם הלוגו אם יש.`,
      },
    },
    required: ["item_id"],
  },
};
