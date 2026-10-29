/** The workshop's project tools: start, assign a client, check connections, read a site, add assets, read state. */

export const PROJECT_TOOLS = [
  {
    name: "workshop_start_project",
    description:
      "פותחת פרויקט חדש בסדנה מבקשה חופשית אחת. מסיקה לבד סוג (סרטון, מודעה, קמפיין), פורמט לפי הערוץ, אורך וסצנות, וסגנון. לא שואלים את המשתמש על הגדרות. מחזירה item_id לשאר הכלים. כשפרויקט פתוח בלוח היא מסרבת, אלא אם המשתמש ביקש פרויקט חדש או נפרד: עבדי על הפרויקט הפתוח. לא עולה כסף.",
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
      "משייכת פרויקט קיים ללקוח, מכל מחלקה (או מסירה את השיוך כשלא שולחים client_id). פרויקט יכול להתקיים בלי לקוח, והשיוך אפשרי בכל שלב. פרויקט SEO או סושיאל שכבר משויך נשאר אצל הלקוח שלו: אם הכלי מסרב, אמרי את הסיבה כמו שהיא. לא עולה כסף. אפשר לחפש את מזהה הלקוח עם search_entities.",
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
              use_as_logo: {
                type: "boolean",
                description:
                  "true לתמונה שהמשתמש אמר שהיא הלוגו של המותג (גם תמונה שכבר בלשונית הנכסים, לפי ה-url שלה): נשמרת כלוגו של הפרויקט ומופיעה בסגיר הסרט.",
              },
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
];
