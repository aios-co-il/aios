// One list for everything Carmen does: agent tasks (one-off / recurring),
// goals, dev tasks and system background jobs. Pure mapping helpers so the
// tasks panel and its tests share the same rules.
import { describeCronHe } from "../../supabase/functions/_shared/cron-next.ts";
import { computeNextRun } from "../../supabase/functions/_shared/agent-task-schedule.ts";
import type { Database, Tables } from "@/integrations/supabase/types";

export type TaskKind = "one_off" | "recurring" | "goal" | "dev" | "system";
export type TaskSource = "agent_tasks" | "goals" | "dev_tasks" | "cron_job";
export type TaskStatus =
  | "running"
  | "waiting"
  | "scheduled"
  | "blocked"
  | "paused"
  | "done"
  | "failed"
  | "cancelled"
  | "draft";

export type AgentTaskSourceRow = Partial<Tables<"agent_tasks">> & {
  ai_agents?: { name: string } | null;
};
export type GoalSourceRow = Partial<Tables<"goals">>;
export type DevTaskSourceRow = Partial<Tables<"dev_tasks">>;
export type CronJobSourceRow = Partial<
  Database["public"]["Functions"]["list_system_cron_jobs"]["Returns"][number]
>;

type CarmenTaskRowSource =
  | { source: "agent_tasks"; raw: AgentTaskSourceRow }
  | { source: "goals"; raw: GoalSourceRow }
  | { source: "dev_tasks"; raw: DevTaskSourceRow }
  | { source: "cron_job"; raw: CronJobSourceRow };

export type CarmenTaskRow = CarmenTaskRowSource & {
  key: string;
  kind: TaskKind;
  id: string;
  title: string;
  subtitle: string | null;
  scheduleLabel: string;
  status: TaskStatus;
  enabled: boolean | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  executorLabel: string | null;
  updatedAt: string | null;
};

export const KIND_LABELS: Record<TaskKind, string> = {
  one_off: "חד-פעמית",
  recurring: "חוזרת",
  goal: "יעד",
  dev: "פיתוח",
  system: "מערכת",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  running: "רצה עכשיו",
  waiting: "ממתינה",
  scheduled: "מתוזמנת",
  blocked: "חסומה",
  paused: "מושהית",
  done: "הסתיימה",
  failed: "נכשלה",
  cancelled: "בוטלה",
  draft: "טיוטה",
};

const fmt = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function isRecurringAgentTask(t: AgentTaskSourceRow): boolean {
  return ["recurring", "daily", "weekly"].includes(String(t.schedule_type));
}

export function agentTaskScheduleLabel(t: AgentTaskSourceRow): string {
  const type = String(t.schedule_type || "once");
  if (type === "recurring") {
    if (t.cron_expression) {
      const label = describeCronHe(String(t.cron_expression));
      return t.next_run ? label : `${label} · לא תוזמנה`;
    }
    return "חוזרת · ללא תזמון";
  }
  if (type === "daily") return "כל 24 שעות";
  if (type === "weekly") return "כל 7 ימים";
  if (t.scheduled_at) return `פעם אחת · ${fmt(t.scheduled_at)}`;
  return "ידנית";
}

export function agentTaskStatus(t: AgentTaskSourceRow): TaskStatus {
  const s = String(t.status || "pending");
  if (s === "running") return "running";
  if (s === "failed") return "failed";
  if (s === "paused" || t.enabled === false) return "paused";
  if (s === "completed") return isRecurringAgentTask(t) ? "scheduled" : "done";
  if (s === "cancelled") return "cancelled";
  if (s === "scheduled") return "scheduled";
  if (s === "open") return "waiting";
  if (isRecurringAgentTask(t) || t.scheduled_at) return "scheduled";
  return "waiting";
}

export function mapAgentTask(t: AgentTaskSourceRow): CarmenTaskRow {
  const recurring = isRecurringAgentTask(t);
  const agentName = t.ai_agents?.name ?? null;
  return {
    key: `agent_tasks:${t.id}`,
    kind: recurring ? "recurring" : "one_off",
    source: "agent_tasks",
    id: String(t.id),
    title: String(t.title || "משימה ללא שם"),
    subtitle: t.description ? String(t.description).slice(0, 140) : null,
    scheduleLabel: agentTaskScheduleLabel(t),
    status: agentTaskStatus(t),
    enabled: t.enabled === false ? false : true,
    lastRunAt: t.last_run ?? null,
    nextRunAt:
      t.next_run ??
      (!recurring && t.status === "pending" ? (t.scheduled_at ?? null) : null),
    executorLabel:
      [agentName, t.engine_model].filter(Boolean).join(" · ") || null,
    updatedAt: t.updated_at ?? t.created_at ?? null,
    raw: t,
  };
}

export function goalStatus(g: GoalSourceRow): TaskStatus {
  const s = String(g.status || "active");
  if (s === "completed") return "done";
  if (s === "cancelled") return "cancelled";
  if (s === "paused") return "paused";
  if (s === "blocked" || g.engine_status === "BLOCKED") return "blocked";
  if (
    g.autonomous_mode &&
    ["PLANNING", "EXECUTING", "VERIFYING", "REPLANNING"].includes(
      String(g.engine_status),
    )
  )
    return "running";
  if (s === "in_progress") return "running";
  return "waiting";
}

export function mapGoal(g: GoalSourceRow): CarmenTaskRow {
  const autonomous = Boolean(g.autonomous_mode);
  return {
    key: `goals:${g.id}`,
    kind: "goal",
    source: "goals",
    id: String(g.id),
    title: String(g.title || "יעד ללא שם"),
    subtitle:
      g.objective || g.description
        ? String(g.objective || g.description).slice(0, 140)
        : null,
    scheduleLabel: autonomous
      ? "מנוע אוטונומי · עד השלמה"
      : g.due_date
        ? `יעד עד ${fmt(g.due_date)}`
        : "מעקב",
    status: goalStatus(g),
    enabled: autonomous ? g.status !== "paused" : null,
    lastRunAt: g.last_iteration_at ?? null,
    nextRunAt: autonomous ? (g.next_run_at ?? null) : null,
    executorLabel: autonomous ? "מנוע יעדים" : null,
    updatedAt: g.updated_at ?? g.created_at ?? null,
    raw: g,
  };
}

export function devTaskStatus(d: DevTaskSourceRow): TaskStatus {
  const s = String(d.status || "draft");
  if (s === "done") return "done";
  if (s === "cancelled") return "cancelled";
  if (s === "blocked") return "blocked";
  if (s === "draft") return "draft";
  if (["sent_to_cursor", "in_progress", "pr_opened"].includes(s))
    return "running";
  return "waiting";
}

export function mapDevTask(d: DevTaskSourceRow): CarmenTaskRow {
  return {
    key: `dev_tasks:${d.id}`,
    kind: "dev",
    source: "dev_tasks",
    id: String(d.id),
    title: String(d.title || "משימת פיתוח"),
    subtitle: d.problem ? String(d.problem).slice(0, 140) : null,
    scheduleLabel: d.pr_url ? "PR נפתח" : "לפי שליחה לסוכן פיתוח",
    status: devTaskStatus(d),
    enabled: null,
    lastRunAt: d.dispatched_at ?? null,
    nextRunAt: null,
    executorLabel: d.assigned_agent ? String(d.assigned_agent) : null,
    updatedAt: d.updated_at ?? d.created_at ?? null,
    raw: d,
  };
}

export function mapCronJob(
  j: CronJobSourceRow,
  meta: { label: string; description: string },
  now: Date = new Date(),
): CarmenTaskRow {
  const lastOk = j.last_status === "succeeded";
  return {
    key: `cron_job:${j.jobid}`,
    kind: "system",
    source: "cron_job",
    id: String(j.jobid),
    title: meta.label || String(j.jobname),
    subtitle: meta.description || String(j.jobname),
    // pg_cron runs in UTC; the row shows the next run in Israel time.
    scheduleLabel: `${describeCronHe(String(j.schedule || ""))} (UTC)`,
    status: !j.active
      ? "paused"
      : j.last_status && !lastOk && j.last_status !== "running"
        ? "failed"
        : j.last_status === "running"
          ? "running"
          : "scheduled",
    enabled: Boolean(j.active),
    lastRunAt: j.last_run_at ?? null,
    nextRunAt: j.active
      ? computeNextRun(String(j.schedule || ""), now, "UTC")
      : null,
    executorLabel: "מערכת",
    updatedAt: j.last_run_at ?? null,
    raw: j,
  };
}

export type TaskFilter =
  "all" | "running" | "recurring" | "one_off" | "goal" | "dev" | "system";

export const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "running", label: "רצות עכשיו" },
  { value: "recurring", label: "חוזרות" },
  { value: "one_off", label: "חד-פעמיות" },
  { value: "goal", label: "יעדים" },
  { value: "dev", label: "פיתוח" },
  { value: "system", label: "מערכת" },
];

const FINISHED: TaskStatus[] = ["done", "cancelled"];
const ORDER: TaskStatus[] = [
  "running",
  "failed",
  "blocked",
  "waiting",
  "scheduled",
  "draft",
  "paused",
  "done",
  "cancelled",
];

/** Filter + sort rows for the panel. Finished items are hidden unless asked. */
export function selectRows(
  rows: CarmenTaskRow[],
  filter: TaskFilter,
  opts: { showFinished?: boolean; search?: string } = {},
): CarmenTaskRow[] {
  const q = (opts.search || "").trim().toLowerCase();
  return rows
    .filter((r) => {
      if (filter === "running" && r.status !== "running") return false;
      if (filter !== "all" && filter !== "running" && r.kind !== filter)
        return false;
      if (!opts.showFinished && FINISHED.includes(r.status)) return false;
      if (q && !`${r.title} ${r.subtitle ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    })
    .sort((a, b) => {
      const s = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
      if (s !== 0) return s;
      const an = a.nextRunAt ? Date.parse(a.nextRunAt) : Infinity;
      const bn = b.nextRunAt ? Date.parse(b.nextRunAt) : Infinity;
      if (an !== bn) return an - bn;
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });
}

export function countRunning(rows: CarmenTaskRow[]): number {
  return rows.filter((r) => r.status === "running").length;
}
