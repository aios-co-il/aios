import { PULSE_PLATFORMS } from "../../pulse/platforms.ts";
import {
  PULSE_TARGET_GOALS,
  pulseTargetKindsForGoal,
} from "../../pulse/targets/kinds.ts";
import { MARKET_RANGE_TEXT } from "./market-range.ts";

/** Carmen's pulse-target tools: read, her market estimate, and a queued approved target. */
export const PULSE_TARGET_TOOL_NAMES = [
  "get_pulse_targets",
  "set_market_target",
  "set_pulse_target",
] as const;

/** One of the pulse-target tool names. */
export type PulseTargetToolName = (typeof PULSE_TARGET_TOOL_NAMES)[number];

/** Is this one of the pulse-target tools? */
export function isPulseTargetTool(name: string): name is PulseTargetToolName {
  return PULSE_TARGET_TOOL_NAMES.some((tool) => tool === name);
}

const targetParams = {
  client_id: { type: "string", description: "מזהה הלקוח" },
  platform: {
    type: "string",
    enum: [...PULSE_PLATFORMS],
    description: "meta (פייסבוק/אינסטגרם) או google (Google Ads)",
  },
  goal: {
    type: "string",
    enum: [...PULSE_TARGET_GOALS],
    description: "leads → CPL; ecommerce → ROAS או CPA",
  },
  kind: {
    type: "string",
    enum: [...new Set(PULSE_TARGET_GOALS.flatMap(pulseTargetKindsForGoal))],
    description: "סוג היעד. ללידים תמיד cpl; לאיקומרס roas (ברירת מחדל) או cpa",
  },
  value: {
    type: "number",
    description: "ערך היעד: ₪ ל־CPL/CPA, יחס ל־ROAS (למשל 3 = פי 3)",
  },
  campaign_id: {
    type: "string",
    description:
      "מזהה קמפיין ליעד של קמפיין אחד. בלי — יעד לכל קמפייני המטרה בפלטפורמה",
  },
};

/** The tool definitions run-ai-agent registers. */
export const PULSE_TARGET_TOOLS = [
  {
    name: "get_pulse_targets",
    description:
      "יעדי הדופק של לקוחות: יעד לפלטפורמה ויעדים לקמפיינים, עם המקור (מאושר / יעד שוק (כרמן)), הנימוק והתאריך, ורשימת הקמפיינים שמוציאים כסף בלי שום יעד. בלי client_id — כל הלקוחות בהרשאה שלך.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "מזהה לקוח (לא חובה)" },
      },
    },
  },
  {
    name: "set_market_target",
    description: `קביעת יעד שוק (כרמן) — הערכה שלך ליעד CPL / CPA / ROAS לקמפיין או לפלטפורמה שאין להם יעד מאושר. היעד חייב להתבסס גם על בנצ׳מרקים של הענף של הלקוח בשוק הישראלי וגם על ההיסטוריה של הלקוח עצמו (הביצועים בדופק), והנימוק (rationale) חייב לציין את שניהם עם מספרים. הערך חייב להיות בטווח של ${MARKET_RANGE_TEXT} מהבסיס של הלקוח ב־4 השבועות האחרונים; יעד רחוק יותר יתריע מיד, ולכן מציעים אותו למשתמש עם set_pulse_target. לא דורס יעד מאושר שאדם קבע — אם יש כזה הכלי מסרב. יעד לקמפיין: רק לקמפיין שמופיע בדופק האחרון, ורק למטרה שלפיה הוא נמדד. יעד שוק מפעיל התראות כמו יעד מאושר, וההתראה מציינת שזה יעד שוק של כרמן. אם המשתמש עצמו רוצה לקבוע יעד — set_pulse_target.`,
    parameters: {
      type: "object",
      properties: {
        ...targetParams,
        rationale: {
          type: "string",
          description:
            "נימוק בעברית: הבנצ׳מרק בענף בישראל (טווח ומקור) וההיסטוריה של הלקוח (למשל CPL ממוצע ב־4 השבועות האחרונים)",
        },
      },
      required: ["client_id", "platform", "goal", "value", "rationale"],
    },
  },
  {
    name: "set_pulse_target",
    description:
      'יעד מאושר (CPL / CPA / ROAS) לקמפיין או לפלטפורמה של לקוח, לבקשת המשתמש. נכנס לתור האישורים: הציגי את השינוי ובקשי אישור, ורק אחרי "כן" — execute_pending_approval. מחליף גם יעד שוק שכרמן קבעה.',
    parameters: {
      type: "object",
      properties: {
        ...targetParams,
        note: { type: "string", description: "הערה לאישור (לא חובה)" },
      },
      required: ["client_id", "platform", "goal", "value"],
    },
  },
];
