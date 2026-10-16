import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  CalendarClock,
  ChevronLeft,
  Code2,
  HeartPulse,
  Plus,
  Repeat,
  Search,
  Server,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  FILTERS,
  KIND_LABELS,
  STATUS_LABELS,
  countRunning,
  selectRows,
  type CarmenTaskRow,
  type TaskFilter,
  type TaskKind,
  type TaskStatus,
} from "@/lib/carmenTaskRows";
import { computeNextRun } from "../../../../supabase/functions/_shared/agent-task-schedule.ts";
import { carmenTasksKey, useCarmenTasks } from "../useCarmenTasks";

const db = supabase as any;

const KIND_ICON: Record<TaskKind, typeof Repeat> = {
  one_off: Bot,
  recurring: Repeat,
  goal: Target,
  dev: Code2,
  system: Server,
};

const STATUS_TONE: Record<TaskStatus, string> = {
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  waiting: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  scheduled: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  blocked: "bg-red-500/15 text-red-700 dark:text-red-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  paused: "bg-muted text-muted-foreground",
  done: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

function when(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rel =
    abs < 60_000
      ? "עכשיו"
      : abs < 3_600_000
        ? `${Math.round(abs / 60_000)} דק׳`
        : abs < 86_400_000
          ? `${Math.round(abs / 3_600_000)} שע׳`
          : null;
  if (rel)
    return diff >= 0 ? `בעוד ${rel}` : rel === "עכשיו" ? rel : `לפני ${rel}`;
  return d.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CarmenTasksView({
  tenantId,
  filter,
  onFilterChange,
  onNavigate,
}: {
  tenantId: string | null;
  filter: TaskFilter;
  onFilterChange: (f: TaskFilter) => void;
  onNavigate: (path: string) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useCarmenTasks(tenantId);
  const [search, setSearch] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const rows = data?.rows ?? [];
  const visible = useMemo(
    () => selectRows(rows, filter, { showFinished, search }),
    [rows, filter, showFinished, search],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { running: countRunning(rows) };
    for (const r of rows) {
      if (r.status === "done" || r.status === "cancelled") continue;
      c[r.kind] = (c[r.kind] ?? 0) + 1;
      c.all = (c.all ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const toggle = useMutation({
    mutationFn: async (row: CarmenTaskRow) => {
      const on = !row.enabled;
      if (row.source === "agent_tasks") {
        const raw = row.raw as Record<string, any>;
        const patch: Record<string, unknown> = { enabled: on };
        // Resuming a cron task schedules from now — missed runs are not replayed.
        if (raw.schedule_type === "recurring" && raw.cron_expression)
          patch.next_run = on
            ? computeNextRun(raw.cron_expression, new Date(), raw.timezone)
            : null;
        if (on && raw.status === "paused") patch.status = "pending";
        const { error: e } = await db
          .from("agent_tasks")
          .update(patch)
          .eq("id", row.id);
        if (e) throw e;
      } else if (row.source === "goals") {
        const { error: e } = await db
          .from("goals")
          .update(
            on
              ? { status: "active", next_run_at: new Date().toISOString() }
              : { status: "paused" },
          )
          .eq("id", row.id);
        if (e) throw e;
      } else if (row.source === "cron_job") {
        const { error: e } = await db.rpc("update_system_cron_job", {
          p_jobid: Number(row.id),
          p_schedule: null,
          p_active: on,
        });
        if (e) throw e;
      }
      return on;
    },
    onSuccess: (on) => {
      qc.invalidateQueries({ queryKey: carmenTasksKey(tenantId) });
      qc.invalidateQueries({ queryKey: ["system-cron-jobs"] });
      toast.success(on ? "הופעלה" : "הושהתה");
    },
    onError: (e: any) => toast.error(e?.message ?? String(e)),
  });

  const showHeartbeat = filter === "all" || filter === "system";
  const { data: maxParallel = 3 } = useQuery({
    queryKey: ["carmen-max-parallel", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await db
        .from("tenant_heartbeat_settings")
        .select("max_concurrent_tasks")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return Number(data?.max_concurrent_tasks) || 3;
    },
  });
  const setMaxParallel = useMutation({
    mutationFn: async (n: number) => {
      // tenant_heartbeat_settings has no unique key on tenant_id, so no upsert.
      const { data: updated, error: e } = await db
        .from("tenant_heartbeat_settings")
        .update({ max_concurrent_tasks: n })
        .eq("tenant_id", tenantId)
        .select("tenant_id");
      if (e) throw e;
      if (!updated?.length) {
        const { error: insertError } = await db
          .from("tenant_heartbeat_settings")
          .insert({ tenant_id: tenantId, max_concurrent_tasks: n });
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carmen-max-parallel", tenantId] });
      toast.success("עודכן");
    },
    onError: (e: any) => toast.error(e?.message ?? String(e)),
  });

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => onNavigate("new")}>
          <Plus className="h-4 w-4" /> משימה חדשה
        </Button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש"
            className="h-9 pr-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.filter(
          (f) => f.value !== "system" || data?.systemJobsVisible,
        ).map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onFilterChange(f.value)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              filter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {f.label}
            {counts[f.value] ? (
              <span className="ms-1 opacity-70">{counts[f.value]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {showHeartbeat && !search && (
        <button
          type="button"
          onClick={() => onNavigate("task/heartbeat")}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-right hover:bg-muted"
        >
          <HeartPulse className="h-5 w-5 shrink-0 text-rose-500" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              הדופק של כרמן ובדיקות דופק לקמפיינים
            </span>
            <span className="block text-xs text-muted-foreground">
              כל כמה זמן כרמן בודקת, שעות פעילות, למי נשלחת בדיקת הדופק וחוקי
              התראה
            </span>
          </span>
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">טוען משימות…</p>
      )}
      {error && (
        <p className="text-sm text-destructive">
          שגיאה בטעינת משימות: {(error as Error).message}
        </p>
      )}
      {!isLoading && visible.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          אין משימות בתצוגה הזו.
        </p>
      )}

      <ul className="space-y-1.5">
        {visible.map((row) => {
          const Icon = KIND_ICON[row.kind];
          const canToggle =
            row.enabled !== null &&
            (row.source === "agent_tasks" ||
              row.source === "cron_job" ||
              row.source === "goals");
          return (
            <li key={row.key}>
              <div className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/60">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-3 text-right"
                  onClick={() => onNavigate(`task/${row.source}/${row.id}`)}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {row.title}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {KIND_LABELS[row.kind]}
                      </Badge>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_TONE[row.status]}`}
                      >
                        {row.status === "running" && (
                          <Activity className="me-0.5 inline h-3 w-3 animate-pulse" />
                        )}
                        {STATUS_LABELS[row.status]}
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {row.scheduleLabel}
                      </span>
                      {row.nextRunAt && row.status !== "paused" && (
                        <span>הבאה: {when(row.nextRunAt)}</span>
                      )}
                      {row.lastRunAt && (
                        <span>אחרונה: {when(row.lastRunAt)}</span>
                      )}
                      {row.executorLabel && <span>· {row.executorLabel}</span>}
                    </span>
                  </span>
                </button>
                {canToggle && (
                  <Switch
                    checked={Boolean(row.enabled)}
                    disabled={toggle.isPending}
                    onCheckedChange={() => toggle.mutate(row)}
                    aria-label={row.enabled ? "השהיה" : "הפעלה"}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>עד</span>
        <select
          value={maxParallel}
          onChange={(e) => setMaxParallel.mutate(Number(e.target.value))}
          disabled={setMaxParallel.isPending}
          className="rounded border bg-background px-1 py-0.5"
          aria-label="מקסימום משימות במקביל"
        >
          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>משימות רצות במקביל · {counts.running ?? 0} רצות עכשיו</span>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={showFinished} onCheckedChange={setShowFinished} />
        הצגת משימות שהסתיימו
      </label>
    </div>
  );
}

const NEW_KINDS: {
  path: string;
  title: string;
  hint: string;
  icon: typeof Repeat;
}[] = [
  {
    path: "new/task",
    title: "משימה חד-פעמית",
    hint: "עכשיו או במועד מסוים",
    icon: Bot,
  },
  {
    path: "new/recurring",
    title: "משימה חוזרת",
    hint: "כל יום, ימי חול, שבועי, כל כמה דקות או cron",
    icon: Repeat,
  },
  {
    path: "new/template/pulse",
    title: "בדיקת דופק לקמפיינים",
    hint: "משימה חוזרת מוכנה — אפשר לשנות שעה, מבצע והנחיות",
    icon: HeartPulse,
  },
  {
    path: "new/template/weekly_report",
    title: "דוח ביצועים שבועי",
    hint: "משימה חוזרת מוכנה",
    icon: CalendarClock,
  },
  {
    path: "new/goal",
    title: "יעד",
    hint: "כרמן עובדת עליו בלולאה עד שהוא מושג",
    icon: Target,
  },
  {
    path: "new/dev",
    title: "משימת פיתוח",
    hint: "ל-Cursor או Claude, אחרי אישור",
    icon: Code2,
  },
];

export function NewTaskChooser({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  return (
    <nav className="flex flex-col gap-1" dir="rtl">
      {NEW_KINDS.map((k) => (
        <button
          key={k.path}
          type="button"
          onClick={() => onNavigate(k.path)}
          className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-right hover:border-border hover:bg-muted"
        >
          <k.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{k.title}</span>
            <span className="block text-xs text-muted-foreground">
              {k.hint}
            </span>
          </span>
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
    </nav>
  );
}
