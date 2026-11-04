/** workshop_update_scene: a change to one scene of the storyboard. */

import { SCENE_TRANSITIONS, TRANSITION_HELP } from "./film-look.ts";
import { motionField } from "./motion-text.ts";
import { pictureField } from "./picture-text.ts";
import { SCENE_OVERLAYS, SCENE_OVERLAY_HELP } from "./scene-overlays.ts";
import { spokenField } from "./spoken-text.ts";
import { TITLE_EMPHASES, TITLE_EMPHASIS_HELP } from "./title-emphasis.ts";
import {
  TITLE_SIZES,
  TITLE_SIZE_HELP,
  TITLE_STYLES,
  TITLE_STYLE_HELP,
} from "./title-styles.ts";

export const UPDATE_SCENE_TOOL = {
  name: "workshop_update_scene",
  description:
    'משנה סצנה אחת בסרט של הפרויקט הפתוח, ורק אותה: כיתוב על המסך והסגנון והגודל שלו (title_style, title_size), קריינות, המשפט שהדמות אומרת למצלמה (dialogue, עם lipsync), מי מדברת, תנועה, תיאור התמונה, אורך או שם. השתמשי בזה כשהמשתמש בחר סצנה בלוח ("את זה", "הסצנה הזאת", "שני") או כשהוא אומר "סצנה N": עם scene_id של הסצנה שבחר, או scene_number. לא כותבים סטוריבורד מחדש בשביל שינוי בסצנה אחת. שולחים רק את השדות שמשתנים. לא עולה כסף. redo_clip=true כשהמשתמש רוצה שהסצנה הזו תונפש מחדש: רק הסרטון שלה מסומן, וה-workshop_produce_video הבא מנפיש רק אותה (לפי הצעת המחיר והתקציב). שינוי תנועה בסצנה שכבר יש לה סרטון מסמן אותה כך לבד. משפט חדש בסצנה מדברת מוקלט ומסונכרן לשפתיים מחדש בהפקה הבאה, בלי להנפיש את הסרטון שוב (חוץ ממנוע שאומר את המשפט בעצמו). בתמונה או בסרטון שהמשתמש העלה לא משנים את התמונה עצמה. אחרי השינוי אמרי במשפט אחד מה השתנה, ושאלי אם להרכיב את הסרט מחדש.',
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string", description: "מזהה הפרויקט" },
      scene_id: {
        type: "string",
        description:
          "מזהה הסצנה: מהשורה 'הסצנה שהמשתמש בחר בלוח' בהקשר הסדנה, או scene_id מ-workshop_get_state",
      },
      scene_number: {
        type: "number",
        description:
          "מספר הסצנה בסרט (1 היא הראשונה), כשהמשתמש אמר 'סצנה N' ואין scene_id",
      },
      title: { type: "string", description: "שם קצר לסצנה בלוח" },
      overlay_text: {
        type: "string",
        description: "הכיתוב על המסך, בדיוק במילים של המשתמש",
      },
      voiceover_text: {
        type: "string",
        description: spokenField(
          "הקריינות של הסצנה, בעברית. משפט שחסר בסצנה של קריינות נכנס לכאן.",
        ),
      },
      dialogue: {
        type: "string",
        description: spokenField(
          "המשפט שהדמות אומרת למצלמה בליפ סינק, בעברית (בסצנה מדברת).",
        ),
      },
      speaker: {
        type: "string",
        description:
          "מי מדברת, באנגלית (למשל Carmen, a 3D animated woman with long curly brown hair in a black blazer)",
      },
      lipsync: {
        type: "boolean",
        description:
          "true: הדמות בסצנה מדברת למצלמה בליפ סינק (צריך dialogue או voiceover_text), רק כשהמשתמש ביקש שהיא תדבר למצלמה. false: הסצנה מקבלת קריינות במקום.",
      },
      motion_prompt: {
        type: "string",
        description: motionField("איך הסצנה זזה, באנגלית."),
      },
      visual_prompt: {
        type: "string",
        description: pictureField(
          "תיאור התמונה באנגלית, רק לתמונה שנוצרה ב-AI. אחרי שינוי, workshop_make_stills יוצר מחדש רק אותה (עולה כסף).",
        ),
      },
      duration_s: {
        type: "number",
        description: "אורך הסצנה בשניות",
      },
      redo_clip: {
        type: "boolean",
        description: "true כדי להנפיש מחדש רק את הסצנה הזו בהפקה הבאה",
      },
      skin_switch: {
        type: "boolean",
        description:
          "true: המעבר לסצנה הזו מחליף את הלוק של אותה דמות (למשל לסקין אחר של כרמן) ומקבל מעבר החלפת סקין (הבזק, פופ וסוויפ של אור). false: מעבר רגיל. בלי עלות, נכנס בהרכבה הבאה.",
      },
      title_style: {
        type: "string",
        enum: [...TITLE_STYLES],
        description: `${TITLE_STYLE_HELP} לסצנה הזו בלבד, מעל הבחירה של הסרט. בלי עלות, נכנס בהרכבה הבאה.`,
      },
      title_size: {
        type: "string",
        enum: [...TITLE_SIZES],
        description: `${TITLE_SIZE_HELP} לסצנה הזו בלבד. בלי עלות, נכנס בהרכבה הבאה.`,
      },
      title_emphasis: {
        type: "string",
        enum: [...TITLE_EMPHASES],
        description: `${TITLE_EMPHASIS_HELP} לסצנה הזו בלבד, מעל הבחירה של הסרט. בלי עלות, נכנס בהרכבה הבאה.`,
      },
      scene_overlay: {
        type: "string",
        enum: [...SCENE_OVERLAYS],
        description: `${SCENE_OVERLAY_HELP} לסצנה הזו בלבד, מעל הבחירה של הסרט (none מכבה כאן את של הסרט). בלי עלות, נכנס בהרכבה הבאה.`,
      },
      transition: {
        type: "string",
        enum: [...SCENE_TRANSITIONS],
        description: `${TRANSITION_HELP} לסצנה הזו בלבד; מבטל החלפת סקין אוטומטית במעבר הזה. בלי עלות, נכנס בהרכבה הבאה.`,
      },
    },
    required: ["item_id"],
  },
};
