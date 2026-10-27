import { EDIT_TOOL } from "./edit-tool.ts";
import { VOICE_TOOL } from "./voice-tool.ts";

export const WORKSHOP_SKIN = "carmen_workshop";

export const WORKSHOP_TOOLS = [
  EDIT_TOOL,
  VOICE_TOOL,
  {
    name: "workshop_start_project",
    description:
      "פותחת פרויקט חדש בסדנה מבקשה חופשית אחת. מסיקה לבד סוג (סרטון, מודעה, קמפיין), פורמט לפי הערוץ, אורך וסצנות, וסגנון. לא שואלים את המשתמש על הגדרות. מחזירה item_id לשאר הכלים. לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        brief: {
          type: "string",
          description: "הבקשה של המשתמש במילותיו, כולל נושא וערוץ",
        },
        title: { type: "string", description: "כותרת קצרה (אופציונלי)" },
        client_id: {
          type: "string",
          description: "מזהה לקוח, אם ידוע מהשיחה (אופציונלי)",
        },
        kind: {
          type: "string",
          enum: ["video", "static", "campaign"],
          description: "רק אם המשתמש אמר במפורש; אחרת מסיקים מהבקשה",
        },
        formats: {
          type: "array",
          items: { type: "string", enum: ["9:16", "4:5", "1:1", "16:9"] },
          description: "רק אם המשתמש ביקש גדלים מסוימים",
        },
        duration_s: {
          type: "number",
          description: "אורך סרט בשניות, רק אם המשתמש ציין",
        },
        visual_style: { type: "string" },
      },
      required: ["brief"],
    },
  },
  {
    name: "workshop_assign_client",
    description:
      "משייכת פרויקט קיים ללקוח (או מסירה את השיוך כשלא שולחים client_id). פרויקט יכול להתקיים בלי לקוח, והשיוך אפשרי בכל שלב. לא עולה כסף. אפשר לחפש את מזהה הלקוח עם search_entities.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה הפרויקט" },
        client_id: {
          type: "string",
          description: "מזהה הלקוח; בלי זה השיוך מוסר",
        },
      },
      required: ["item_id"],
    },
  },
  {
    name: "workshop_check_connections",
    description:
      "בודקת אילו מפתחות מחוברים לדייר (OpenAI, Google, Anthropic, ElevenLabs, Higgsfield) ומה אפשר ליצור איתם: תמונות, סרטון, קריינות, מוזיקה. קראי לזה לפני שאת אומרת שאי אפשר ליצור משהו בגלל מפתח, ואחרי שגיאת מפתח. לא מחזירה את ערכי המפתחות. לא עולה כסף.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "workshop_inspect_site",
    description:
      "קוראת אתר קיים (בדרך כלל האתר של הלקוח) ומחזירה איך הוא נראה ונשמע: צבעי מותג, גופנים, כותרות, דוגמאות קופי וסגנון כתיבה, לוגו ותמונות מהאתר. בלי url היא קוראת את האתר של הלקוח או את נכס האתר של הפרויקט. הדוח נשמר בלשונית הנכסים. apply_brand=true שומר את הצבעים, הגופנים והלוגו כספר המותג של הפרויקט. לא עולה כסף. תמונה מהאתר שמגדירה את הסגנון שמרי עם workshop_add_assets.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה הפרויקט" },
        url: {
          type: "string",
          description: "כתובת האתר או עמוד בו; אפשר להשמיט כשיש אתר ללקוח",
        },
        apply_brand: {
          type: "boolean",
          description: "לשמור צבעים, גופנים ולוגו כספר המותג של הפרויקט",
        },
      },
      required: ["item_id"],
    },
  },
  {
    name: "workshop_add_assets",
    description:
      "מוסיפה נכסים ללשונית הנכסים של הפרויקט: תמונות (גם מהאתר של הלקוח, והן נשמרות אצלנו), קישורים ובריפים בטקסט. use_as_reference=true לתמונה שהיצירות צריכות ללכת לפי הסגנון שלה (עד ארבע בפרויקט). לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה הפרויקט" },
        assets: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["image", "link", "text"],
                description:
                  "image: תמונה בקישור; link: קישור; text: בריף בטקסט",
              },
              url: { type: "string" },
              text: { type: "string", description: "תוכן בריף לסוג text" },
              title: { type: "string" },
              use_as_reference: { type: "boolean" },
            },
            required: ["kind"],
          },
        },
      },
      required: ["item_id", "assets"],
    },
  },
  {
    name: "workshop_get_state",
    description:
      "מצב הפרויקט הפתוח בסדנה: מה כבר נוצר (עמודים בלוח), מה חסר, מה רץ עכשיו. קראי לזה בתחילת שיחה על פרויקט קיים.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "מזהה הפרויקט מהקשר הסדנה" },
      },
      required: ["item_id"],
    },
  },
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
        brief_answers: {
          type: "object",
          description:
            'תשובות שהמשתמש נתן לשאלות הבריף במילים חופשיות, נושא → תשובה (למשל {"קצב": "רגוע"}). נשמרות לבריף של הפרויקט.',
        },
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
      "שומרת קונספטים שכתבת לפרויקט, כל אחד כעמוד בלוח. קודם חשבי על 3 עד 5 כיוונים שונים באמת, ואז שמרי. לא עולה כסף.",
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
  {
    name: "workshop_storyboard",
    description:
      "שומרת סטוריבורד שכתבת לסרטון: סצנות עם תיאור ויזואלי, תנועה, טקסט על המסך וקריינות. כל סצנה כ-3 שניות, אלא אם יש סיבה. כשהמשתמש נתן תמונה אחרת לכל סצנה (למשל הסקין של כל יכולת), כל תמונה עוברת ב-reference_url של הסצנה שלה, לא ב-reference_urls של הפרויקט. אם כבר יש סטוריבורד, replace=true מחליף אותו. לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
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
        brief_answers: {
          type: "object",
          description:
            'תשובות שהמשתמש נתן לשאלות הבריף במילים חופשיות, נושא → תשובה (למשל {"קצב": "רגוע"}). נשמרות לבריף של הפרויקט.',
        },
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
            "בעברית, משפט לכל נושא: סגנון הסרט, קצב ואווירה, קריינות או דמות שמדברת למצלמה, מוזיקה, וסגיר (לוגו וקריאה לפעולה). רק אחרי שהמשתמש ענה או אישר. נשמר לפרויקט.",
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
                description: "תיאור הפריים באנגלית, בלי טקסט על התמונה",
              },
              motion_prompt: {
                type: "string",
                description: "איך הפריים זז, באנגלית",
              },
              overlay_text: { type: "string" },
              voiceover_text: {
                type: "string",
                description: "מה נאמר בסצנה, בעברית",
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
                description:
                  "המשפט שהדמות אומרת, בעברית. בלי זה היא אומרת את voiceover_text",
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
  },
  {
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
        brief_answers: {
          type: "object",
          description:
            'תשובות שהמשתמש נתן לשאלות הבריף במילים חופשיות, נושא → תשובה (למשל {"קצב": "רגוע"}). נשמרות לבריף של הפרויקט.',
        },
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
            "בעברית, משפט לכל נושא: סגנון הסרט, קצב ואווירה, קריינות או דמות שמדברת למצלמה, מוזיקה, וסגיר (לוגו וקריאה לפעולה). רק אחרי שהמשתמש ענה או אישר. נשמר לפרויקט.",
        },
      },
      required: ["item_id"],
    },
  },
  {
    name: "workshop_produce_video",
    description:
      'מפיקה את הסרט: מנפישה את הסצנות, מקריינת, מוסיפה מוזיקה ומרכיבה, ברקע, והסרט מופיע בלוח כשהוא מוכן. דורש שלכל סצנה יש תמונה או סרטון של המשתמש. עולה כסף ויורד מהתקציב של הפרויקט: כשהשלב נכנס בתקציב שאושר הוא רץ מיד, בלי לשאול. אם אין תקציב או שהשלב חורג ממנו, חוזר needs_budget: הציגי את התקציב המוצע ואת approval_prompt כמו שהוא, ועצרי. אחרי שהמשתמש לחץ "מאשר תקציב" קראי שוב עם approval_token שחזר. לקוח לא נדרש: בלי לקוח הפרויקט נשמר ללא שיוך, ואפשר לשייך אותו אחר כך עם workshop_assign_client.',
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
            "עיצוב סאונד של טריילר: וושים במעברים בין הסצנות ומכה נמוכה על כותרת הפתיחה ועל הסגיר, מתחת לקול. בלי זה נקבע לפי הבריף (טריילר, קולנועי, סאונד דיזיין). true כשהמשתמש ביקש אפקטים או סאונד של טריילר, false כשביקש בלי.",
        },
        cta_text: {
          type: "string",
          description:
            'קריאה לפעולה לסגיר הסרט, כשהסיום שנבחר כולל קריאה לפעולה: בדרך כלל קצרה (למשל "מחכים לכם בגפן"), וכשהמשתמש נתן משפט שלם מעבירים אותו בדיוק כמו שכתב (עד 120 תווים). משפט ארוך נשבר לעד שלוש שורות בסגיר. מופיעה בסוף הסרט עם הלוגו אם יש.',
        },
      },
      required: ["item_id"],
    },
  },
];

export const isWorkshopTool = (name: string) =>
  WORKSHOP_TOOLS.some((tool) => tool.name === name);
