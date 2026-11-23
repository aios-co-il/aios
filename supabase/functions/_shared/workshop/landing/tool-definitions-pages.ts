/** The landing page tools that work on the pages repository: build, publish, and import a live page. */

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

export const IMPORT_LANDING_PAGE_TOOL = {
  name: "workshop_import_landing_page",
  description:
    "מביאה לפרויקט עמוד נחיתה שכבר באוויר: המקטעים שלו נעשים הקופי של הפרויקט והעיצוב שלו הסגנון, שניהם מאושרים כי זה מה שהגולשים רואים היום. רק בפרויקט שעוד אין בו קופי ושיש לו כתובת בהגדרות. אחרי הייבוא עורכים כרגיל: קופי או סגנון חדש, אישור, בנייה ופרסום. עמוד עם משהו שכרמן לא יודעת לשמור לא מיובא, כדי שבנייה מחדש לא תמחק ממנו כלום. לא עולה כסף.",
  parameters: {
    type: "object",
    properties: { item_id: { type: "string" } },
    required: ["item_id"],
  },
};
