/** Fields the stats view reads from a broadcast recipient. */
export interface RecipientTimes {
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

export type RecipientFilter =
  "all" | "opened" | "not_opened" | "clicked" | "failed";

export const RECIPIENT_FILTERS: { key: RecipientFilter; label: string }[] = [
  { key: "all", label: "כולם" },
  { key: "opened", label: "פתחו" },
  { key: "not_opened", label: "לא פתחו" },
  { key: "clicked", label: "הקליקו" },
  { key: "failed", label: "נכשלו" },
];

export const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  pending: "ממתין",
  sent: "נשלח",
  delivered: "נמסר",
  read: "נקרא",
  failed: "נכשל",
  opted_out: "הוסר",
  skipped: "דולג",
};

/** Counts per stage. Open / click rates use delivered mail as the base, or sent mail before any delivery event arrives. */
export function countRecipients(rows: RecipientTimes[]) {
  const total = rows.length;
  const sent = rows.filter((r) => r.sent_at).length;
  const delivered = rows.filter((r) => r.delivered_at).length;
  const opened = rows.filter((r) => r.opened_at).length;
  const clicked = rows.filter((r) => r.clicked_at).length;
  const failed = rows.filter((r) => r.status === "failed").length;
  return {
    total,
    sent,
    delivered,
    opened,
    clicked,
    failed,
    rateBase: delivered || sent,
  };
}

/** Whole-number percentage, or "—" when there is nothing to measure against. */
export function percent(part: number, of: number): string {
  return of > 0 ? `${Math.round((part / of) * 100)}%` : "—";
}

export function matchesFilter(
  r: RecipientTimes,
  filter: RecipientFilter,
): boolean {
  switch (filter) {
    case "opened":
      return !!r.opened_at;
    case "not_opened":
      return !r.opened_at && r.status !== "failed";
    case "clicked":
      return !!r.clicked_at;
    case "failed":
      return r.status === "failed";
    default:
      return true;
  }
}
