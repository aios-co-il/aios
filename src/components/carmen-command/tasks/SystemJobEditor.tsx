import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getCronMeta } from "@/lib/cronJobsCatalog";
import {
  describeCronHe,
  isValidCron,
} from "../../../../supabase/functions/_shared/cron-next.ts";
import { computeNextRun } from "../../../../supabase/functions/_shared/agent-task-schedule.ts";
import { carmenTasksKey } from "../useCarmenTasks";

const db = supabase as any;

const PRESETS = [
  { label: "כל 15 דקות", value: "*/15 * * * *" },
  { label: "כל 30 דקות", value: "*/30 * * * *" },
  { label: "כל שעה", value: "0 * * * *" },
  { label: "כל 6 שעות", value: "0 */6 * * *" },
];

/** Hours Israel is ahead of UTC right now (2 in winter, 3 in summer). */
function israelOffsetHours(now = new Date()): number {
  const local = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }),
  );
  const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((local.getTime() - utc.getTime()) / 3_600_000);
}

/**
 * pg_cron jobs are scheduled in UTC. The editor shows and edits the raw
 * expression and previews the next run in Israel time.
 */
export function SystemJobEditor({
  tenantId,
  jobId,
  onDone,
}: {
  tenantId: string | null;
  jobId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const jobid = Number(jobId);
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["system-cron-jobs"],
    queryFn: async () => {
      const { data, error } = await db.rpc("list_system_cron_jobs");
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });
  const job = jobs.find((j) => Number(j.jobid) === jobid) ?? null;
  const meta = job ? getCronMeta(String(job.jobname)) : null;

  const [schedule, setSchedule] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!job) return;
    setSchedule(String(job.schedule ?? ""));
    setActive(Boolean(job.active));
  }, [job]);

  const valid = isValidCron(schedule);
  const next = useMemo(
    () => (valid ? computeNextRun(schedule, new Date(), "UTC") : null),
    [schedule, valid],
  );

  const { data: history = [] } = useQuery({
    queryKey: ["cron-history", jobid],
    enabled: Number.isFinite(jobid),
    queryFn: async () => {
      const { data, error } = await db.rpc("get_cron_job_history", {
        p_jobid: jobid,
        p_limit: 10,
      });
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["system-cron-jobs"] });
    qc.invalidateQueries({ queryKey: carmenTasksKey(tenantId) });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error("תזמון לא תקין");
      const { error } = await db.rpc("update_system_cron_job", {
        p_jobid: jobid,
        p_schedule: schedule,
        p_active: active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("נשמר");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? String(e)),
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("run_system_cron_job_now", {
        p_jobid: jobid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הופעל");
      setTimeout(invalidate, 2000);
    },
    onError: (e: any) => toast.error(e?.message ?? String(e)),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">טוען…</p>;
  if (!job)
    return (
      <p className="text-sm text-muted-foreground">
        המשימה לא נמצאה, או שאין הרשאה למשימות מערכת.
      </p>
    );

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <p className="text-base font-medium">
          {meta?.icon} {meta?.label ?? job.jobname}
        </p>
        {meta?.description && (
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        )}
        <p
          className="mt-1 font-mono text-[11px] text-muted-foreground"
          dir="ltr"
        >
          {job.jobname}
        </p>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <Label htmlFor="job-schedule">תזמון (cron, לפי UTC)</Label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.value}
              type="button"
              size="sm"
              variant={schedule === p.value ? "default" : "outline"}
              onClick={() => setSchedule(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            כל יום בשעה (שעון ישראל):
          </span>
          <Input
            type="time"
            className="h-8 w-32"
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              if (Number.isNaN(h) || Number.isNaN(m)) return;
              const utcHour = (h - israelOffsetHours() + 24) % 24;
              setSchedule(`${m} ${utcHour} * * *`);
            }}
          />
          <span className="text-xs text-muted-foreground">
            ההמרה לפי השעון הנוכחי; pg_cron רץ ב-UTC, אז במעבר שעון קיץ/חורף
            הריצה תזוז בשעה.
          </span>
        </div>
        <Input
          id="job-schedule"
          dir="ltr"
          className="font-mono"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
        />
        <p
          className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}
        >
          {valid
            ? `${describeCronHe(schedule)} (UTC) · הריצה הבאה בשעון ישראל: ${
                next
                  ? new Date(next).toLocaleString("he-IL", {
                      timeZone: "Asia/Jerusalem",
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"
              }`
            : "תזמון לא תקין"}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">פעילה</p>
          <p className="text-xs text-muted-foreground">
            כיבוי עוצר את הריצות הבאות. ריצות שפוספסו לא מושלמות בדיעבד.
          </p>
        </div>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !valid}
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          שמור
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (window.confirm("להריץ את משימת המערכת עכשיו?")) runNow.mutate();
          }}
          disabled={runNow.isPending}
        >
          <Play className="h-4 w-4" /> הרץ עכשיו
        </Button>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
      </div>

      {history.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            ריצות אחרונות
          </p>
          {history.map((r) => (
            <div
              key={r.runid}
              className="flex items-center justify-between rounded border px-2 py-1 text-xs"
            >
              <span>
                {new Date(r.start_time).toLocaleString("he-IL", {
                  timeZone: "Asia/Jerusalem",
                })}
              </span>
              <span
                className={
                  r.status === "succeeded"
                    ? "text-green-600"
                    : "text-destructive"
                }
              >
                {r.status === "succeeded" ? "הצליחה" : r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
