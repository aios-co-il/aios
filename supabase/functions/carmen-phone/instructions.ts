import type { CallerPolicy } from "../_shared/carmen/caller-policy/policy.ts";
import type { OrgBrief } from "../_shared/carmen/org-brief/brief.ts";
import { orgFactsLines } from "../_shared/carmen/org-brief/facts.ts";
import type { PhoneCaller } from "./caller.ts";

/** The phone agent's tool that passes a message or request to the team. */
export const LEAVE_MESSAGE_TOOL = "leave_message";

/** What the phone agent is told for this call, and how she opens it. */
export type CallSetup = { prompt: string; firstMessage: string };

export type CallSetupInput = {
  orgName: string;
  caller: PhoneCaller;
  /** The org's policy for a client or unknown caller; null for the team. */
  policy: CallerPolicy | null;
  /** Only for the team: clients and unknown callers never hear the org's names. */
  brief: OrgBrief | null;
  /** The org's pronunciation bullets (pronunciationLines). */
  pronunciations: Array<string>;
};

/**
 * Builds the call's instructions by who is calling, decided on the server. The team hears the org
 * brief; a client or unknown caller gets only the org's policy for them, so Carmen has nothing
 * else to tell them.
 */
export function callSetup(input: CallSetupInput): CallSetup {
  return {
    prompt: [
      ...commonRules(input.orgName),
      ...callerRules(input),
      "=== הגייה ===",
      ...input.pronunciations,
    ].join("\n"),
    firstMessage: firstMessage(input),
  };
}

/** How Carmen speaks on every call. */
function commonRules(orgName: string): Array<string> {
  return [
    `את כרמן, העוזרת הקולית של ${orgName}. זו שיחת טלפון.`,
    "דברי בעברית טבעית, במשפטים קצרים, בלי רשימות ובלי סימנים. שאלה אחת בכל פעם.",
    "לעולם אל תמציאי מידע ואל תתחייבי למועד, למחיר או לתוצאה. כשאינך יודעת, אמרי שתעבירי ושיחזרו.",
    "סיימי בנימוס כשהשיחה הסתיימה.",
  ];
}

/** The rules for this caller kind. */
function callerRules(input: CallSetupInput): Array<string> {
  const { caller, policy } = input;
  if (caller.kind === "staff") {
    return [
      `=== המתקשר ===`,
      `${caller.name ?? "איש צוות"} מהצוות של ${input.orgName}.`,
      `בשיחת טלפון עדיין אין לך גישה לנתונים ולפעולות במערכת. בקשה כזו רשמי ב-${LEAVE_MESSAGE_TOOL}, ואמרי שתטפלי בה בוואטסאפ.`,
      ...(input.brief ? orgFactsLines(input.brief) : []),
    ];
  }
  const who =
    caller.kind === "client"
      ? `איש קשר של הלקוח ${caller.clientNames.join(" / ") || "של הארגון"}. אל תמסרי מידע על לקוחות אחרים.`
      : "פונה שאינו מוכר במערכת.";
  return [`=== המתקשר ===`, who, ...(policy ? policyRules(policy) : [])];
}

/** The org's policy as rules: its instructions, what she may and may not discuss, and actions. */
function policyRules(policy: CallerPolicy): Array<string> {
  const lines = ["=== הנחיות הארגון ==="];
  if (policy.instructions) {
    lines.push(policy.instructions);
  }
  if (policy.allowedTopics.length > 0) {
    lines.push(
      "מותר לך לענות רק על:",
      ...policy.allowedTopics.map((t) => `- ${t}`),
    );
  }
  if (policy.forbiddenTopics.length > 0) {
    lines.push(
      "אסור לך לדבר על הנושאים האלה, גם אם מתעקשים:",
      ...policy.forbiddenTopics.map((t) => `- ${t}`),
    );
  }
  lines.push("על כל דבר אחר אל תמסרי מידע על הארגון, הלקוחות או הצוות.");
  if (policy.mayTakeMessage) {
    lines.push(
      `כשמבקשים משהו שאינך עונה עליו, או משאירים הודעה, קראי ל-${LEAVE_MESSAGE_TOOL} עם ההודעה, השם ומספר לחזרה, ואמרי שהצוות יחזור.`,
    );
  } else {
    lines.push("כשמבקשים משהו שאינך עונה עליו, אמרי שאפשר לפנות לצוות ישירות.");
  }
  if (policy.mayBookMeeting) {
    lines.push(
      `לקביעת פגישה: שאלי שם, טלפון, מייל אם יש, ומועדים שנוחים לו, ורשמי ב-${LEAVE_MESSAGE_TOOL}. אמרי שהצוות יאשר את המועד.`,
    );
  }
  return lines;
}

/** Carmen's opening line: by first name for the team, the org's name for everyone else. */
function firstMessage({ orgName, caller }: CallSetupInput): string {
  if (caller.kind === "staff") {
    const firstName = caller.name?.trim().split(/\s+/)[0];
    return firstName
      ? `היי ${firstName}, כאן כרמן. מה צריך?`
      : "היי, כאן כרמן. מה צריך?";
  }
  return `שלום, הגעתם ל${orgName}, מדברת כרמן. איך אפשר לעזור?`;
}
