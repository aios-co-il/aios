/**
 * workshop_import_file (tools/import-file.ts): a direct brain puts a finished file on a project's
 * board. Listed in PROJECT_TOOLS beside workshop_add_assets.
 */
export const WORKSHOP_IMPORT_FILE_TOOL = {
  name: "workshop_import_file",
  description:
    "מוסיפה ללוח של הפרויקט קובץ מוכן שסוכן חיצוני יצר והעלה בשיחה (upload_aios_file): קריאייטיב (image), קליפ לסצנה (clip, עם scene_id) או הסרט הסופי (film). הקובץ מועתק לפרויקט ונרשם כמו תוצר של הסדנה. לא עולה כסף.",
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string", description: "מזהה הפרויקט" },
      kind: {
        type: "string",
        enum: ["image", "clip", "film"],
        description: "image: קריאייטיב; clip: קליפ לסצנה; film: הסרט הסופי",
      },
      path: {
        type: "string",
        description: "ה-path שהחזיר upload_aios_file (agent-replies/...)",
      },
      scene_id: { type: "string", description: "הסצנה, נדרש ל-clip" },
      title: { type: "string" },
    },
    required: ["item_id", "kind", "path"],
  },
};
