/**
 * Where a film's production stands, in words Carmen can pass on. Clips, narration, music and the
 * final assembly run on the render worker; when nothing claims the queued jobs she must say so
 * instead of promising the film or trying again.
 */

export interface RunRow {
  kind: string;
  status: string;
  error?: string | null;
  created_at?: string | null;
}

/** A queued job nobody claimed for this long means no worker is listening to this database. */
export const STALLED_AFTER_MIN = 3;

export function productionReport(
  runs: RunRow[],
  production: Record<string, unknown> | null,
  now = Date.now(),
) {
  const count = (status: string) =>
    runs.filter((run) => run.status === status).length;
  const queued = runs.filter((run) => run.status === "queued");
  const oldestQueuedMin = queued.length
    ? Math.max(
        ...queued.map((run) =>
          run.created_at
            ? Math.max(0, (now - Date.parse(run.created_at)) / 60_000)
            : 0,
        ),
      )
    : 0;
  const stalled =
    queued.length > 0 &&
    count("running") === 0 &&
    oldestQueuedMin >= STALLED_AFTER_MIN;
  const errors = [
    ...new Set(
      runs
        .filter((run) => run.status === "failed" && run.error)
        .map((run) => String(run.error).slice(0, 200)),
    ),
  ].slice(0, 3);
  const status =
    typeof production?.status === "string" ? production.status : "idle";
  const summary = stalled
    ? `${queued.length} משימות ממתינות בתור כבר ${Math.round(oldestQueuedMin)} דקות ואף שרת הפקה לא קולט אותן. אמרי למשתמש שהסרט לא יחזור עד ששרת ההפקה (render worker) מחובר לסביבה הזו, ואל תנסי שוב ואל תבטיחי זמן.`
    : status === "failed"
      ? `ההפקה נכשלה: ${production?.error ?? errors[0] ?? "סיבה לא ידועה"}. הסבירי למשתמש והציעי לנסות שוב.`
      : status === "running"
        ? `ההפקה רצה: ${count("running")} בעבודה, ${queued.length} בתור, ${count("completed")} הושלמו. הסרט יופיע בלוח כשיסתיים.`
        : status === "done"
          ? "ההפקה הסתיימה והסרט בלוח."
          : "אין הפקה פעילה.";
  return {
    status,
    queued: queued.length,
    running: count("running"),
    completed: count("completed"),
    failed: count("failed"),
    oldest_queued_min: Math.round(oldestQueuedMin),
    stalled,
    errors,
    summary,
  };
}
