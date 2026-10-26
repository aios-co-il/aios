/**
 * Carmen's workshop tools. Plain TypeScript, no Deno APIs.
 *
 * The user says what they want in one sentence; these tools decide type, format, style and
 * folder (see workshop/defaults.ts), do the work on the server and record every result as a
 * page on the workshop board (workshop_artifacts). Nothing here needs an open screen.
 *
 * Every call loads the project inside the caller's tenant and checks client access; the agent
 * runs with the service role, so RLS does not apply.
 */

import { BUDGET_REFUSAL, budgetMessage } from "./workshop/budget-messages.ts";
import { settleFromRuns } from "./workshop/budget-settle.ts";
import {
  budgetOf,
  budgetPrompt,
  checkBudget,
  refundBudget,
  remainingUsd,
  requestBudget,
  requestFresh,
  spendBudget,
  suggestCap,
} from "./workshop/budget.ts";
import type { BudgetRefusal, Quote } from "./workshop/budget-types.ts";
import { artifactRow, type ArtifactInput } from "./workshop/artifacts.ts";
import { PROVIDER_LABEL, capabilityReport } from "./workshop/capabilities.ts";
import { briefingGate } from "./workshop/briefing.ts";
import { FILM_CHOICES, STYLE_CHOICES } from "./workshop/briefing-choices.ts";
import {
  answersFromArgs,
  answersFromMessage,
  briefAnswersOf,
  filmFromAnswers,
  unanswered,
  withBriefAnswers,
  briefAsked,
  withBriefAsked,
} from "./workshop/brief-answers.ts";
import {
  productionReport,
  productionRunning,
  type RunRow,
} from "./workshop/production.ts";
import {
  ASSET_BUCKET,
  assetForCarmen,
  untrusted,
  hostLabel,
  isHttpUrl,
  syncClientAssets,
  type AssetView,
} from "./workshop/assets.ts";
import {
  describeSite,
  siteReport,
  withStylesheets,
} from "./workshop/site-report.ts";
import {
  normalizeEngine,
  type ImageProvider,
} from "./workshop/image-providers.ts";
import { lookOf, stillPrompt, withLook } from "./workshop/look.ts";
import {
  estimateImages,
  imageFormatsFrom,
  planProject,
  type Format,
  type StartProjectPlan,
} from "./workshop/defaults.ts";
import {
  ENGINE_LABEL,
  isSceneEngine,
  quotedProductionEstimate,
  type SceneEngine,
  type VideoConnections,
} from "./workshop/video-cost.ts";
import { executeCreativeStudioTool } from "./creative-studio-tools.ts";
import { buildEditScenes, EDIT_TOOL } from "./workshop/edit-tool.ts";
import { chooseVoice, VOICE_TOOL } from "./workshop/voice-tool.ts";
import { narrationVoiceId } from "./workshop/voices.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

/** The skin the workshop board pins; the workshop tools are offered only inside it. */
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
            "מנוע התמונות שהמשתמש בחר. כשמחוברים כמה, הכלי מחזיר את האפשרויות ושואלים אותו. הבחירה נשמרת לפרויקט.",
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
      "שומרת סטוריבורד שכתבת לסרטון: סצנות עם תיאור ויזואלי, תנועה, טקסט על המסך וקריינות. כל סצנה כ-3 שניות, אלא אם יש סיבה. אם כבר יש סטוריבורד, replace=true מחליף אותו. לא עולה כסף.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        replace: { type: "boolean" },
        engine: {
          type: "string",
          enum: ["google", "elevenlabs", "higgsfield", "openai"],
          description:
            "מנוע התמונות שהמשתמש בחר. כשמחוברים כמה, הכלי מחזיר את האפשרויות ושואלים אותו. הבחירה נשמרת לפרויקט.",
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
      'יוצרת תמונה לכל סצנה שעדיין בלי תמונה (עד 10 בקריאה; אם נשארו, קראי שוב). התמונות נוצרות לפי הרפרנסים וה-style_bible של הפרויקט, והתמונה הראשונה נקבעת כעוגן שכל השאר נוצרות לפיו, כדי לשמור על אותה דמות ואותו סגנון. עולה כסף ויורד מהתקציב של הפרויקט: כשהשלב נכנס בתקציב שאושר הוא רץ מיד, בלי לשאול. אם אין תקציב או שהשלב חורג ממנו, חוזר needs_budget: הציגי את התקציב המוצע ואת approval_prompt כמו שהוא, ועצרי. אחרי שהמשתמש לחץ "מאשר תקציב" קראי שוב עם approval_token שחזר.',
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
            "מנוע התמונות שהמשתמש בחר. כשמחוברים כמה, הכלי מחזיר את האפשרויות ושואלים אותו. הבחירה נשמרת לפרויקט.",
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
            "רק אם המשתמש ביקש מנוע מסוים; אחרת נבחר לפי המפתחות של הארגון",
        },
        voice_id: { type: "string" },
        music: { type: "boolean", description: "false רק אם ביקשו בלי מוזיקה" },
        cta_text: {
          type: "string",
          description:
            'קריאה לפעולה קצרה לסגיר הסרט (עד 6 מילים, למשל "מחכים לכם בגפן"), כשהסיום שנבחר כולל קריאה לפעולה. מופיעה בסוף הסרט עם הלוגו אם יש.',
        },
      },
      required: ["item_id"],
    },
  },
];

export const isWorkshopTool = (name: string) =>
  WORKSHOP_TOOLS.some((tool) => tool.name === name);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** The creative stage runs are filed under: the client's, or the tenant's "no client" pipeline. */
async function creativeStageFor(
  supabase: Db,
  tenantId: string,
  clientId: string | null,
): Promise<{ pipelineId: string; stageId: string }> {
  const { data, error } = await supabase.rpc("workshop_creative_stage", {
    p_tenant_id: tenantId,
    p_client_id: clientId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    { pipeline_id?: string; stage_id?: string } | null | undefined;
  if (!row?.pipeline_id || !row?.stage_id)
    throw new Error("שלב הקריאייטיב לא נמצא בפייפליין");
  return { pipelineId: row.pipeline_id, stageId: row.stage_id };
}

export async function recordArtifact(supabase: Db, input: ArtifactInput) {
  const { data, error } = await supabase
    .from("workshop_artifacts")
    .insert(artifactRow(input))
    .select("id, kind, title, folder, status, url, thumb_url")
    .single();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    kind: string;
    title: string;
    folder: string;
    status: string;
    url: string | null;
    thumb_url: string | null;
  };
}

const briefPayload = (plan: StartProjectPlan, brief: string) => ({
  brief_text: brief,
  format: plan.format,
  project_type: plan.projectType,
  visual_style: plan.visualStyle,
  content_type: plan.contentType,
  department: "creative",
  intake_source: "carmen",
  workshop: {
    kind: plan.kind,
    formats: plan.formats,
    film: plan.film,
  },
});

const STILLS_PER_CALL = 10;
const STILL_CONCURRENCY = 5;
/** A pending picture page younger than this means its generation is still running. */
const RUNNING_WINDOW_MS = 4 * 60_000;
/** The edge function has a hard time limit: no new batch of pictures starts after this. */
const STILLS_BUDGET_MS = 50_000;
/** Scenes a redo still has to replace; their old picture stays on the board until then. */
const REDO_KEY = "workshop_redo_scenes";

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const SCENE_COLUMNS =
  "id, position, title, status, duration_s, visual_prompt, motion_prompt, overlay_text, voiceover_text, still_asset_id, clip_asset_id, clip_stale, meta";

/**
 * The film's closing card follows the ending the user chose (brief "סיום"): none, the logo only,
 * or the logo with Carmen's call to action. The render reads end_card and cta_text
 * (render-worker compose/brand.mjs).
 */
function endingOf(payload: Record<string, unknown>, ctaText: string) {
  const ending = briefAnswersOf(payload)["סיום"] ?? "";
  const next: Record<string, unknown> = { ...payload };
  next.end_card = !/בלי סגיר/.test(ending);
  if (/בלי סגיר|לוגו בלבד/.test(ending)) delete next.cta_text;
  else if (ctaText) next.cta_text = ctaText;
  return next;
}

/** The user asked for a new or changed story (a filmed storyboard may then be replaced). */
const STORY_CHANGE =
  /סטוריבורד|סצנ|תסריט|סיפור|מחדש|מההתחלה|לשנות|תשני|שני את|חדש|אחר|storyboard|scene|script/i;

/** A scene that already has a current clip (the user's own video) needs no picture. */
const hasOwnClip = (scene: Record<string, any>) =>
  Boolean(scene.clip_asset_id) && scene.clip_stale !== true;

async function loadScenes(supabase: Db, tenantId: string, itemId: string) {
  const { data } = await supabase
    .from("marketing_video_scenes")
    .select(SCENE_COLUMNS)
    .eq("item_id", itemId)
    .eq("tenant_id", tenantId)
    .order("position");
  return (Array.isArray(data) ? data : []) as Record<string, any>[];
}

/** Clip assets the free preview made; a paid production makes those scenes again. */
async function previewClipIds(
  supabase: Db,
  tenantId: string,
  itemId: string,
  ids: string[],
) {
  if (ids.length === 0) return new Set<string>();
  const { data } = await supabase
    .from("marketing_assets")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .eq("meta->>provider", "mock")
    .in("id", ids);
  return new Set(
    (Array.isArray(data) ? data : []).map((row: { id: string }) =>
      String(row.id),
    ),
  );
}

const PAGE_COLUMNS = "id, kind, title, folder, status, url, thumb_url";

/**
 * While pictures are being made the board shows a pending page per picture. It comes from the
 * database, so it appears whether or not the chat stream reaches the screen, and each pending
 * page is turned into the finished one (an update, which the live board always receives).
 * Cosmetic: any failure here must never stop the work itself.
 */
async function openPlaceholders(
  supabase: Db,
  tenantId: string,
  itemId: string,
  rows: { kind: "image" | "scene_still"; title: string; meta?: object }[],
): Promise<(string | undefined)[]> {
  const none = rows.map(() => undefined);
  try {
    await supabase
      .from("workshop_artifacts")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("status", "pending")
      .eq("meta->>placeholder", "true");
    const { data, error } = await supabase
      .from("workshop_artifacts")
      .insert(
        rows.map((row) =>
          artifactRow({
            tenantId,
            itemId,
            kind: row.kind,
            title: row.title,
            status: "pending",
            meta: { ...row.meta, placeholder: true },
          }),
        ),
      )
      .select("id");
    if (error || !Array.isArray(data)) return none;
    return rows.map((_, index) => data[index]?.id);
  } catch {
    return none;
  }
}

async function settlePlaceholder(
  supabase: Db,
  tenantId: string,
  id: string | undefined,
  patch: Record<string, unknown>,
) {
  if (!id) return null;
  try {
    const { data } = await supabase
      .from("workshop_artifacts")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(PAGE_COLUMNS)
      .maybeSingle();
    return (data ?? null) as Record<string, any> | null;
  } catch {
    return null;
  }
}

const failedPatch = (error: string) => ({
  status: "failed",
  meta: { text: error.slice(0, 300) },
});

/**
 * A scene picture always gets its page on the board. The database trigger usually does it; this
 * covers projects it skips and keeps the board right if the trigger ever fails.
 */
async function ensureStillPage(
  supabase: Db,
  tenantId: string,
  itemId: string,
  scene: Record<string, any>,
  asset: unknown,
  url: string,
  placeholderId?: string,
) {
  const assetId = asRecord(Array.isArray(asset) ? asset[0] : asset).id;
  if (typeof assetId !== "string") return;
  const { data: existing } = await supabase
    .from("workshop_artifacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("ref_table", "marketing_assets")
    .eq("ref_id", assetId)
    .maybeSingle();
  if (existing) return;
  const settled = await settlePlaceholder(supabase, tenantId, placeholderId, {
    status: "ready",
    url,
    thumb_url: url,
    ref_table: "marketing_assets",
    ref_id: assetId,
    meta: { asset_id: assetId },
  });
  if (settled) return;
  await recordArtifact(supabase, {
    tenantId,
    itemId,
    kind: "scene_still",
    title: `סצנה ${scene.position}${scene.title ? ` · ${scene.title}` : ""}`,
    url,
    refTable: "marketing_assets",
    refId: assetId,
    meta: { asset_id: assetId },
  });
}

/** What the edge function injects so this module stays free of Deno and provider code. */
export interface WorkshopDeps {
  generateImage?: (
    prompt: string,
    format: Format,
    references?: string[],
    engine?: ImageProvider,
  ) => Promise<{ image_url?: string; error?: string }>;
  /** Image engines the tenant has keys for; more than one means the user chooses. */
  imageEngines?: () => Promise<ImageProvider[]>;
  defaultEngine?: () => Promise<SceneEngine>;
  /** Video engines connected outside the LLM settings (an OpenRouter brain connection). */
  videoConnections?: () => Promise<VideoConnections>;
  envOpenAiKey?: string;
  /** Keeps work running after the chat reply is sent (the edge runtime's waitUntil). */
  background?: (work: Promise<unknown>) => void;
  /** Reads a public web page or file; the edge function supplies the address-pinned version. */
  fetchPublic?: (
    url: string,
    options?: { maxBytes?: number; accept?: string },
  ) => Promise<{
    ok: boolean;
    url: string;
    contentType: string;
    bytes: Uint8Array;
    error?: string;
  }>;
  /** Copies a picture from the web into our storage; returns its public link. */
  importImage?: (
    url: string,
    scope: { tenantId: string; itemId: string },
  ) => Promise<{ url?: string; path?: string; error?: string }>;
  /** One id per user message; a paid confirm must come in a later turn than its quote. */
  turnId?: string | null;
  /** The user's own message in this turn; a paid confirm needs the approval code in it. */
  userText?: string | null;
  /** Makes (or finds) a short sample of a narration voice; returns its creative-video path. */
  voiceSample?: (voiceId: string) => Promise<{ path?: string; error?: string }>;
  /** David approved this exact call in the approvals queue. */
  approvedOutOfBand?: boolean;
  newToken?: () => string;
}

/**
 * Runs a paid step when it fits in the project's approved budget. Otherwise stops with a budget
 * request for the user. An open request that still covers the step is kept as-is, so asking
 * again does not move it into this turn and the user's "מאשר תקציב" can still land in the next.
 */
async function gatePaid(
  supabase: Db,
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
  quote: Quote,
  args: Record<string, unknown>,
  deps: WorkshopDeps,
  offer: Record<string, unknown>,
): Promise<
  { stop: Record<string, unknown> } | { payload: Record<string, unknown> }
> {
  payload = await settleFromRuns(supabase, tenantId, itemId, payload);
  const check = checkBudget(payload, quote, {
    token: args.approval_token,
    turnId: deps.turnId ?? null,
    userText: deps.userText ?? null,
    approvedOutOfBand: deps.approvedOutOfBand === true,
  });
  if (check.ok) return { payload: check.payload };
  const budget = budgetOf(payload);
  const open = budget.request;
  const keep =
    open &&
    requestFresh(open) &&
    open.cap_usd - budget.spent_usd + 0.005 >= quote.usd;
  let request = open;
  if (!keep || !request) {
    const token = deps.newToken ? deps.newToken() : crypto.randomUUID();
    const asked = requestBudget(
      payload,
      suggestCap(budget, quote, args.budget_usd),
      deps.turnId ?? null,
      token,
      new Date(),
      quote.tool,
    );
    await savePayload(supabase, tenantId, itemId, asked.payload);
    request = asked.request;
  }
  const reason: BudgetRefusal = check.reason;
  const { message: _offerText, ...offerDetails } = offer;
  return {
    stop: {
      ...offerDetails,
      needs_budget: true,
      step_usd: Math.round(quote.usd * 100) / 100,
      budget_usd: budget.cap_usd,
      spent_usd: budget.spent_usd,
      left_usd: remainingUsd(budget),
      proposed_budget_usd: request.cap_usd,
      approval_token: request.token,
      approval_prompt: budgetPrompt(request.cap_usd, request.code),
      refused: reason,
      say_to_user: budgetMessage(budget, quote.usd, request.cap_usd, request),
      carmen_next: `${BUDGET_REFUSAL[reason]} שלחי את say_to_user כמו שהוא; carmen_next הוא רק בשבילך.`,
    },
  };
}

/** A picture that was not made is not charged: give its reservation back to the budget. */
async function refundMissing(
  supabase: Db,
  tenantId: string,
  itemId: string,
  tool: "workshop_make_creative" | "workshop_make_stills",
  missing: number,
) {
  if (missing <= 0) return;
  try {
    const { data } = await supabase
      .from("marketing_work_items")
      .select("payload")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const payload = asRecord(data?.payload);
    const refunded = refundBudget(payload, tool, missing);
    if (refunded !== payload)
      await savePayload(supabase, tenantId, itemId, refunded);
  } catch {
    // Keeping the reservation is the safe side of a refund that could not be written.
  }
}

/** Board pages for voice samples, and saving the chosen voice on the project. */
function voiceHelpers(
  supabase: Db,
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
  deps: WorkshopDeps,
) {
  return {
    voiceSample: deps.voiceSample,
    userText: deps.userText ?? null,
    addSamplePage: async (title: string, path: string, voiceId: string) => {
      // One sample page per voice in a project, however often the menu is shown.
      const { data: existing } = await supabase
        .from("workshop_artifacts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("item_id", itemId)
        .eq("kind", "narration")
        .eq("meta->>voice_id", voiceId)
        .eq("meta->>sample", "true")
        .limit(1)
        .maybeSingle();
      if (existing) return;
      await recordArtifact(supabase, {
        tenantId,
        itemId,
        kind: "narration",
        folder: "voices",
        title,
        url: path,
        meta: { voice_id: voiceId, sample: true },
      });
    },
    saveVoice: (voiceId: string, voiceName: string) =>
      savePayload(
        supabase,
        tenantId,
        itemId,
        withBriefAnswers(
          {
            ...payload,
            video: { ...asRecord(payload.video), voice_id: voiceId },
          },
          { "קול קריינות": voiceName },
        ),
      ),
  };
}

async function savePayload(
  supabase: Db,
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
) {
  // asset_references belongs to the assets trigger: keep what the database holds right now, so a
  // save from an older copy of the project never wipes the pictures the user just marked.
  const current = await supabase
    .from("marketing_work_items")
    .select("payload")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const held = asRecord(current?.data?.payload).asset_references;
  const next = { ...payload };
  if (Array.isArray(held)) next.asset_references = held;
  else delete next.asset_references;
  const { error } = await supabase
    .from("marketing_work_items")
    .update({ payload: next })
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

/**
 * The briefing before any picture work: the user's style and (when several are connected) engine.
 * Returns a gate with the questions to ask, or the payload with the look folded in.
 */
async function briefProject(
  deps: WorkshopDeps,
  payload: Record<string, unknown>,
  args: Record<string, unknown>,
  options: {
    kind: "video" | "static";
    needsEngine: boolean;
    needsStyle?: boolean;
    /** Keeps new answers on the project even when the tool stops to ask more. */
    save?: (payload: Record<string, unknown>) => Promise<void>;
  },
): Promise<
  | { gate: Record<string, unknown> }
  | { payload: Record<string, unknown>; engine: ImageProvider | null }
> {
  const stored = lookOf(payload);
  const connected = deps.imageEngines ? await deps.imageEngines() : null;
  const rawEngine =
    typeof args.engine === "string" && args.engine.trim() ? args.engine : null;
  const asked = rawEngine ? normalizeEngine(rawEngine) : null;
  if (rawEngine && !asked)
    return {
      gate: {
        error: `לא מכירה את המנוע "${rawEngine}". האפשרויות: google, elevenlabs, higgsfield, openai.`,
      },
    };
  if (asked && connected && !connected.includes(asked))
    return {
      gate: {
        error: `אין מפתח ל-${PROVIDER_LABEL[asked]} בהגדרות מודלי AI. המחוברים: ${connected.join(", ") || "אין"}.`,
      },
    };
  const chosen = (asked ??
    (stored.engine && connected?.includes(stored.engine as ImageProvider)
      ? stored.engine
      : null)) as ImageProvider | null;
  // The user's answers (taps or brief_answers) go into the project brief right away.
  const questions =
    options.kind === "video"
      ? [...STYLE_CHOICES.video, ...FILM_CHOICES]
      : STYLE_CHOICES.static;
  const fresh = {
    ...answersFromMessage(
      deps.userText ?? "",
      unanswered(questions, briefAnswersOf(payload)),
    ),
    ...answersFromArgs(args.brief_answers),
  };
  const briefed = withBriefAnswers(payload, fresh);
  const answers = briefAnswersOf(briefed);
  const writtenFilm =
    options.kind === "video" && !stored.film ? filmFromAnswers(answers) : null;
  const folded = withLook(briefed, {
    ...args,
    engine: asked,
    ...(writtenFilm && !args.film_brief ? { film_brief: writtenFilm } : {}),
  });
  const look = lookOf(folded.payload);
  const gate = briefingGate({
    look,
    styleApproved: args.style_approved === true || stored.bible.length > 0,
    connected,
    engine: chosen,
    kind: options.kind,
    needsEngine: options.needsEngine,
    needsStyle: options.needsStyle,
    answers,
    asked: briefAsked(payload),
  });
  if (gate) {
    // Shown to the user now: from the next turn Carmen may fill in what they leave open.
    const asking = typeof gate.say_to_user === "string" && gate.say_to_user;
    if (
      options.save &&
      (Object.keys(fresh).length > 0 || writtenFilm || asking)
    ) {
      const kept = withLook(
        briefed,
        writtenFilm ? { film_brief: writtenFilm } : {},
      ).payload;
      await options.save(asking ? withBriefAsked(kept) : kept);
    }
    return { gate: gate as unknown as Record<string, unknown> };
  }
  return {
    payload: folded.payload,
    engine: chosen ?? (connected?.length === 1 ? connected[0] : null),
  };
}

async function loadProject(
  supabase: Db,
  tenantId: string,
  itemId: string,
  assertClientAccess: (clientId: string) => Promise<void>,
) {
  const loaded = await supabase
    .from("marketing_work_items")
    .select("id, title, client_id, current_stage_id, payload")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loaded.error) return { error: loaded.error.message };
  if (!loaded.data) return { error: "פרויקט לא נמצא" };
  if (loaded.data.client_id) {
    try {
      await assertClientAccess(loaded.data.client_id);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "אין הרשאה ללקוח הזה",
      };
    }
  }
  return {
    project: {
      id: loaded.data.id as string,
      title: (loaded.data.title as string | null) ?? "",
      client_id: (loaded.data.client_id as string | null) ?? null,
      stage_id: (loaded.data.current_stage_id as string | null) ?? null,
      payload: asRecord(loaded.data.payload),
    },
  };
}

const publicUrlOf = (supabase: Db) => (path: string) =>
  supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data
    .publicUrl as string;

const ASSET_COLUMNS =
  "id, asset_type, source, title, url, storage_path, text, use_as_reference, meta, created_at";

async function loadAssets(
  supabase: Db,
  tenantId: string,
  itemId: string,
): Promise<AssetView[]> {
  const { data } = await supabase
    .from("workshop_assets")
    .select(ASSET_COLUMNS)
    .eq("item_id", itemId)
    .eq("tenant_id", tenantId)
    .order("created_at");
  return Array.isArray(data) ? (data as AssetView[]) : [];
}

/** Pictures passed to a tool as references also show in the assets tab, so the user sees what Carmen follows. */
async function mirrorReferences(
  supabase: Db,
  tenantId: string,
  itemId: string,
  urls: unknown,
) {
  const wanted = (Array.isArray(urls) ? urls : [])
    .filter(isHttpUrl)
    .slice(0, 4);
  if (wanted.length === 0) return;
  const known = new Set(
    (await loadAssets(supabase, tenantId, itemId)).map((a) => a.url),
  );
  const rows = wanted
    .filter((url) => !known.has(url))
    .map((url) => ({
      tenant_id: tenantId,
      item_id: itemId,
      asset_type: "image",
      source: "user",
      title: "רפרנס",
      url,
      use_as_reference: true,
      meta: { from: "reference_urls" },
    }));
  if (rows.length > 0) await supabase.from("workshop_assets").insert(rows);
}

export async function executeWorkshopTool(
  supabase: Db,
  tenantId: string,
  name: string,
  args: Record<string, unknown>,
  assertClientAccess: (clientId: string) => Promise<void> = async () => {},
  userId: string | null = null,
  deps: WorkshopDeps = {},
) {
  if (!isWorkshopTool(name)) return { error: "כלי לא מוכר" };

  if (name === "workshop_start_project") {
    const brief = String(args.brief ?? "").trim();
    if (!brief) return { error: "brief נדרש" };
    const clientId = String(args.client_id ?? "").trim() || null;
    if (clientId) {
      try {
        await assertClientAccess(clientId);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "אין הרשאה ללקוח הזה",
        };
      }
    }
    const plan = planProject({
      brief,
      title: typeof args.title === "string" ? args.title : undefined,
      kind: ["video", "static", "campaign"].includes(String(args.kind))
        ? (args.kind as StartProjectPlan["kind"])
        : undefined,
      formats: Array.isArray(args.formats)
        ? (args.formats as unknown[]).map(String)
        : undefined,
      duration_s:
        typeof args.duration_s === "number" ? args.duration_s : undefined,
      visual_style:
        typeof args.visual_style === "string" ? args.visual_style : undefined,
    });
    let pipelineId: string | null = null;
    let stageId: string | null = null;
    if (clientId) {
      try {
        ({ pipelineId, stageId } = await creativeStageFor(
          supabase,
          tenantId,
          clientId,
        ));
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : "פתיחת הפייפליין נכשלה",
        };
      }
    }
    const created = await supabase
      .from("marketing_work_items")
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        pipeline_id: pipelineId,
        current_stage_id: stageId,
        title: plan.title,
        status: "draft",
        target_channel: plan.projectType === "video" ? "video" : "creative",
        payload: briefPayload(plan, brief),
        created_by: userId,
      })
      .select("id")
      .single();
    if (created.error) return { error: created.error.message };
    const itemId = created.data.id as string;
    const artifact = await recordArtifact(supabase, {
      tenantId,
      itemId,
      kind: "brief",
      title: plan.title,
      meta: { summary: plan.summary, brief, plan },
    });
    let clientAssets = 0;
    if (clientId) {
      const synced = await syncClientAssets(
        supabase,
        { tenantId, itemId, clientId },
        publicUrlOf(supabase),
      );
      clientAssets = synced.added;
    }
    return {
      success: true,
      item_id: itemId,
      title: plan.title,
      client_assets: clientAssets,
      decided: {
        kind: plan.kind,
        format: plan.format,
        formats: plan.formats,
        visual_style: plan.visualStyle,
        film: plan.film,
      },
      summary: plan.summary,
      client_known: !!clientId,
      artifact,
      workshop: { event: "project", item_id: itemId, artifact_id: artifact.id },
    };
  }

  if (name === "workshop_check_connections") {
    const { data, error } = await supabase
      .from("tenant_integrations")
      .select("settings")
      .eq("tenant_id", tenantId)
      .eq("integration_type", "llm")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { error: error.message };
    const report = capabilityReport(
      (data?.settings ?? {}) as Record<string, unknown>,
      { openai: deps.envOpenAiKey },
      deps.videoConnections ? await deps.videoConnections() : {},
    );
    return {
      success: true,
      ...report,
      message:
        report.missing.length === 0
          ? "הכול מחובר: אפשר ליצור תמונות, סרטון, קריינות ומוזיקה."
          : `מה שחסר: ${report.missing.join("; ")}.`,
    };
  }

  if (name === "workshop_assign_client") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const wanted = String(args.client_id ?? "").trim() || null;
    if (wanted) {
      try {
        await assertClientAccess(wanted);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "אין הרשאה ללקוח הזה",
        };
      }
    }
    const assigned = await supabase.rpc("workshop_assign_client", {
      p_item_id: itemId,
      p_client_id: wanted,
    });
    if (assigned.error) return { error: assigned.error.message };
    const synced = await syncClientAssets(
      supabase,
      { tenantId, itemId, clientId: wanted },
      publicUrlOf(supabase),
    );
    return {
      success: true,
      item_id: itemId,
      client_id: wanted,
      client_assets: synced.added,
      message: wanted
        ? synced.added > 0
          ? `הפרויקט שויך ללקוח, ונכנסו ללשונית הנכסים ${synced.added} נכסים שלו (בריף, אתר, קבצים).`
          : "הפרויקט שויך ללקוח. אין ללקוח בריף, אתר או קבצים להעביר."
        : "השיוך ללקוח הוסר. הפרויקט נשאר בלי לקוח.",
      workshop: { event: "artifacts", item_id: itemId },
    };
  }

  if (name === "workshop_inspect_site") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    if (!deps.fetchPublic) return { error: "קריאת אתרים לא זמינה כאן" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const { project } = loaded;
    const assets = await loadAssets(supabase, tenantId, itemId);
    let wanted = String(args.url ?? "").trim();
    if (!wanted) {
      wanted =
        assets.find((a) => a.asset_type === "site" && a.url)?.url ??
        (typeof project.payload.client_website === "string"
          ? project.payload.client_website
          : "");
    }
    if (!wanted && project.client_id) {
      const client = await supabase
        .from("clients")
        .select("website")
        .eq("id", project.client_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      wanted = String(client.data?.website ?? "").trim();
    }
    if (!wanted)
      return {
        error:
          "אין כתובת אתר. בקשי מהמשתמש את הכתובת, או שייכי את הפרויקט ללקוח שיש לו אתר.",
      };
    const target = isHttpUrl(wanted) ? wanted : `https://${wanted}`;
    const page = await deps.fetchPublic(target, { maxBytes: 1_500_000 });
    if (!page.ok)
      return {
        error: `לא הצלחתי לקרוא את האתר: ${page.error ?? "אין תשובה"}. אפשר לבקש מהמשתמש להעלות לוגו ותמונות ידנית.`,
      };
    const html = new TextDecoder().decode(page.bytes);
    let report = siteReport(html, page.url || target);
    const styles = await Promise.all(
      report.stylesheets.slice(0, 2).map(async (sheet) => {
        const fetched = await deps.fetchPublic!(sheet, {
          maxBytes: 400_000,
          accept: "text/css,*/*",
        });
        return fetched.ok ? new TextDecoder().decode(fetched.bytes) : "";
      }),
    );
    report = withStylesheets(report, styles.filter(Boolean));
    const summary = describeSite(report);
    const existing = assets.find(
      (a) =>
        a.asset_type === "site" && (a.url === report.url || a.url === target),
    );
    const meta = {
      ...(existing?.meta ?? {}),
      inspected_at: new Date().toISOString(),
      report: {
        colors: report.colors,
        fonts: report.fonts,
        headings: report.headings,
        copy: report.copy,
        buttons: report.buttons,
        logo: report.logo,
        images: report.images,
        social: report.social,
      },
    };
    const savedSite = existing
      ? await supabase
          .from("workshop_assets")
          .update({ text: summary, meta })
          .eq("id", existing.id)
          .eq("tenant_id", tenantId)
      : await supabase.from("workshop_assets").insert({
          tenant_id: tenantId,
          item_id: itemId,
          asset_type: "site",
          source: "carmen",
          title: `האתר · ${hostLabel(report.url)}`,
          url: report.url,
          text: summary,
          meta,
        });
    if (savedSite.error) return { error: savedSite.error.message };
    let applied = false;
    const brand = asRecord(project.payload.brand_book);
    const nextPayload: Record<string, unknown> = { ...project.payload };
    if (
      typeof nextPayload.client_website !== "string" ||
      !nextPayload.client_website
    )
      nextPayload.client_website = report.url;
    if (args.apply_brand === true) {
      nextPayload.brand_book = {
        ...brand,
        colors: report.colors.length > 0 ? report.colors : (brand.colors ?? []),
        fonts: report.fonts.length > 0 ? report.fonts : brand.fonts,
        notes: String(brand.notes ?? "") || summary.slice(0, 600),
        source: "auto",
      };
      if (report.logo && !nextPayload.logo_url)
        nextPayload.logo_url = report.logo;
      applied = true;
    }
    if (
      applied ||
      nextPayload.client_website !== project.payload.client_website
    )
      await savePayload(supabase, tenantId, itemId, nextPayload);
    return {
      success: true,
      url: report.url,
      language: report.lang || undefined,
      colors: report.colors,
      fonts: report.fonts,
      site_content: untrusted({
        title: report.title,
        description: report.description,
        headings: report.headings,
        copy_samples: report.copy,
        buttons: report.buttons,
      }),
      logo: report.logo,
      images: report.images.slice(0, 8),
      brand_applied: applied,
      message:
        "קראתי את האתר ושמרתי את הדוח בלשונית הנכסים. הציגי למשתמש במשפט אחד מה מצאת (צבעים, סגנון כתיבה) והציעי להשתמש בזה. תמונה מהאתר שמרי עם workshop_add_assets.",
      workshop: { event: "artifacts", item_id: itemId },
    };
  }

  if (name === "workshop_add_assets") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const requested = (Array.isArray(args.assets) ? args.assets : []).slice(
      0,
      8,
    );
    if (requested.length === 0) return { error: "assets נדרש" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const existing = await loadAssets(supabase, tenantId, itemId);
    const byUrl = new Map(existing.map((a) => [a.url, a]));
    const added: { title: string; type: string }[] = [];
    const failed: { url?: string; reason: string }[] = [];
    let referenceCount = existing.filter(
      (a) => a.asset_type === "image" && a.use_as_reference,
    ).length;
    for (const entry of requested) {
      const item = asRecord(entry);
      const kind = String(item.kind ?? "");
      const title = String(item.title ?? "")
        .trim()
        .slice(0, 120);
      const url = String(item.url ?? "").trim();
      let wantsReference = item.use_as_reference === true;
      if (kind === "text") {
        const text = String(item.text ?? "")
          .trim()
          .slice(0, 8000);
        if (!text) {
          failed.push({ reason: "טקסט ריק" });
          continue;
        }
        const savedText = await supabase.from("workshop_assets").insert({
          tenant_id: tenantId,
          item_id: itemId,
          asset_type: "text",
          source: "carmen",
          title: title || "בריף",
          text,
        });
        if (savedText.error) {
          failed.push({
            url: title || "בריף",
            reason: savedText.error.message,
          });
          continue;
        }
        added.push({ title: title || "בריף", type: "text" });
        continue;
      }
      if (!isHttpUrl(url)) {
        failed.push({ url, reason: "הקישור לא תקין" });
        continue;
      }
      if (kind === "link") {
        if (!byUrl.has(url)) {
          const savedLink = await supabase.from("workshop_assets").insert({
            tenant_id: tenantId,
            item_id: itemId,
            asset_type: "link",
            source: "carmen",
            title: title || hostLabel(url),
            url,
          });
          if (savedLink.error) {
            failed.push({ url, reason: savedLink.error.message });
            continue;
          }
          added.push({ title: title || hostLabel(url), type: "link" });
        }
        continue;
      }
      if (kind !== "image") {
        failed.push({ url, reason: "סוג לא מוכר" });
        continue;
      }
      if (wantsReference && referenceCount >= 4) {
        wantsReference = false;
      }
      const known = byUrl.get(url);
      if (known) {
        if (wantsReference && !known.use_as_reference) {
          const marked = await supabase
            .from("workshop_assets")
            .update({ use_as_reference: true })
            .eq("id", known.id)
            .eq("tenant_id", tenantId);
          if (marked.error) failed.push({ url, reason: marked.error.message });
          else referenceCount += 1;
        }
        continue;
      }
      if (!deps.importImage) {
        failed.push({ url, reason: "ייבוא תמונות לא זמין כאן" });
        continue;
      }
      const imported = await deps.importImage(url, { tenantId, itemId });
      if (!imported.url) {
        failed.push({ url, reason: imported.error ?? "התמונה לא נקראה" });
        continue;
      }
      const savedImage = await supabase.from("workshop_assets").insert({
        tenant_id: tenantId,
        item_id: itemId,
        asset_type: "image",
        source: "carmen",
        title: title || hostLabel(url),
        url: imported.url,
        storage_path: imported.path ?? null,
        use_as_reference: wantsReference,
        meta: { imported_from: url },
      });
      if (savedImage.error) {
        failed.push({ url, reason: savedImage.error.message });
        continue;
      }
      if (wantsReference) referenceCount += 1;
      added.push({ title: title || hostLabel(url), type: "image" });
    }
    return {
      success: failed.length < requested.length,
      added,
      failed,
      message:
        added.length > 0
          ? `נוספו ${added.length} נכסים ללשונית הנכסים.${failed.length > 0 ? ` ${failed.length} לא נקלטו.` : ""}`
          : "לא נוסף שום נכס. אמרי למשתמש למה בפשטות.",
      workshop: { event: "artifacts", item_id: itemId },
    };
  }

  if (name === "workshop_get_state") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const studio = (await executeCreativeStudioTool(
      supabase,
      tenantId,
      "get_studio_state",
      { item_id: itemId },
      assertClientAccess,
    )) as Record<string, unknown>;
    if (studio.error) return studio;
    const [artifacts, running, item, assets] = await Promise.all([
      supabase
        .from("workshop_artifacts")
        .select("id, kind, title, folder, status, meta")
        .eq("item_id", itemId)
        .eq("tenant_id", tenantId)
        .order("created_at"),
      supabase
        .from("marketing_runs")
        .select(
          "kind, status, error, created_at, provider, fallback_from:output->>fallback_from",
        )
        .eq("item_id", itemId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("marketing_work_items")
        .select("payload, client_id")
        .eq("id", itemId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      loadAssets(supabase, tenantId, itemId),
    ]);
    const clientRow = item.data?.client_id
      ? (
          await supabase
            .from("clients")
            .select("id, name, website")
            .eq("id", item.data.client_id)
            .eq("tenant_id", tenantId)
            .maybeSingle()
        ).data
      : null;
    const runs = (Array.isArray(running.data) ? running.data : []) as RunRow[];
    const itemPayload = asRecord(item.data?.payload);
    return {
      ...studio,
      artifacts: (Array.isArray(artifacts.data) ? artifacts.data : []).map(
        (page: Record<string, any>) => {
          const { meta, ...rest } = page;
          const reason = asRecord(meta).text;
          return page.status === "failed" && typeof reason === "string"
            ? { ...rest, error: reason }
            : rest;
        },
      ),
      running: runs.filter(
        (run) => run.status === "queued" || run.status === "running",
      ),
      production: productionReport(
        runs,
        asRecord(asRecord(itemPayload.video).production),
      ),
      plan: asRecord(itemPayload.workshop),
      brief: String(itemPayload.brief_text ?? "").slice(0, 3000),
      brief_answers: briefAnswersOf(itemPayload),
      film_brief: lookOf(itemPayload).film,
      look: {
        references: lookOf(itemPayload).references.length,
        style_written: lookOf(itemPayload).bible.length > 0,
        engine: lookOf(itemPayload).engine,
      },
      client: clientRow
        ? { id: clientRow.id, name: clientRow.name, website: clientRow.website }
        : null,
      assets: assets.slice(0, 30).map(assetForCarmen),
    };
  }

  if (name === "workshop_make_creative") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    if (!deps.generateImage) return { error: "יצירת תמונות לא זמינה כאן" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const { project } = loaded;
    const prompt = (
      String(args.prompt ?? "").trim() ||
      (typeof project.payload.workshop_last_prompt === "string"
        ? project.payload.workshop_last_prompt.trim()
        : "") ||
      [project.title, lookOf(project.payload).bible]
        .filter(Boolean)
        .join(". ")
        .trim()
    ).slice(0, 2000);
    if (!prompt)
      return {
        error: "prompt נדרש: תיאור הוויזואל באנגלית (נושא, סגנון, תאורה)",
      };
    if (
      project.payload.project_type === "video" &&
      args.formats === undefined
    ) {
      const scenes = await loadScenes(supabase, tenantId, itemId);
      if (scenes.some((scene) => !scene.still_asset_id))
        return {
          error:
            "זה פרויקט סרט עם סצנות שעוד אין להן תמונה. תמונות לסצנות נוצרות עם workshop_make_stills, לא עם workshop_make_creative. אם המשתמש ביקש במפורש תמונת מודעה נפרדת, קראי שוב עם formats.",
        };
    }
    const brief = await briefProject(deps, project.payload, args, {
      kind: "static",
      save: (next) => savePayload(supabase, tenantId, itemId, next),
      needsEngine: true,
    });
    if ("gate" in brief) return brief.gate;
    await mirrorReferences(supabase, tenantId, itemId, args.reference_urls);
    if (
      brief.payload !== project.payload ||
      project.payload.workshop_last_prompt !== prompt
    ) {
      await savePayload(supabase, tenantId, itemId, {
        ...brief.payload,
        workshop_last_prompt: prompt,
      });
      project.payload = { ...brief.payload, workshop_last_prompt: prompt };
    }
    const look = lookOf(project.payload);
    const projectFormats = imageFormatsFrom(
      asRecord(project.payload.workshop).formats,
      imageFormatsFrom([project.payload.format], ["1:1"]),
    );
    const formats = imageFormatsFrom(args.formats, projectFormats).slice(0, 3);
    const estimate = estimateImages(formats);
    const gate = await gatePaid(
      supabase,
      tenantId,
      itemId,
      project.payload,
      {
        tool: "workshop_make_creative",
        engine: brief.engine ?? "auto",
        count: estimate.images,
        usd: estimate.usd,
      },
      args,
      deps,
      {
        formats,
        images: estimate.images,
        estimated_usd: estimate.usd,
        message: `הפקה של ${estimate.images} תמונות (${formats.join(", ")}) תעלה עד כ-$${estimate.usd}. אשר/י והתחל.`,
      },
    );
    if ("stop" in gate) return gate.stop;
    const running = await supabase
      .from("workshop_artifacts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("status", "pending")
      .eq("kind", "image")
      .eq("meta->>placeholder", "true")
      .gte(
        "created_at",
        new Date(Date.now() - RUNNING_WINDOW_MS).toISOString(),
      );
    if (Array.isArray(running.data) && running.data.length > 0)
      return {
        success: true,
        already_running: true,
        message:
          "התמונות כבר בהכנה והן מופיעות בלוח לבד. אל תקראי שוב. לעדכון קראי ל-workshop_get_state.",
      };
    project.payload = spendBudget(
      gate.payload,
      "workshop_make_creative",
      formats.length,
    );
    await savePayload(supabase, tenantId, itemId, project.payload);
    const holders = await openPlaceholders(
      supabase,
      tenantId,
      itemId,
      formats.map((format) => ({
        kind: "image" as const,
        title: `${project.title || "תמונה"} · ${format}`,
        meta: { format },
      })),
    );
    const artifacts: Record<string, any>[] = [];
    const generateAll = () =>
      Promise.all(
        formats.map(async (format, index) => {
          try {
            const made = await deps.generateImage!(
              stillPrompt({
                visual: prompt,
                look,
                userReferences: look.references.length,
                hasAnchor: false,
                suffix: "",
              }),
              format,
              look.references,
              brief.engine ?? undefined,
            );
            if (!made.image_url) {
              await settlePlaceholder(
                supabase,
                tenantId,
                holders[index],
                failedPatch(made.error ?? "לא התקבלה תמונה"),
              );
              return { format, ...made };
            }
            const meta = { prompt, format };
            const settled = await settlePlaceholder(
              supabase,
              tenantId,
              holders[index],
              {
                status: "ready",
                url: made.image_url,
                thumb_url: made.image_url,
                meta,
              },
            );
            artifacts.push(
              settled ??
                (await recordArtifact(supabase, {
                  tenantId,
                  itemId,
                  kind: "image",
                  title: `${project.title || "תמונה"} · ${format}`,
                  url: made.image_url,
                  meta,
                })),
            );
            return { format, ...made };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "יצירת התמונה נכשלה";
            await settlePlaceholder(
              supabase,
              tenantId,
              holders[index],
              failedPatch(message),
            );
            return { format, error: message };
          }
        }),
      );
    const generate = async () => {
      const results = await generateAll();
      await refundMissing(
        supabase,
        tenantId,
        itemId,
        "workshop_make_creative",
        results.filter((result) => !result.image_url).length,
      );
      return results;
    };
    if (deps.background && holders.every(Boolean)) {
      deps.background(generate().catch(() => []));
      return {
        success: true,
        started: true,
        pages: formats.length,
        message: `התחלתי ליצור ${formats.length} תמונות. הן מופיעות בלוח בעוד דקה בערך. אם משהו נכשל תופיע למשתמש הודעת שגיאה והעמוד לא נשאר בלוח. אמרי את זה למשתמש במשפט אחד ואל תקראי שוב לכלי.`,
        workshop: { event: "artifacts", item_id: itemId },
      };
    }
    const results = await generate();
    const failed = results.filter((result) => !result.image_url);
    return {
      success: artifacts.length > 0,
      created: artifacts.length,
      failed: failed.map((entry) => ({
        format: entry.format,
        error: entry.error ?? "לא התקבלה תמונה",
      })),
      artifacts,
      workshop: {
        event: "artifacts",
        item_id: itemId,
        artifact_id: artifacts[artifacts.length - 1]?.id,
      },
    };
  }

  if (name === "workshop_save_concepts" || name === "workshop_save_copy") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const isConcepts = name === "workshop_save_concepts";
    const list = (isConcepts ? args.concepts : args.variations) as unknown;
    const entries = (Array.isArray(list) ? list : [])
      .map((entry) => asRecord(entry))
      .slice(0, isConcepts ? 8 : 12);
    const pages = entries
      .map((entry) =>
        isConcepts
          ? {
              title: String(entry.title ?? "").trim(),
              text: [
                String(entry.idea ?? "").trim(),
                String(entry.visual ?? "").trim()
                  ? `ויזואל: ${String(entry.visual).trim()}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            }
          : {
              title: String(entry.headline ?? "").trim(),
              text: [entry.headline, entry.body, entry.cta]
                .map((part) => String(part ?? "").trim())
                .filter(Boolean)
                .join("\n\n"),
            },
      )
      .filter((page) => page.title && page.text);
    if (pages.length === 0)
      return { error: isConcepts ? "concepts ריק" : "variations ריק" };
    const artifacts = [];
    for (const page of pages)
      artifacts.push(
        await recordArtifact(supabase, {
          tenantId,
          itemId,
          kind: isConcepts ? "concept" : "copy",
          title: page.title,
          meta: { text: page.text },
        }),
      );
    if (!isConcepts && !loaded.project.payload.copy_text) {
      try {
        await savePayload(supabase, tenantId, itemId, {
          ...loaded.project.payload,
          copy_text: pages[0].text,
        });
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "שמירת הטקסט נכשלה",
        };
      }
    }
    return {
      success: true,
      saved: artifacts.length,
      artifacts,
      workshop: {
        event: "artifacts",
        item_id: itemId,
        artifact_id: artifacts[artifacts.length - 1].id,
      },
    };
  }

  if (name === "workshop_choose_voice") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const { payload } = loaded.project;
    return await chooseVoice(
      args,
      voiceHelpers(supabase, tenantId, itemId, payload, deps),
    );
  }
  if (name === "workshop_edit_from_assets") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const brief = await briefProject(deps, loaded.project.payload, args, {
      kind: "video",
      save: (next) => savePayload(supabase, tenantId, itemId, next),
      needsEngine: false,
      needsStyle: false,
    });
    if ("gate" in brief) return brief.gate;
    const built = await buildEditScenes(supabase, tenantId, itemId, args, {
      loadAssets: (id) => loadAssets(supabase, tenantId, id),
      loadScenes: (id) =>
        loadScenes(supabase, tenantId, id) as Promise<{ id: string }[]>,
    });
    if ("error" in built) return built;
    await savePayload(supabase, tenantId, itemId, {
      ...brief.payload,
      project_type: "video",
      workshop_edit: true,
    });
    const total = built.rows.reduce((sum, row) => sum + row.duration_s, 0);
    const artifact = await recordArtifact(supabase, {
      tenantId,
      itemId,
      kind: "storyboard",
      title: `עריכה מהחומרים · ${built.rows.length} סצנות`,
      meta: {
        total_s: total,
        scenes: built.rows,
        text: built.rows
          .map(
            (row) =>
              `${row.position}. ${row.title} (${row.duration_s} ש׳)${
                row.overlay_text ? `\nכיתוב: ${row.overlay_text}` : ""
              }${row.voiceover_text ? `\nקריינות: ${row.voiceover_text}` : ""}`,
          )
          .join("\n\n"),
      },
    });
    return {
      success: true,
      scenes: built.rows.length,
      total_s: total,
      ...(built.failed.length > 0 ? { not_attached: built.failed } : {}),
      artifact,
      workshop: {
        event: "artifacts",
        item_id: itemId,
        artifact_id: artifact.id,
      },
      message:
        "הסצנות נבנו מהחומרים ומופיעות בלוח. להרכבת הסרט קראי ל-workshop_produce_video: עם engine=mock התמונות זזות בתנועת מצלמה בלי עלות, ומנוע בתשלום מנפיש אותן.",
    };
  }
  if (name === "workshop_storyboard") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const { project } = loaded;
    const brief = await briefProject(deps, project.payload, args, {
      kind: "video",
      save: (next) => savePayload(supabase, tenantId, itemId, next),
      needsEngine: false,
    });
    if ("gate" in brief) return brief.gate;
    await mirrorReferences(supabase, tenantId, itemId, args.reference_urls);
    project.payload = brief.payload;
    const input = (Array.isArray(args.scenes) ? args.scenes : [])
      .map((scene) => asRecord(scene))
      .filter((scene) => String(scene.visual_prompt ?? "").trim())
      .slice(0, 20);
    if (input.length === 0)
      return { error: "scenes ריק: כל סצנה צריכה visual_prompt" };
    const old = await loadScenes(supabase, tenantId, itemId);
    if (old.length > 0 && args.replace !== true)
      return { error: "כבר יש סטוריבורד. replace=true יחליף אותו." };
    // Replacing a storyboard that was already filmed throws away paid clips: only when the user
    // asks for a new or changed story, never to recover from a failed step.
    if (
      old.some((scene) => scene.clip_asset_id) &&
      !STORY_CHANGE.test(deps.userText ?? "")
    )
      return {
        error:
          "לסטוריבורד הזה כבר יש סרטונים בתשלום, והמשתמש לא ביקש סיפור חדש. אל תחליפי אותו: דווחי למשתמש מה נכשל, או שאלי אם הוא רוצה סטוריבורד חדש.",
      };
    const rows = input.map((scene, index) => ({
      id: crypto.randomUUID(),
      position: index + 1,
      title: String(scene.title ?? "").trim() || `סצנה ${index + 1}`,
      shot: String(scene.shot ?? "").trim() || "Medium shot",
      visual_prompt: String(scene.visual_prompt).trim(),
      motion_prompt: String(scene.motion_prompt ?? "").trim(),
      overlay_text: String(scene.overlay_text ?? "").trim(),
      voiceover_text: String(scene.voiceover_text ?? "").trim(),
      duration_s: Math.min(Math.max(Number(scene.duration_s) || 3, 0.5), 120),
      // Talking scene: saved to meta by save_video_storyboard.
      ...(scene.lipsync === true
        ? {
            lipsync: true,
            speaker: String(scene.speaker ?? "").trim(),
            dialogue: String(scene.dialogue ?? "").trim(),
          }
        : {}),
    }));
    const saved = await supabase.rpc("save_video_storyboard", {
      p_item_id: itemId,
      p_scenes: rows,
    });
    if (saved.error) return { error: saved.error.message };
    if (old.length > 0) {
      const removed = await supabase
        .from("marketing_video_scenes")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("item_id", itemId)
        .in(
          "id",
          old.map((scene) => scene.id),
        );
      if (removed.error) return { error: removed.error.message };
    }
    const folded = withLook(project.payload, {}, { anchorUrl: null });
    await savePayload(supabase, tenantId, itemId, {
      ...folded.payload,
      project_type: "video",
    });
    const total = rows.reduce((sum, scene) => sum + scene.duration_s, 0);
    const artifact = await recordArtifact(supabase, {
      tenantId,
      itemId,
      kind: "storyboard",
      title: `סטוריבורד · ${rows.length} סצנות`,
      meta: {
        total_s: total,
        scenes: rows,
        text: rows
          .map(
            (scene) =>
              `${scene.position}. ${scene.title} (${scene.duration_s} ש׳)\n${scene.visual_prompt}${
                scene.voiceover_text ? `\nקריינות: ${scene.voiceover_text}` : ""
              }`,
          )
          .join("\n\n"),
      },
    });
    return {
      success: true,
      scenes: rows.length,
      total_s: total,
      artifact,
      workshop: {
        event: "artifacts",
        item_id: itemId,
        artifact_id: artifact.id,
      },
    };
  }

  if (name === "workshop_make_stills") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    if (!deps.generateImage) return { error: "יצירת תמונות לא זמינה כאן" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const { project } = loaded;
    const scenes = await loadScenes(supabase, tenantId, itemId);
    if (scenes.length === 0)
      return { error: "אין סטוריבורד. קודם workshop_storyboard." };
    const redo = args.redo === true;
    const redoIds = new Set(
      redo
        ? scenes
            // A scene of the user's own video keeps its footage: no picture replaces it.
            .filter((scene) => scene.still_asset_id || !scene.clip_asset_id)
            .map((scene) => String(scene.id))
        : stringList(project.payload[REDO_KEY]),
    );
    const pending = scenes.filter(
      (scene) =>
        (!scene.still_asset_id && !hasOwnClip(scene)) ||
        redoIds.has(String(scene.id)),
    );
    if (pending.length === 0)
      return { success: true, created: 0, remaining: 0 };
    const running = await supabase
      .from("workshop_artifacts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .eq("status", "pending")
      .eq("kind", "scene_still")
      .eq("meta->>placeholder", "true")
      .gte(
        "created_at",
        new Date(Date.now() - RUNNING_WINDOW_MS).toISOString(),
      );
    if (Array.isArray(running.data) && running.data.length > 0)
      return {
        success: true,
        already_running: true,
        message:
          "התמונות לסצנות כבר בהכנה והן מופיעות בלוח לבד. אל תקראי שוב. לעדכון קראי ל-workshop_get_state.",
      };
    const brief = await briefProject(deps, project.payload, args, {
      kind: "video",
      save: (next) => savePayload(supabase, tenantId, itemId, next),
      needsEngine: true,
    });
    if ("gate" in brief) return brief.gate;
    await mirrorReferences(supabase, tenantId, itemId, args.reference_urls);
    if (brief.payload !== project.payload) {
      await savePayload(supabase, tenantId, itemId, brief.payload);
      project.payload = brief.payload;
    }
    const batch = pending.slice(0, STILLS_PER_CALL);
    const format = imageFormatsFrom([project.payload.format], ["9:16"])[0];
    const estimate = estimateImages([format], batch.length);
    const whole = estimateImages([format], pending.length);
    // One budget covers the whole film: the pictures and the production that follows them.
    const filmEngine =
      (deps.defaultEngine ? await deps.defaultEngine() : null) ?? "mock";
    const film = quotedProductionEstimate(
      filmEngine,
      scenes.map((scene) => ({
        duration_s: Number(scene.duration_s) || 3,
        voiceover_text: String(scene.voiceover_text ?? ""),
        lipsync: asRecord(scene.meta).lipsync === true,
        dialogue: String(asRecord(scene.meta).dialogue ?? ""),
      })),
      {
        withVoice: scenes.some((scene) =>
          String(scene.voiceover_text ?? "").trim(),
        ),
        withMusic: true,
      },
      deps.videoConnections ? await deps.videoConnections() : {},
    );
    const projectBudget = Math.max(
      Number(args.budget_usd) || 0,
      (whole.usd + film.totalUsd) * 1.2,
    );
    const gate = await gatePaid(
      supabase,
      tenantId,
      itemId,
      project.payload,
      {
        tool: "workshop_make_stills",
        engine: brief.engine ?? "auto",
        count: pending.length,
        usd: whole.usd,
      },
      { ...args, budget_usd: projectBudget },
      deps,
      {
        scenes: pending.length,
        this_call: batch.length,
        estimated_usd: whole.usd,
        message:
          pending.length > batch.length
            ? `${pending.length} תמונות לסצנות יעלו עד כ-$${whole.usd} (${batch.length} בקריאה הזו, כ-$${estimate.usd}). אשר/י והתחל.`
            : `${batch.length} תמונות לסצנות יעלו עד כ-$${estimate.usd}. אשר/י והתחל.`,
      },
    );
    if ("stop" in gate) return gate.stop;
    let payload = gate.payload;
    if (redo) {
      payload = withLook(payload, {}, { anchorUrl: null }).payload;
      payload = { ...payload, [REDO_KEY]: [...redoIds] };
    }
    if (payload !== project.payload)
      await savePayload(supabase, tenantId, itemId, payload);
    const look = lookOf(payload);
    let anchorUrl = redo ? null : look.anchorUrl;

    const renderStill = async (
      scene: Record<string, any>,
      holder: string | undefined,
    ): Promise<{
      scene: string;
      ok: boolean;
      error?: string;
      url?: string;
    }> => {
      const fail = async (error: string) => {
        await settlePlaceholder(supabase, tenantId, holder, failedPatch(error));
        return { scene: scene.id, ok: false, error };
      };
      try {
        const references = anchorUrl
          ? [...look.references, anchorUrl]
          : look.references;
        const made = await deps.generateImage!(
          stillPrompt({
            visual: scene.visual_prompt,
            look,
            userReferences: look.references.length,
            hasAnchor: Boolean(anchorUrl),
            suffix:
              "Cinematic still frame for a video storyboard. No text on the image.",
          }),
          format,
          references,
          brief.engine ?? undefined,
        );
        if (!made.image_url) return await fail(made.error ?? "לא התקבלה תמונה");
        const attached = await supabase.rpc("attach_video_scene_asset", {
          p_scene_id: scene.id,
          p_kind: "still",
          p_url: made.image_url,
          p_meta: { prompt: scene.visual_prompt, source: "workshop" },
        });
        if (attached.error) return await fail(attached.error.message);
        await ensureStillPage(
          supabase,
          tenantId,
          itemId,
          scene,
          attached.data,
          made.image_url,
          holder,
        );
        return { scene: scene.id, ok: true, url: made.image_url };
      } catch (error) {
        return await fail(
          error instanceof Error ? error.message : "יצירת התמונה נכשלה",
        );
      }
    };

    const renderGroup = async (group: Record<string, any>[]) => {
      const holders = await openPlaceholders(
        supabase,
        tenantId,
        itemId,
        group.map((scene) => ({
          kind: "scene_still" as const,
          title: `סצנה ${scene.position}${scene.title ? ` · ${scene.title}` : ""}`,
          meta: { scene_id: scene.id },
        })),
      );
      return await Promise.all(
        group.map((scene, index) => renderStill(scene, holders[index])),
      );
    };

    const results: { scene: string; ok: boolean; error?: string }[] = [];
    const startedAt = Date.now();
    let todo = [...batch];
    if (!anchorUrl) {
      const first = todo.shift()!;
      const [done] = await renderGroup([first]);
      results.push({ scene: done.scene, ok: done.ok, error: done.error });
      if (!done.ok) todo = [];
      else {
        anchorUrl = done.url ?? null;
        payload = withLook(payload, {}, { anchorUrl }).payload;
        await savePayload(supabase, tenantId, itemId, payload);
      }
    }
    for (let i = 0; i < todo.length; i += STILL_CONCURRENCY) {
      if (i > 0 && Date.now() - startedAt > STILLS_BUDGET_MS) break;
      const chunk = todo.slice(i, i + STILL_CONCURRENCY);
      results.push(...(await renderGroup(chunk)));
    }
    const created = results.filter((result) => result.ok).length;
    const failed = results.filter((result) => !result.ok);
    const remaining = pending.length - created;
    const redone = new Set(
      results.filter((result) => result.ok).map((result) => result.scene),
    );
    const leftToRedo = stringList(payload[REDO_KEY]).filter(
      (id) => !redone.has(id),
    );
    const settled = spendBudget(
      { ...payload, [REDO_KEY]: leftToRedo },
      "workshop_make_stills",
      created,
    );
    if (leftToRedo.length === 0) delete settled[REDO_KEY];
    await savePayload(supabase, tenantId, itemId, settled);
    return {
      success: created > 0,
      created,
      failed,
      remaining,
      used_references: look.references.length,
      anchored: Boolean(anchorUrl),
      message:
        created === 0
          ? `לא נוצרה אף תמונה. ${failed[0]?.error ?? ""}`.trim()
          : `${created} תמונות נוצרו והן כבר מופיעות בלוח, אין צורך לשלוח או לצרף אותן. ${
              look.references.length > 0
                ? `נוצרו לפי ${look.references.length} רפרנסים ותמונת עוגן אחת לאחידות. `
                : "אין לפרויקט רפרנס: אם המשתמש צירף או הזכיר תמונה, העבירי אותה ב-reference_urls והציעי ליצור מחדש עם redo=true. "
            }${
              remaining > 0
                ? `נשארו ${remaining} סצנות בלי תמונה: קראי שוב ל-workshop_make_stills להמשך, בלי redo. כל עוד זה בתקציב זה ירוץ בלי לשאול.`
                : "לכל הסצנות יש תמונה: הציעי להמשיך להפקת הסרט."
            }`,
      workshop: { event: "artifacts", item_id: itemId },
    };
  }

  if (name === "workshop_produce_video") {
    const itemId = String(args.item_id ?? "").trim();
    if (!itemId) return { error: "item_id נדרש" };
    const loaded = await loadProject(
      supabase,
      tenantId,
      itemId,
      assertClientAccess,
    );
    if ("error" in loaded) return loaded;
    const { project } = loaded;
    const scenes = await loadScenes(supabase, tenantId, itemId);
    if (scenes.length === 0)
      return { error: "אין סטוריבורד. קודם workshop_storyboard." };
    const noStill = scenes.filter(
      (scene) => !scene.still_asset_id && !hasOwnClip(scene),
    ).length;
    if (noStill > 0)
      return {
        error: `לא לכל הסצנות יש תמונה (${noStill} חסרות). קודם workshop_make_stills.`,
        missing_stills: noStill,
      };

    const video = asRecord(project.payload.video);
    const pendingFilm = () =>
      supabase
        .from("workshop_artifacts")
        .select(PAGE_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("item_id", itemId)
        .eq("kind", "film")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    const runningReply = (
      provider: unknown,
      client: unknown,
      artifact: unknown,
    ) => ({
      success: true,
      status: "running",
      already_running: true,
      engine: isSceneEngine(provider) ? ENGINE_LABEL[provider] : undefined,
      client_id: client,
      user_message: "הסרט כבר בהפקה, והוא יופיע בלוח כשיהיה מוכן.",
      message:
        "הפקה כבר רצה לפרויקט הזה ולא הותחלה שנייה. לבדוק את המצב: workshop_get_state (production), ולא להפיק שוב.",
      ...(artifact ? { artifact } : {}),
    });
    // produce_video queues nothing while a production runs: no quote, no second charge.
    const production = asRecord(video.production);
    if (productionRunning(production))
      return runningReply(
        production.provider,
        project.client_id,
        (await pendingFilm())?.data,
      );

    let stageId = project.stage_id;
    let clientId = project.client_id;
    if (!stageId) {
      const wanted = String(args.client_id ?? "").trim() || clientId || null;
      try {
        if (wanted && wanted !== project.client_id)
          await assertClientAccess(wanted);
        const stage = await creativeStageFor(supabase, tenantId, wanted);
        const linked = await supabase
          .from("marketing_work_items")
          .update({
            ...(wanted ? { client_id: wanted } : {}),
            pipeline_id: stage.pipelineId,
            current_stage_id: stage.stageId,
          })
          .eq("id", itemId)
          .eq("tenant_id", tenantId);
        if (linked.error) return { error: linked.error.message };
        stageId = stage.stageId;
        clientId = wanted;
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "שיוך הלקוח נכשל",
        };
      }
    }

    let engine: SceneEngine | null = isSceneEngine(args.engine)
      ? args.engine
      : isSceneEngine(video.scene_engine) && video.scene_engine !== "mock"
        ? video.scene_engine
        : null;
    // A remembered ElevenLabs choice is re-checked: Starter cannot animate or narrate,
    // and defaultEngine then returns Higgsfield or the free preview.
    if (!engine || engine === "elevenlabs") {
      const resolved = deps.defaultEngine ? await deps.defaultEngine() : null;
      if (resolved) engine = resolved;
    }
    if (!engine) engine = "mock";
    // The scenes produce_video queues a clip for: none yet, stale, failed, or (on a paid
    // engine) made by the free preview.
    const previewClips =
      engine === "mock"
        ? new Set<string>()
        : await previewClipIds(
            supabase,
            tenantId,
            itemId,
            scenes.map((scene) => scene.clip_asset_id).filter(Boolean),
          );
    const costScenes = scenes
      .filter(
        (scene) =>
          !scene.clip_asset_id ||
          scene.clip_stale === true ||
          scene.status === "failed" ||
          previewClips.has(String(scene.clip_asset_id)),
      )
      .map((scene) => ({
        duration_s: Number(scene.duration_s) || 3,
        voiceover_text: String(scene.voiceover_text ?? ""),
        lipsync: asRecord(scene.meta).lipsync === true,
        dialogue: String(asRecord(scene.meta).dialogue ?? ""),
      }));
    const withVoice = scenes.some((scene) =>
      String(scene.voiceover_text ?? "").trim(),
    );
    const withMusic = args.music !== false;
    const estimate = quotedProductionEstimate(
      engine,
      costScenes,
      { withVoice, withMusic },
      deps.videoConnections ? await deps.videoConnections() : {},
    );
    // Narration needs a voice the user chose after hearing it.
    const chosenVoice = narrationVoiceId(args.voice_id, video.voice_id);
    if (withVoice && !chosenVoice)
      return await chooseVoice(
        {},
        voiceHelpers(supabase, tenantId, itemId, project.payload, deps),
      );
    const gate = await gatePaid(
      supabase,
      tenantId,
      itemId,
      project.payload,
      {
        tool: "workshop_produce_video",
        engine,
        count: costScenes.length,
        usd: estimate.totalUsd,
      },
      args,
      deps,
      {
        engine,
        engine_label: ENGINE_LABEL[engine],
        scenes: scenes.length,
        clip_seconds: estimate.clipSeconds,
        with_voice: withVoice,
        with_music: withMusic,
        estimated_usd: estimate.totalUsd,
        message:
          engine === "mock"
            ? "הסרט יופק במנוע התצוגה החינמי (תנועה פשוטה על התמונות), בלי עלות. אשר/י והתחל."
            : `ההפקה במנוע ${ENGINE_LABEL[engine]} תעלה עד כ-$${estimate.totalUsd}. אשר/י והתחל.`,
      },
    );
    if ("stop" in gate) return gate.stop;

    const format = imageFormatsFrom([project.payload.format], ["9:16"])[0];
    const ctaText =
      typeof args.cta_text === "string"
        ? args.cta_text.replace(/\s+/g, " ").trim().slice(0, 60)
        : "";
    const voiceId = narrationVoiceId(args.voice_id, video.voice_id);
    try {
      await savePayload(
        supabase,
        tenantId,
        itemId,
        spendBudget(
          {
            ...endingOf(gate.payload, ctaText),
            video: {
              ...video,
              scene_engine: engine,
              sound_engine: "elevenlabs",
              // The narration is checked against this voice; a new one re-narrates the film.
              ...(voiceId ? { voice_id: voiceId } : {}),
            },
          },
          "workshop_produce_video",
          costScenes.length || 1,
        ),
      );
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "שמירת הפרויקט נכשלה",
      };
    }
    const produced = await supabase.rpc("produce_video", {
      p_item_id: itemId,
      p_aspect: format,
      p_provider: engine,
      // Free-preview clips are priced in costScenes, so the paid engine may redo them.
      p_redo_preview: true,
      p_estimate: {
        clips: estimate.clips,
        voice: estimate.voice,
        music: estimate.music,
        lipsync: estimate.lipsync,
      },
      p_stage_id: stageId,
      p_with_voice: withVoice,
      p_with_music: withMusic,
      p_voice_id: voiceId,
      p_music_prompt:
        "Instrumental commercial bed matching the storyboard, no vocals and no lyrics.",
      p_generate_audio: false,
    });
    if (produced.error)
      return {
        error: [
          produced.error.message,
          produced.error.details,
          produced.error.code,
        ]
          .filter(Boolean)
          .join(" | "),
      };
    const state = asRecord(produced.data);
    // A production that failed at once gets no pending film page (it would spin forever).
    if (state.status === "failed")
      return {
        success: false,
        status: "failed",
        error: String(state.error ?? "ההפקה נכשלה"),
      };
    const alreadyRunning =
      state.status === "running" &&
      Number(state.clips ?? 0) + Number(state.voices ?? 0) === 0 &&
      Number(state.music ?? 0) === 0;
    const open = alreadyRunning ? await pendingFilm() : null;
    if (alreadyRunning && open?.data)
      return runningReply(engine, clientId, open.data);
    const artifact = await recordArtifact(supabase, {
      tenantId,
      itemId,
      kind: "film",
      title: project.title ? `${project.title} · סרט` : "הסרט",
      status: "pending",
      meta: { engine, estimated_usd: estimate.totalUsd },
    });
    return {
      success: true,
      started: true,
      user_message: "ההפקה התחילה ורצה ברקע. הסרט יופיע בלוח כשיהיה מוכן.",
      status: state.status ?? "running",
      engine: ENGINE_LABEL[engine],
      client_id: clientId,
      message:
        "ההפקה התחילה ורצה ברקע בשרת ההפקה. הסרט יופיע בלוח כשיהיה מוכן. אל תפיקי שוב: לבדיקה קראי ל-workshop_get_state ובדקי production.",
      artifact,
      workshop: {
        event: "artifacts",
        item_id: itemId,
        artifact_id: artifact.id,
      },
    };
  }

  return { error: "כלי לא מוכר" };
}
