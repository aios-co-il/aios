import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { asJsonObject } from "@/lib/jsonObject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrainSelector } from "@/components/agents/BrainSelector";
import { describeCronHe } from "../../../../supabase/functions/_shared/cron-next.ts";
import {
  DEFAULT_TASK_TIMEZONE,
  computeNextRun,
  freshOccurrenceResult,
} from "../../../../supabase/functions/_shared/agent-task-schedule.ts";
import {
  DEFAULT_RECURRING,
  PRESET_LABELS,
  TASK_TEMPLATES,
  WEEKDAY_LABELS,
  buildCron,
  isUsableCron,
  scheduleFromCron,
  type RecurringPreset,
  type RecurringSchedule,
} from "@/lib/taskSchedulePresets";
import { carmenTasksKey, useTenantAgents } from "../useCarmenTasks";

type AgentTaskPayload = TablesUpdate<"agent_tasks"> &
  Pick<TablesInsert<"agent_tasks">, "title" | "agent_id">;

type When = "now" | "at" | "recurring";

const MODES: { value: string; label: string }[] = [
  { value: "none", label: "כללי" },
  { value: "analyst", label: "ניתוח נתונים" },
  { value: "sales", label: "מכירות" },
  { value: "copywriting", label: "קופירייטינג" },
  { value: "support", label: "שירות" },
  { value: "scheduler", label: "תזמונים" },
  { value: "onboarding", label: "קליטת לקוחות" },
];

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fireRun(taskId: string) {
  // run-agent-task can take minutes; don't block the UI on it.
  supabase.functions
    .invoke("run-agent-task", { body: { task_id: taskId } })
    .then(({ error }) => {
      if (error) toast.error(`הריצה נכשלה: ${error.message}`);
    })
    .catch((e) => toast.error(`הריצה נכשלה: ${e?.message ?? e}`));
}

export function AgentTaskEditor({
  tenantId,
  taskId,
  templateKey,
  defaultRecurring,
  onDone,
}: {
  tenantId: string | null;
  taskId: string | null;
  templateKey?: string | null;
  defaultRecurring?: boolean;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { data: agents = [] } = useTenantAgents(tenantId);
  const carmen = agents.find((a) => /carmen|כרמן/i.test(a.name));

  const { data: task, isLoading } = useQuery({
    queryKey: ["carmen-agent-task", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const full = await supabase
        .from("agent_tasks")
        .select("*")
        .eq("id", taskId!)
        .maybeSingle();
      if (full.error) throw full.error;
      return full.data;
    },
  });

  const template = TASK_TEMPLATES.find((t) => t.key === templateKey) ?? null;

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [when, setWhen] = useState<When>(
    defaultRecurring ? "recurring" : "now",
  );
  const [at, setAt] = useState("");
  const [rec, setRec] = useState<RecurringSchedule>(DEFAULT_RECURRING);
  const [agentId, setAgentId] = useState<string>("");
  const [customEngine, setCustomEngine] = useState(false);
  const [engine, setEngine] = useState<string>("");
  const [mode, setMode] = useState("none");
  const [enabled, setEnabled] = useState(true);

  // Initialise from the existing task or the chosen template.
  useEffect(() => {
    if (task) {
      setTitle(task.title ?? "");
      setPrompt(task.description ?? "");
      const type = String(task.schedule_type ?? "once");
      if (["recurring", "daily", "weekly"].includes(type)) {
        setWhen("recurring");
        setRec(
          scheduleFromCron(
            task.cron_expression ||
              (type === "daily"
                ? "0 9 * * *"
                : type === "weekly"
                  ? "0 9 * * 0"
                  : null),
          ),
        );
      } else if (task.scheduled_at) {
        setWhen("at");
        setAt(toLocalInput(task.scheduled_at));
      } else setWhen("now");
      setAgentId(task.agent_id ?? "");
      setCustomEngine(Boolean(task.engine_model));
      setEngine(task.engine_model ?? "");
      setMode(
        task.task_mode && MODES.some((m) => m.value === task.task_mode)
          ? task.task_mode
          : "none",
      );
      setEnabled(task.enabled !== false);
    } else if (template) {
      setTitle(template.title);
      setPrompt(template.prompt);
      setWhen("recurring");
      setRec(scheduleFromCron(template.cron));
      setMode(template.mode ?? "none");
    }
  }, [task, template]);

  useEffect(() => {
    if (!agentId && carmen) setAgentId(carmen.id);
  }, [agentId, carmen]);

  const cron = when === "recurring" ? buildCron(rec) : null;
  const cronOk = cron ? isUsableCron(cron) : true;
  const nextRun = useMemo(
    () => (cron && cronOk ? computeNextRun(cron, new Date()) : null),
    [cron, cronOk],
  );
  const isNew = !taskId;

  const save = useMutation({
    mutationFn: async (opts: { runNow?: boolean } = {}) => {
      if (!tenantId) throw new Error("אין ארגון פעיל");
      if (!title.trim()) throw new Error("חסרה כותרת");
      if (!agentId) throw new Error("בחרו מי מבצע את המשימה");
      if (when === "recurring" && !cronOk)
        throw new Error("תזמון לא תקין (או מהיר מדי)");
      if (when === "at" && !at) throw new Error("בחרו מועד");

      const payload: AgentTaskPayload = {
        title: title.trim(),
        description: prompt.trim() || null,
        agent_id: agentId,
        engine_model: customEngine && engine ? engine : null,
        // Keep internal modes (e.g. "background") that the picker doesn't show.
        task_mode:
          mode !== "none"
            ? mode
            : task?.task_mode && !MODES.some((m) => m.value === task.task_mode)
              ? task.task_mode
              : null,
        enabled,
        timezone: DEFAULT_TASK_TIMEZONE,
      };
      if (when === "recurring") {
        Object.assign(payload, {
          schedule_type: "recurring",
          cron_expression: cron,
          // Re-enabling or editing always schedules from now: nothing old is replayed.
          next_run: enabled ? nextRun : null,
          scheduled_at: null,
          status: task?.status === "running" ? "running" : "pending",
        });
      } else {
        Object.assign(payload, {
          schedule_type: "once",
          cron_expression: null,
          next_run: null,
          // "now" runs immediately from the UI; scheduled_at stays empty so
          // the dispatcher doesn't fire it a second time.
          scheduled_at: when === "at" ? new Date(at).toISOString() : null,
        });
        // Only a new task or a newly scheduled time starts a fresh run. Editing
        // the title or prompt of a finished task must not re-queue it (that
        // could resend an old WhatsApp reminder).
        // The picker has minute precision, so compare whole minutes.
        const minute = (v: string) => Math.floor(new Date(v).getTime() / 60000);
        const rescheduled =
          when === "at" &&
          (task?.schedule_type !== "once" ||
            !task?.scheduled_at ||
            minute(task.scheduled_at) !== minute(at));
        if (isNew || (rescheduled && task?.status !== "running")) {
          Object.assign(payload, { status: "pending", last_run: null });
        }
      }

      let id = taskId;
      if (!taskId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("agent_tasks")
          .insert({
            ...payload,
            tenant_id: tenantId,
            created_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await supabase
          .from("agent_tasks")
          .update(payload)
          .eq("id", taskId);
        if (error) throw error;
      }
      if (id && enabled && (opts.runNow || (isNew && when === "now"))) {
        if (when === "recurring" || !isNew) {
          await supabase
            .from("agent_tasks")
            .update(
              when === "recurring"
                ? {
                    status: "pending",
                    run_count: 0,
                    result: freshOccurrenceResult(asJsonObject(task?.result)),
                  }
                : { status: "pending" },
            )
            .eq("id", id);
        }
        fireRun(id);
      }
      return id;
    },
    onSuccess: (_id, opts) => {
      qc.invalidateQueries({ queryKey: carmenTasksKey(tenantId) });
      qc.invalidateQueries({ queryKey: ["carmen-agent-task", taskId] });
      toast.success(
        opts?.runNow || (isNew && when === "now")
          ? "נשמר והופעל"
          : isNew
            ? "המשימה נוצרה"
            : "נשמר",
      );
      onDone();
    },
    onError: (e) => toast.error(e?.message ?? String(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("agent_tasks")
        .delete()
        .eq("id", taskId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: carmenTasksKey(tenantId) });
      toast.success("המשימה נמחקה");
      onDone();
    },
    onError: (e) => toast.error(e?.message ?? String(e)),
  });

  if (taskId && isLoading)
    return <p className="text-sm text-muted-foreground">טוען…</p>;
  if (taskId && !task)
    return <p className="text-sm text-muted-foreground">המשימה לא נמצאה.</p>;

  const result = asJsonObject(task?.result);
  const lastOutput = result?.final_output ?? result?.last_output ?? null;
  const lastError = result?.last_error ?? result?.error ?? null;

  const setPreset = (preset: RecurringPreset) =>
    setRec((r) => ({
      ...r,
      preset,
      cron: preset === "custom" ? buildCron(r) : r.cron,
    }));

  return (
    <div className="space-y-4" dir="rtl">
      {isNew && !template && (
        <div className="flex flex-wrap gap-1.5">
          <span className="w-full text-xs text-muted-foreground">
            התחלה מהירה:
          </span>
          {TASK_TEMPLATES.map((t) => (
            <Button
              key={t.key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTitle(t.title);
                setPrompt(t.prompt);
                setWhen("recurring");
                setRec(scheduleFromCron(t.cron));
                setMode(t.mode ?? "none");
              }}
            >
              {t.title}
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="task-title">כותרת</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="למשל: בדיקת דופק בוקר"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-prompt">מה לעשות (ההנחיה לסוכן)</Label>
        <Textarea
          id="task-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="תארו את המשימה כמו שהייתם מבקשים מכרמן בצ׳אט"
        />
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <Label>מתי</Label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["now", "עכשיו (פעם אחת)"],
              ["at", "במועד מסוים"],
              ["recurring", "חוזרת"],
            ] as [When, string][]
          ).map(([v, label]) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={when === v ? "default" : "outline"}
              onClick={() => setWhen(v)}
            >
              {label}
            </Button>
          ))}
        </div>

        {when === "at" && (
          <Input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            className="w-full sm:w-64"
          />
        )}

        {when === "recurring" && (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={rec.preset}
                onValueChange={(v) => setPreset(v as RecurringPreset)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[120]">
                  {(Object.keys(PRESET_LABELS) as RecurringPreset[]).map(
                    (p) => (
                      <SelectItem key={p} value={p}>
                        {PRESET_LABELS[p]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>

              {["daily", "weekdays", "weekly", "monthly"].includes(
                rec.preset,
              ) && (
                <Input
                  type="time"
                  value={rec.time}
                  onChange={(e) => setRec({ ...rec, time: e.target.value })}
                />
              )}
              {rec.preset === "every_minutes" && (
                <Select
                  value={String(rec.everyMinutes)}
                  onValueChange={(v) =>
                    setRec({ ...rec, everyMinutes: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    {[5, 10, 15, 20, 30].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        כל {n} דקות
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {rec.preset === "every_hours" && (
                <Select
                  value={String(rec.everyHours)}
                  onValueChange={(v) =>
                    setRec({ ...rec, everyHours: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        כל {n} שעות
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {rec.preset === "weekly" && (
                <Select
                  value={String(rec.weekday)}
                  onValueChange={(v) => setRec({ ...rec, weekday: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    {WEEKDAY_LABELS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        יום {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {rec.preset === "monthly" && (
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={rec.monthDay}
                  onChange={(e) =>
                    setRec({ ...rec, monthDay: Number(e.target.value) })
                  }
                />
              )}
              {rec.preset === "custom" && (
                <Input
                  dir="ltr"
                  value={rec.cron}
                  onChange={(e) => setRec({ ...rec, cron: e.target.value })}
                  placeholder="0 9 * * 0-4"
                  className="font-mono"
                />
              )}
            </div>
            <p
              className={`text-xs ${cronOk ? "text-muted-foreground" : "text-destructive"}`}
            >
              {cronOk && cron
                ? `${describeCronHe(cron)} · שעון ישראל · הריצה הבאה: ${fmt(nextRun)}`
                : "תזמון לא תקין או תכוף מדי (מינימום כל 5 דקות)"}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <Label>מי מבצע</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger>
              <SelectValue placeholder="בחרו סוכן" />
            </SelectTrigger>
            <SelectContent className="z-[120]">
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[120]">
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  מומחיות: {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">מנוע מיוחד למשימה הזו</span>
          <Switch checked={customEngine} onCheckedChange={setCustomEngine} />
        </div>
        {customEngine ? (
          <BrainSelector value={engine} onChange={setEngine} />
        ) : (
          <p className="text-xs text-muted-foreground">
            המשימה תרוץ על המנוע של הסוכן שנבחר.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">פעילה</p>
          <p className="text-xs text-muted-foreground">
            משימה מושהית לא רצה עד שמפעילים אותה שוב (בלי השלמת ריצות שפוספסו).
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {task && (
        <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs">
          <p>
            ריצה אחרונה: {fmt(task.last_run)} · ריצה הבאה:{" "}
            {fmt(
              task.next_run ??
                (task.status === "pending" ? task.scheduled_at : null),
            )}
          </p>
          {lastError && (
            <p className="text-destructive">
              שגיאה אחרונה: {String(lastError).slice(0, 300)}
            </p>
          )}
          {lastOutput && (
            <details>
              <summary className="cursor-pointer">תוצאה אחרונה</summary>
              <p className="mt-1 whitespace-pre-wrap">
                {String(lastOutput).slice(0, 2000)}
              </p>
            </details>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save.mutate({})} disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isNew ? (when === "now" ? "צור והפעל" : "צור משימה") : "שמור"}
        </Button>
        {!isNew && (
          <Button
            variant="outline"
            onClick={() => save.mutate({ runNow: true })}
            disabled={save.isPending || !enabled}
          >
            <Play className="h-4 w-4" /> שמור והרץ עכשיו
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
        {!isNew && (
          <Button
            variant="ghost"
            className="ms-auto text-destructive"
            onClick={() => {
              if (window.confirm("למחוק את המשימה?")) remove.mutate();
            }}
            disabled={remove.isPending}
          >
            <Trash2 className="h-4 w-4" /> מחיקה
          </Button>
        )}
      </div>
    </div>
  );
}
