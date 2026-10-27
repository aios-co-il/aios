/**
 * Where a film's production stands, in words Carmen can pass on. Clips, narration, music and the
 * final assembly run on the render worker; when nothing claims the queued jobs she must say so
 * instead of promising the film or trying again.
 */

import { ENGINE_LABEL, isSceneEngine } from "./video-cost.ts";

export interface RunRow {
  kind: string;
  status: string;
  error?: string | null;
  created_at?: string | null;
  /** The engine that made the clip, and the one it replaced when it fell back. */
  provider?: string | null;
  fallback_from?: string | null;
  /** A render that was assembled without its sound effects, and why (output.sound_effects_error). */
  sound_effects_error?: string | null;
}

/** A queued job nobody claimed for this long means no worker is listening to this database. */
export const STALLED_AFTER_MIN = 3;

/** produce_video's own lock: a production marked running that started within the hour. */
export function productionRunning(
  production: Record<string, unknown> | null,
  now = Date.now(),
) {
  if (production?.status !== "running") return false;
  const started = Date.parse(String(production.started_at ?? ""));
  return !Number.isFinite(started) || started > now - 60 * 60_000;
}

/** Clips of this production that the free preview made because the paid engine refused them. */
function previewFallbacks(
  runs: RunRow[],
  production: Record<string, unknown> | null,
) {
  if (!production?.provider || production.provider === "mock") return [];
  const started = Date.parse(String(production.started_at ?? ""));
  return runs.filter(
    (run) =>
      run.kind === "clip" &&
      run.status === "completed" &&
      run.provider === "mock" &&
      Boolean(run.fallback_from) &&
      (!Number.isFinite(started) ||
        Date.parse(String(run.created_at ?? "")) >= started),
  );
}

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
  const preview = previewFallbacks(runs, production);
  const replaced = String(preview[0]?.fallback_from ?? "");
  const previewNote = preview.length
    ? ` ${preview.length} סצנות הונפשו במנוע התצוגה החינמי (תנועה פשוטה על התמונה) במקום ${isSceneEngine(replaced) ? ENGINE_LABEL[replaced] : replaced}, כי המנוע בתשלום סירב לעבודה (אין קרדיט או שהמפתח נדחה). אמרי זאת למשתמש ואל תציגי את הסרט כאילו נוצר במנוע בתשלום.`
    : "";
  // Music has no OpenRouter route: a film without a working ElevenLabs key is assembled
  // without its music bed, and the finished film's report says so once.
  const music = runs.find(
    (run) => run.kind === "music" && run.status === "failed",
  );
  const musicNote = music
    ? ` הסרט הורכב בלי מוזיקת רקע${music.error ? ` (${String(music.error).slice(0, 120)})` : ""}. אם עוד לא אמרת, אמרי זאת למשתמש במשפט אחד, ואל תנסי להפיק מוזיקה שוב.`
    : "";
  // Sound effects are made by the render itself; without them the film is still assembled,
  // and the report says so once. Runs come newest first: the latest render decides.
  const render = runs.find(
    (run) => run.kind === "render" && run.status === "completed",
  );
  const effectsNote = render?.sound_effects_error
    ? ` הסרט הורכב בלי אפקטי סאונד (${String(render.sound_effects_error).slice(0, 120)}). אם עוד לא אמרת, אמרי זאת למשתמש במשפט אחד, ואל תפיקי שוב בשביל זה.`
    : "";
  const summary = stalled
    ? `${queued.length} משימות ממתינות בתור כבר ${Math.round(oldestQueuedMin)} דקות ואף שרת הפקה לא קולט אותן. אמרי למשתמש שהסרט לא יחזור עד ששרת ההפקה (render worker) מחובר לסביבה הזו, ואל תנסי שוב ואל תבטיחי זמן.`
    : status === "failed"
      ? `ההפקה נכשלה: ${production?.error ?? errors[0] ?? "סיבה לא ידועה"}. הסבירי למשתמש והציעי לנסות שוב.`
      : status === "running"
        ? `ההפקה רצה: ${count("running")} בעבודה, ${queued.length} בתור, ${count("completed")} הושלמו. הסרט יופיע בלוח כשיסתיים.${previewNote}`
        : status === "done"
          ? `ההפקה הסתיימה והסרט בלוח.${previewNote}${musicNote}${effectsNote}`
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
    preview_clips: preview.length,
    summary,
  };
}
