/** The landing page tools: the page copy and the visual style, each shown for approval. */
import { LANDING_BLOCK_TYPES, LANDING_FORM_FIELDS } from "./page-content.ts";

const FORM = {
  type: "object",
  description:
    "טופס הלידים: שם וטלפון תמיד. fields מוסיף שדות לפי הבריף; אותם שדות בשני הטפסים של העמוד",
  properties: {
    buttonLabel: { type: "string", description: "הטקסט על כפתור השליחה" },
    successMessage: {
      type: "string",
      description: "הודעת התודה אחרי שליחה",
    },
    fields: {
      type: "array",
      description:
        "companyName: שם החברה. employees: מספר עובדים (בחירה מטווחים). לעמוד לעסקים",
      items: { type: "string", enum: [...LANDING_FORM_FIELDS] },
    },
  },
  required: ["buttonLabel", "successMessage"],
};

/** A short line of text, for the lists inside a section. */
const LINES = { type: "array", items: { type: "string" } };

export const SAVE_LANDING_COPY_TOOL = {
  name: "workshop_save_landing_copy",
  description:
    "שומרת את הקופי של עמוד נחיתה כמקטעים לפי הסדר ומציגה אותו למשתמש עם כפתורי אישור. רק בפרויקט עמוד נחיתה. המקטע הראשון הוא hero עם טופס, ובסוף העמוד מקטע leadForm אחד; כל כפתור בעמוד מוביל לטופס הזה. בין לבין, לפי הצורך: text (בעיה, עם points ושורת closing), steps (איך זה עובד, 2 עד 6 שלבים), myths, comparison (השוואה מול האלטרנטיבה), services, testimonials (המלצות וכרטיסי אמון), features, faq, cta. המלצות, מספרים ותקנים רק ממה שהלקוח נתן. כותבים בעברית, בגוף שפונה לגולש, בלי הבטחות שהלקוח לא נתן. הכלי בודק אורכים ומבנה ומחזיר מה לתקן. say_to_user נשלח למשתמש כמו שהוא; עצרי אחריו. בקשת שינוי: כתבי את העמוד מחדש ושמרי שוב. לא עולה כסף.",
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string" },
      blocks: {
        type: "array",
        description: "מקטעי העמוד לפי הסדר",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: [...LANDING_BLOCK_TYPES] },
            heading: { type: "string", description: "כותרת המקטע" },
            subheading: { type: "string", description: "hero: כותרת משנה" },
            bullets: {
              ...LINES,
              description: "hero: עד 4 בולטים קצרים מתחת לכותרת המשנה",
            },
            points: {
              ...LINES,
              description: "text: עד 8 שורות של מה שמשתבש, אחת לכל תרחיש",
            },
            closing: {
              type: "string",
              description:
                "text, steps: המשפט שהקורא צריך לזכור, מודגש בסוף המקטע",
            },
            body: {
              type: "string",
              description: "text, leadForm, cta: גוף הטקסט",
            },
            items: {
              type: "array",
              description:
                "features, steps: {title, body}. myths: {myth, answer}. faq: {question, answer}. testimonials: {quote, name, role}. services: {title, body} עם שורת הסבר לקורא שאינו איש מקצוע, או מחרוזת.",
              items: {},
            },
            badges: {
              type: "array",
              description:
                "testimonials: עד 6 כרטיסי אמון {title, body}, למשל תקן, מספר מומחים, ותק",
              items: {},
            },
            columns: {
              ...LINES,
              description:
                "comparison: שתי כותרות עמודה, הראשונה האלטרנטיבה והשנייה הלקוח",
            },
            rows: {
              type: "array",
              description:
                "comparison: עד 12 שורות {label, values: [ערך לאלטרנטיבה, ערך ללקוח]}",
              items: {},
            },
            tagline: { type: "string", description: "services: שורת סיום" },
            label: { type: "string", description: "cta: הטקסט על הכפתור" },
            form: FORM,
          },
          required: ["type"],
        },
      },
    },
    required: ["item_id", "blocks"],
  },
};

export const SAVE_LANDING_STYLE_TOOL = {
  name: "workshop_save_landing_style",
  description:
    "שומרת את הסגנון העיצובי של עמוד נחיתה ומציגה אותו למשתמש עם כפתורי אישור. רק אחרי שהמשתמש אישר את הקופי. הצבעים נלקחים מהמותג של הלקוח, מהאתר שלו (workshop_inspect_site) ומהרפרנסים שבפרויקט, לא מהדמיון. say_to_user נשלח למשתמש כמו שהוא; עצרי אחריו. לא עולה כסף.",
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string" },
      primary_color: {
        type: "string",
        description: "הצבע הראשי של הכפתורים וההדגשות, #RRGGBB",
      },
      accents: {
        type: "array",
        description: "2 עד 5 צבעי מותג לפס הצבעוני, #RRGGBB; אפשר בלי",
        items: { type: "string" },
      },
      hero: {
        type: "string",
        enum: ["light", "dark"],
        description: "dark: פתיחה כהה ללוגו בהיר. light: פתיחה בהירה",
      },
      direction: {
        type: "string",
        description:
          "הכיוון במילים: האווירה, התחושה של הטיפוגרפיה, ומה נלקח מהרפרנסים",
      },
    },
    required: ["item_id", "primary_color", "hero", "direction"],
  },
};

export const BUILD_LANDING_PAGE_TOOL = {
  name: "workshop_build_landing_page",
  description:
    "בונה את עמוד הנחיתה מהקופי והסגנון שהמשתמש אישר, כטיוטה, ומחזירה קישור לתצוגה מקדימה עם כפתורי אישור פרסום. רק אחרי אישור הקופי ואישור הסגנון, ורק כשלעמוד יש כתובת בהגדרות שבראש הפרויקט. אם התצוגה עוד עולה, קראי לכלי שוב כעבור דקה: קריאה חוזרת לא בונה מחדש. say_to_user נשלח למשתמש כמו שהוא; עצרי אחריו. לא עולה כסף.",
  parameters: {
    type: "object",
    properties: { item_id: { type: "string" } },
    required: ["item_id"],
  },
};

export const PUBLISH_LANDING_PAGE_TOOL = {
  name: "workshop_publish_landing_page",
  description:
    "מפרסמת את עמוד הנחיתה שהמשתמש ראה בתצוגה המקדימה ואישר לפרסם. רק אחרי שהמשתמש אישר את הפרסום בעצמו; בלי האישור הכלי מסרב. העמוד עולה לאוויר בכתובת שבהגדרות. say_to_user נשלח למשתמש כמו שהוא. לא עולה כסף.",
  parameters: {
    type: "object",
    properties: { item_id: { type: "string" } },
    required: ["item_id"],
  },
};

export const LANDING_TOOLS = [
  SAVE_LANDING_COPY_TOOL,
  SAVE_LANDING_STYLE_TOOL,
  BUILD_LANDING_PAGE_TOOL,
  PUBLISH_LANDING_PAGE_TOOL,
];
