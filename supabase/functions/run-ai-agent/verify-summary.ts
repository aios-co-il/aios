/**
 * verify_report_vs_meta's answer (AIO-238): the checked tables, the problems,
 * and notes on what was not compared or not reached.
 */

/** What checking the tables produced. */
export type VerifyRun = {
  /** One answer per checked table, in table order. */
  results: Array<Record<string, unknown>>;
  notChecked: string[];
  rateLimited: boolean;
};

/** The tool's answer for a finished check. */
export function summarizeVerify(run: VerifyRun): Record<string, unknown> {
  const notSynced = run.results.filter((r) => r.not_compared);
  const checked = run.results.filter((r) => !r.not_compared);
  const problems = checked.filter((r) => r.error || !r.ok);
  const periods = [
    ...new Set(
      checked
        .map((r) => r.period)
        .filter((p): p is string => typeof p === "string" && p !== ""),
    ),
  ];
  return {
    period:
      periods.length === 1
        ? periods[0]
        : periods.length
          ? `${periods[0]} (לפי אזור הזמן של כל חשבון)`
          : null,
    checked: checked.length,
    ok_count: checked.length - problems.length,
    ok_clients: checked.filter((r) => !r.error && r.ok).map((r) => r.client),
    problems,
    ...(notSynced.length
      ? {
          not_yet_synced: notSynced.map((r) => ({
            client: r.client,
            dates: r.not_yet_synced,
          })),
          not_yet_synced_note: NOT_YET_SYNCED_NOTE,
        }
      : {}),
    ...(run.notChecked.length
      ? {
          not_checked: run.notChecked,
          note: run.rateLimited ? RATE_LIMITED_NOTE : DEADLINE_NOTE,
        }
      : {}),
  };
}

const NOT_YET_SYNCED_NOTE =
  "הסנכרון האחרון רץ לפני שהימים האלה הסתיימו, אז ייתכן שב-AIOS יש עליהם רק נתונים חלקיים. לא השוויתי אותם — זה לא אומר שהדוח תואם";

const RATE_LIMITED_NOTE =
  "מטא הגבילה את קצב הבקשות, אז עצרתי ולא בדקתי את כל הדוחות — הבדיקה הלילית שומרת תוצאות לכולם (get_reconciliation_status)";

const DEADLINE_NOTE =
  "לא הספקתי לבדוק את כל הדוחות בזמן — הבדיקה הלילית שומרת תוצאות לכולם (get_reconciliation_status)";
