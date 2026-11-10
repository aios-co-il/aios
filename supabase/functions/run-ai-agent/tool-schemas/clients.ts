import { CARMEN_CLIENT_UPDATE_TYPES } from "../../_shared/client-card/sources.ts";
import { FINDING_DRAFT_TOOLS } from "../finding-draft/tool.ts";

export const clientsTools = [
  {
    name: "list_clients",
    description:
      'רשימת/חיפוש לקוחות. אפשר לסנן לפי סטטוס, קמפיינר, סוכנות (agency_id/agency_name — חובה לסנן כשהמשתמש שואל על "לקוחות בסוכנות X"), או name_search. הערה: כשהקורא הוא קמפיינר (WhatsApp), ברירת המחדל היא הצגת לקוחות שמשוייכים אליו בלבד בסטטוס active/onboarding — אלא אם סופק campaigner_name/agency_name אחר במפורש. החיפוש case-insensitive. אל תאמר "לא נמצא" לפני שניסית name_search.',
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "active / onboarding / inactive. ברירת מחדל עבור קמפיינר WhatsApp: active+onboarding בלבד.",
        },
        limit: { type: "integer" },
        name_search: {
          type: "string",
          description:
            "חיפוש חלקי בשם הלקוח או איש הקשר (case-insensitive). נסה גם תעתיק אנגלי לעברית ולהפך.",
        },
        campaigner_id: {
          type: "string",
          description: "סינון ללקוחות המשוייכים לקמפיינר זה (דרך client_team)",
        },
        campaigner_name: {
          type: "string",
          description: "סינון לפי שם קמפיינר (חיפוש חופשי בשם המלא)",
        },
        agency_id: {
          type: "string",
          description: "סינון ללקוחות בסוכנות זו בלבד",
        },
        agency_name: {
          type: "string",
          description:
            "סינון לפי שם סוכנות (חיפוש חלקי, case-insensitive). חובה להשתמש כשהמשתמש מציין סוכנות בשם.",
        },
        all_scopes: {
          type: "boolean",
          description:
            "דרוס את הסקופ האוטומטי של הקמפיינר והחזר את כל הלקוחות בארגון (לשימוש רק אם המשתמש ביקש זאת מפורשות).",
        },
      },
    },
  },
  {
    name: "get_client_info",
    description: "מידע על לקוח",
    parameters: {
      type: "object",
      properties: { client_id: { type: "string" } },
      required: ["client_id"],
    },
  },
  {
    name: "add_client_update",
    description:
      "רישום עדכון בכרטיס הלקוח — הכלי היחיד לתיעוד קשר עם לקוח. פגישה או שיחה (call) נרשמות רק כשאיש צוות מבקש ממך ישירות לתעד אותן, והן נרשמות על שמו ונספרות כקשר עם הלקוח. בריצה אוטומטית אפשר לרשום רק general, red_flag או weekly_update.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        content: { type: "string" },
        update_type: {
          type: "string",
          enum: [...CARMEN_CLIENT_UPDATE_TYPES],
          description:
            "סוג העדכון: call=פגישה / שיחה שהתקיימה, weekly_update=עדכון שבועי, general=עדכון כללי (ברירת מחדל), red_flag=דגל אדום (תלונה, סיכון או בעיה)",
        },
      },
      required: ["client_id", "content"],
    },
  },
  ...FINDING_DRAFT_TOOLS,
];
