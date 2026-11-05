/** The text of one alert message to one person (deterministic, Hebrew). */
import type { DeliveryRow, FindingRow } from "../findings/types.ts";

/** A daily list or an alert never carries more than this many items. */
export const MAX_ITEMS_PER_MESSAGE = 7;

export type MessageItem = {
  short_code: number;
  summary_he: string;
  /** Reached this person by escalation (not handled in time). */
  escalated: boolean;
  critical: boolean;
};

/** One message: a greeting by first name and the numbered items with their codes. */
export function composeAlertMessage(
  recipientName: string,
  items: MessageItem[],
): string {
  const name = firstName(recipientName);
  const intro =
    items.length === 1
      ? "יש דבר אחד שדורש טיפול:"
      : `יש ${items.length} דברים שדורשים טיפול:`;
  return [
    `היי${name ? ` ${name}` : ""}, ${intro}`,
    ...items.map(
      (item, index) =>
        `${index + 1}) #${item.short_code} ${item.summary_he}${note(item)}`,
    ),
  ].join("\n");
}

/** One item per finding of `rows`, marked escalated when it reached this person above level 0. */
export function messageItems(
  rows: DeliveryRow[],
  findings: Map<string, FindingRow>,
): MessageItem[] {
  return [...new Set(rows.map((row) => row.finding_id))].flatMap((id) => {
    const finding = findings.get(id);
    if (!finding) {
      return [];
    }
    const level = Math.max(
      ...rows.filter((row) => row.finding_id === id).map((row) => row.level),
    );
    const critical = finding.severity === "critical";
    return [
      {
        short_code: finding.short_code,
        summary_he: finding.summary_he,
        escalated: level > 0 && !critical,
        critical,
      },
    ];
  });
}

/** The first word of a display name, or "" when there is none. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** The marker after an item: urgent, or reached by escalation. */
function note(item: MessageItem): string {
  if (item.critical) {
    return " (דחוף)";
  }
  return item.escalated ? " (עבר אליך כי לא טופל בזמן)" : "";
}
