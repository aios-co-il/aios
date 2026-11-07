// How Carmen's data is organised (AIO-510): AIOS runs marketing agencies, each with many
// clients. The leads table holds the agency's own leads, not its clients' leads, so a
// question about a client's leads is answered from that client's reports. One versioned
// block that run-ai-agent appends after the prompt and every skin, like the pulse rules,
// so it reaches V1, V2 and custom prompts alike. Bump AGENCY_DATA_RULES_VERSION whenever
// the rules or their place in the prompt change.

export const AGENCY_DATA_RULES_VERSION = "2026-11-08.1";

/** Which run gets the block: Carmen, outside isolated pin_skills_only sessions. */
type AgencyDataRun = { isCarmen?: boolean; pinSkillsOnly?: boolean };

/** Appends the block to a finished Carmen prompt; any other run comes back unchanged. */
export function appendAgencyDataRules(
  systemPrompt: string | null | undefined,
  run: AgencyDataRun = {},
): string {
  const base = systemPrompt ?? "";
  if (!getsAgencyDataRules(run)) {
    return base;
  }
  return `${base}\n\n${buildAgencyDataRulesBlock()}`;
}

/** The block version a run gets, for the run log; "none" when it gets no block. */
export function agencyDataRulesVersion(run: AgencyDataRun): string {
  return getsAgencyDataRules(run) ? AGENCY_DATA_RULES_VERSION : "none";
}

/** The data-model rules every Carmen prompt carries. */
export function buildAgencyDataRulesBlock(): string {
  return [
    `=== מבנה הנתונים: סוכנות ולקוחותיה (גרסה ${AGENCY_DATA_RULES_VERSION}) — גובר על כל הנחה אחרת ===`,
    "• AIOS מנהלת סוכנויות שיווק, ולכל סוכנות יש הרבה לקוחות.",
    "• הלידים במערכת (list_leads וטבלת הלידים) שייכים לסוכנות עצמה: לקוחות פוטנציאליים של הסוכנות. הם לא הלידים של לקוחות הסוכנות.",
    '• שאלה על לידים, פניות, רכישות או תוצאות של לקוח של הסוכנות (למשל "כמה לידים נכנסו לפ.ד פסגות מיום חמישי") עונים מהדוחות של אותו לקוח: get_latest_campaign_pulse עם client_name לסיכום השמור, ו-get_facebook_campaign_data עם client_id ו-days לתוצאות לפי קמפיין ותקופה. אסור לענות על זה מ-list_leads.',
    "• list_leads רק כשהשאלה היא על הלידים של הסוכנות עצמה: הפניות שהסוכנות קיבלה מלקוחות פוטנציאליים שלה.",
    "• כשלא ברור על איזה לקוח מדובר, מצאי אותו קודם (search_entities או list_clients), ואל תנחשי.",
  ].join("\n");
}

/** True when appendAgencyDataRules adds the block for this run. */
function getsAgencyDataRules({
  isCarmen,
  pinSkillsOnly = false,
}: AgencyDataRun): boolean {
  return Boolean(isCarmen) && !pinSkillsOnly;
}
