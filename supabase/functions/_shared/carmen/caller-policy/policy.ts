/**
 * How Carmen talks with callers outside the team: a known client or an unknown caller.
 * Each org edits its own policy (table carmen_caller_policies); with no row the defaults below
 * apply. Shared by the settings screen and Carmen's phone line.
 */

export const CALLER_KINDS = ["client", "unknown"] as const;

export type CallerKind = (typeof CALLER_KINDS)[number];

export type CallerPolicy = {
  /** Free text: how to open, what to tell about the service, tone. */
  instructions: string;
  /** Topics she may answer herself. */
  allowedTopics: Array<string>;
  /** Topics she never discusses; she offers to pass them to the team instead. */
  forbiddenTopics: Array<string>;
  mayTakeMessage: boolean;
  mayBookMeeting: boolean;
};

/** A policy row as the table stores it. */
export type CallerPolicyRow = {
  caller_kind: string;
  instructions: string;
  allowed_topics: Array<string>;
  forbidden_topics: Array<string>;
  may_take_message: boolean;
  may_book_meeting: boolean;
};

export const DEFAULT_CALLER_POLICIES: Record<CallerKind, CallerPolicy> = {
  client: {
    instructions:
      "עני בנימוס ובקצרה. כל בקשה לשינוי, לעבודה חדשה או לבירור מעמיק רשמי והעבירי לצוות המטפל בלקוח, ואמרי שיחזרו אליו.",
    allowedTopics: [
      "שעות פעילות ודרכי יצירת קשר",
      "מי איש הקשר שמטפל בלקוח",
      "אישור שהבקשה התקבלה והועברה לצוות",
    ],
    forbiddenTopics: [
      "מחירים, הצעות מחיר ותשלומים",
      "נתוני קמפיינים, תקציבים ותוצאות",
      "מידע על לקוחות אחרים",
      "התחייבות למועדים או לתוצאות",
      "מידע פנימי על הצוות והארגון",
    ],
    mayTakeMessage: true,
    mayBookMeeting: false,
  },
  unknown: {
    instructions:
      "הציגי את עצמך כעוזרת של הארגון, ספרי בקצרה על השירות, בררי מה הפונה מחפש, ונסי לקבוע פגישת היכרות. אם לא מתאים לו, רשמי שם, טלפון וסיבת הפנייה כהודעה.",
    allowedTopics: [
      "מה הארגון עושה ולמי השירות מתאים",
      "איך מתחילים לעבוד יחד",
      "קביעת פגישת היכרות",
    ],
    forbiddenTopics: [
      "מחירים והצעות מחיר",
      "מידע על לקוחות קיימים",
      "מידע פנימי על הצוות והארגון",
    ],
    mayTakeMessage: true,
    mayBookMeeting: true,
  },
};

/** The org's policy for this caller kind: its row, or the defaults. */
export function callerPolicyFor(
  kind: CallerKind,
  rows: Array<CallerPolicyRow>,
): CallerPolicy {
  const row = rows.find((r) => r.caller_kind === kind);
  if (!row) {
    return DEFAULT_CALLER_POLICIES[kind];
  }
  return {
    instructions: row.instructions,
    allowedTopics: row.allowed_topics,
    forbiddenTopics: row.forbidden_topics,
    mayTakeMessage: row.may_take_message,
    mayBookMeeting: row.may_book_meeting,
  };
}

/** The row to save for an org's policy (topics trimmed, blanks dropped). */
export function callerPolicyRow(
  tenantId: string,
  kind: CallerKind,
  policy: CallerPolicy,
) {
  const clean = (topics: Array<string>) =>
    topics.map((t) => t.trim()).filter(Boolean);
  return {
    tenant_id: tenantId,
    caller_kind: kind,
    instructions: policy.instructions.trim(),
    allowed_topics: clean(policy.allowedTopics),
    forbidden_topics: clean(policy.forbiddenTopics),
    may_take_message: policy.mayTakeMessage,
    may_book_meeting: policy.mayBookMeeting,
  };
}
