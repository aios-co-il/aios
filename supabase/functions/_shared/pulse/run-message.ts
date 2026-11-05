/** The one WhatsApp message a recipient phone gets per pulse run (AIO-290). */
import type {
  PulseAlertRuleType,
  PulseInstantAlertCandidate,
} from "../pulse-instant-alerts.ts";
import { APP_TIME_ZONE } from "../calendarTimeZone.ts";
import { PULSE_ALERT_FOOTER } from "./alert-footer.ts";

/** Lines shown per section; the rest of a section is counted as "ועוד X". */
export const PULSE_RUN_SECTION_MAX_LINES = 8;

/** The sections of a run message, in this order; an empty one is left out. */
const SECTIONS: Array<{ rule: PulseAlertRuleType; title: string }> = [
  { rule: "campaign_exception", title: "🔴 חריגות קמפיין" },
  { rule: "connection_lost", title: "🔴 חיבור / קמפיין נעצר" },
  { rule: "no_contact", title: "🟡 אין עדכון קשר" },
  // Only legacy snapshots, which have no campaign evidence, raise it.
  { rule: "cpl_spike", title: "🔴 עליית CPL" },
];

type RunMessageAlert = Pick<
  PulseInstantAlertCandidate,
  "rule_type" | "line" | "severity_score"
>;

/**
 * The run's alerts for one phone, built by code with no model call: a header
 * with the organization and the Israel date and time, one section per rule
 * type, most severe first, and one footer. Each section shows at most
 * PULSE_RUN_SECTION_MAX_LINES lines on its own, so a long one never pushes
 * another out.
 */
export function buildPulseRunMessage(
  orgName: string,
  now: Date,
  alerts: RunMessageAlert[],
): string {
  const sections = SECTIONS.flatMap(({ rule, title }) => {
    const lines = alerts
      .filter((alert) => alert.rule_type === rule)
      // A stable sort: equal severity keeps the evaluation order.
      .sort((a, b) => (b.severity_score ?? 0) - (a.severity_score ?? 0))
      .map((alert) => alert.line);
    return lines.length ? [sectionText(title, lines)] : [];
  });
  return [header(orgName, now), ...sections, PULSE_ALERT_FOOTER].join("\n\n");
}

/** "🔔 *דופק — <org>* · 2.11.2026, 09:05", in Israel time. */
function header(orgName: string, now: Date): string {
  const at = now.toLocaleString("he-IL", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `🔔 *דופק — ${oneLine(orgName)}* · ${at}`;
}

/** The title, a "• " line per alert up to the cap, then "ועוד X" for the rest. */
function sectionText(title: string, lines: string[]): string {
  const shown = lines.slice(0, PULSE_RUN_SECTION_MAX_LINES);
  const rest = lines.length - shown.length;
  return [
    title,
    ...shown.map((line) => `• ${oneLine(line)}`),
    ...(rest > 0 ? [`ועוד ${rest}`] : []),
  ].join("\n");
}

/** A campaign or client name with a line break must not break the layout. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
