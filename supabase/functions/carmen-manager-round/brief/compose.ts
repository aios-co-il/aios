/**
 * The morning brief (BRIEF_CRON) for the brief recipients: at most
 * BRIEF_MAX_LINES lines, deterministic. Sections: what needs the reader's
 * decision (up to five items with short codes), one line counting the
 * client-card drafts waiting for approval with a link to the page that
 * approves them, the team's open items (team mode) and what Carmen already did in the last 24 hours. Read-only: the
 * short codes point at findings in the app; a parser for replies to the brief
 * is AIO-251 phase 2.
 */
import { dayMonth } from "../calendar/day-month.ts";
import { firstName } from "../dispatch/message.ts";

export const BRIEF_MAX_LINES = 15;
export const BRIEF_MAX_DECISIONS = 5;
export const BRIEF_MAX_TEAM_LINES = 3;

export type BriefItem = { short_code: number; summary_he: string };

/** Live card_stale_group drafts the reader may approve; `link` opens the card-drafts page. */
export type PendingDrafts = { count: number; link: string | null };

/** The card-drafts page link for a tenant (app-link.ts); null when it cannot be built. */
export type CardDraftsLink = (
  tenantId: string,
) => Promise<PendingDrafts["link"]>;

export type BriefInput = {
  recipientName: string;
  now: Date;
  decisions: BriefItem[];
  pendingDrafts: PendingDrafts;
  team: { name: string; open: number }[];
  activity: { autoCleared: number; messages: number };
};

/** The brief text for one reader, at most BRIEF_MAX_LINES lines. */
export function composeMorningBrief(input: BriefInput): string {
  const name = firstName(input.recipientName);
  const day = dayMonth(input.now);
  const lines = [`בוקר טוב${name ? ` ${name}` : ""}, הסיכום של כרמן ל־${day}:`];
  lines.push(...decisionLines(input.decisions, input.pendingDrafts.count > 0));
  lines.push(...draftLines(input.pendingDrafts));
  lines.push(...teamLines(input.team));
  lines.push(...activityLines(input.activity));
  return lines.slice(0, BRIEF_MAX_LINES).join("\n");
}

/**
 * Up to five items with their codes, or 'all is well' when nothing needs the
 * reader at all: with drafts waiting, the drafts line stands alone instead.
 */
function decisionLines(
  decisions: Array<BriefItem>,
  draftsWaiting: boolean,
): Array<string> {
  if (!decisions.length) {
    return draftsWaiting ? [] : ["הכל תקין, אין משהו שדורש החלטה שלך."];
  }
  const shown = decisions.slice(0, BRIEF_MAX_DECISIONS);
  const more = decisions.length - shown.length;
  return [
    "דורש החלטה שלך:",
    ...shown.map(
      (item, index) => `${index + 1}) #${item.short_code} ${item.summary_he}`,
    ),
    ...(more > 0 ? [`ועוד ${more} פתוחים במערכת`] : []),
  ];
}

/** One line counting the drafts waiting for approval; nothing when none waits. */
function draftLines({ count, link }: PendingDrafts): Array<string> {
  if (count <= 0) {
    return [];
  }
  const waiting =
    count === 1
      ? "📝 עדכון אחד לכרטיס לקוח מחכה לאישור"
      : `📝 ${count} עדכונים לכרטיסי לקוחות מחכים לאישור`;
  return [link ? `${waiting}: ${link}` : `${waiting} במערכת`];
}

/** The busiest people first, at most BRIEF_MAX_TEAM_LINES. */
function teamLines(team: BriefInput["team"]): string[] {
  const busy = team
    .filter((member) => member.open > 0)
    .sort((a, b) => b.open - a.open);
  if (!busy.length) {
    return [];
  }
  return [
    "הצוות:",
    ...busy
      .slice(0, BRIEF_MAX_TEAM_LINES)
      .map(
        (member) =>
          `• ${member.name}: ${member.open === 1 ? "פריט פתוח אחד" : `${member.open} פריטים פתוחים`}`,
      ),
  ];
}

/** What Carmen did in the last day; nothing when she did nothing. */
function activityLines(activity: BriefInput["activity"]): string[] {
  const lines = [
    activity.autoCleared === 1
      ? "• ממצא אחד נסגר מעצמו"
      : activity.autoCleared > 1
        ? `• ${activity.autoCleared} ממצאים נסגרו מעצמם`
        : null,
    activity.messages === 1
      ? "• נשלחה הודעה אחת לצוות"
      : activity.messages > 1
        ? `• נשלחו ${activity.messages} הודעות לצוות`
        : null,
  ].filter((line): line is string => line !== null);
  return lines.length ? ["מה כבר עשיתי ב־24 השעות האחרונות:", ...lines] : [];
}
