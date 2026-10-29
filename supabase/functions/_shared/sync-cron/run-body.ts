/**
 * The answer of a report sync cron run (Google Ads, Google Analytics,
 * AIO-342): how many tables synced, failed and were skipped. A run in which
 * tables were tried and none synced answers `success: false` with 502, so a
 * cron whose every table failed (a lost connection, for example) never reads
 * as a success in the cron history.
 */

export type CronTableCounts = {
  synced: number;
  failed: number;
  skipped: number;
};

/** Response body and HTTP status for one cron invocation's tables. */
export function cronRunBody(
  counts: CronTableCounts,
  extra: Record<string, unknown> = {},
): { body: Record<string, unknown>; status: number } {
  const allFailed = counts.failed > 0 && counts.synced === 0;
  return {
    status: allFailed ? 502 : 200,
    body: {
      success: !allFailed,
      tables_synced: counts.synced,
      tables_failed: counts.failed,
      tables_skipped: counts.skipped,
      ...extra,
    },
  };
}

/** Counts results by status: `synced` and `failed` name theirs, the rest is skipped. */
export function countCronTables(
  results: Array<{ status: string }>,
  statuses: { synced: Array<string>; failed: Array<string> },
): CronTableCounts {
  const count = (names: Array<string>) =>
    results.filter((row) => names.includes(row.status)).length;
  const synced = count(statuses.synced);
  const failed = count(statuses.failed);
  return { synced, failed, skipped: results.length - synced - failed };
}

/**
 * The cron's HTTP answer from cronRunBody; a run in which every table failed
 * is also logged as an error.
 */
export function cronRunResponse(
  tag: string,
  counts: CronTableCounts,
  extra: Record<string, unknown>,
  headers: Record<string, string>,
): Response {
  const { body, status } = cronRunBody(counts, extra);
  if (!body.success) {
    console.error(`[${tag}] every table in this run failed`, counts);
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
