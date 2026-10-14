import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { createExecutionGoal, runGoalIteration } from "@/lib/goalExecution";
import { carmenTasksKey } from "../useCarmenTasks";

const db = supabase as any;

const STATUSES: { value: string; label: string }[] = [
  { value: "active", label: "פעיל" },
  { value: "in_progress", label: "בעבודה" },
  { value: "blocked", label: "חסום" },
  { value: "paused", label: "מושהה" },
  { value: "completed", label: "הושלם" },
  { value: "cancelled", label: "בוטל" },
];

const PRIORITIES: { value: string; label: string }[] = [
  { value: "urgent", label: "דחוף" },
  { value: "high", label: "גבוה" },
  { value: "normal", label: "רגיל" },
  { value: "low", label: "נמוך" },
];

const ENGINE_LABELS: Record<string, string> = {
  PLANNING: "מתכנן",
  EXECUTING: "מבצע",
  VERIFYING: "מאמת",
  REPLANNING: "מתכנן מחדש",
  BLOCKED: "חסום",
  COMPLETED: "הושלם",
  AWAITING_BRAIN: "ממתין למוח (Cursor)",
};

async function token() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("לא מחובר");
  return session.access_token;
}

export function GoalEditor({
  tenantId,
  goalId,
  onDone,
}: {
  tenantId: string | null;
  goalId: string | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const isNew = !goalId;
  const { data: goal, isLoading } = useQuery({
    queryKey: ["carmen-goal", goalId],
    enabled: !!goalId,
    queryFn: async () => {
      const { data, error } = await db
        .from("goals")
        .select("*")
        .eq("id", goalId)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, any> | null;
    },
  });

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [criteria, setCriteria] = useState("");
  const [status, setStatus] = useState("active");
  const [priority, setPriority] = useState("normal");
  const [autonomous, setAutonomous] = useState(true);

  useEffect(() => {
    if (!goal) return;
    setTitle(goal.title ?? "");
    setBrief(goal.objective ?? goal.description ?? "");
    setCriteria(goal.completion_criteria ?? "");
    setStatus(goal.status ?? "active");
    setPriority(goal.priority ?? "normal");
    setAutonomous(Boolean(goal.autonomous_mode));
  }, [goal]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: carmenTasksKey(tenantId) });
    qc.invalidateQueries({ queryKey: ["carmen-goal", goalId] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("אין ארגון פעיל");
      if (!title.trim()) throw new Error("חסרה כותרת");
      if (isNew) {
        const res = await createExecutionGoal(await token(), tenantId, {
          title,
          autonomous,
          description: brief || undefined,
          objective: brief || undefined,
          completion_criteria: criteria || undefined,
        });
        return res.notice ?? null;
      }
      const patch: Record<string, unknown> = {
        title: title.trim(),
        description: brief || null,
        completion_criteria: criteria || null,
        status,
        priority,
      };
      if (goal && "objective" in goal) patch.objective = brief || null;
      if (goal && "autonomous_mode" in goal) {
        patch.autonomous_mode = autonomous;
        // Turning the engine on schedules the next iteration from now.
        if (autonomous && !goal.autonomous_mode)
          patch.next_run_at = new Date().toISOString();
      }
      const { error } = await db.from("goals").update(patch).eq("id", goalId);
      if (error) throw error;
      return null;
    },
    onSuccess: (notice) => {
      invalidate();
      toast.success(
        isNew ? "היעד נוצר" : "נשמר",
        notice ? { description: notice } : undefined,
      );
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? String(e)),
  });

  const iterate = useMutation({
    mutationFn: async () => runGoalIteration(await token(), tenantId!, goalId!),
    onSuccess: () => {
      invalidate();
      toast.success("הופעלה איטרציה של מנוע היעד");
    },
    onError: (e: any) => toast.error(e?.message ?? String(e)),
  });

  if (goalId && isLoading)
    return <p className="text-sm text-muted-foreground">טוען…</p>;
  if (goalId && !goal)
    return <p className="text-sm text-muted-foreground">היעד לא נמצא.</p>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="space-y-1.5">
        <Label htmlFor="goal-title">היעד</Label>
        <Input
          id="goal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="למשל: להוריד CPL של Detailit מתחת ל-40₪"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="goal-brief">תיאור ומטרה עסקית</Label>
        <Textarea
          id="goal-brief"
          rows={4}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="goal-criteria">מתי זה נחשב הושלם</Label>
        <Textarea
          id="goal-criteria"
          rows={3}
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          placeholder="קריטריונים מדידים, שורה לכל אחד"
        />
      </div>
      {!isNew && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[120]">
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  סטטוס: {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[120]">
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  עדיפות: {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">מנוע אוטונומי</p>
          <p className="text-xs text-muted-foreground">
            כרמן מתכננת, מבצעת ומאמתת בלולאה עד שהיעד מושג. פעולות רגישות עדיין
            עוברות אישור.
          </p>
        </div>
        <Switch checked={autonomous} onCheckedChange={setAutonomous} />
      </div>

      {goal?.engine_status && (
        <div className="rounded-lg bg-muted/50 p-3 text-xs">
          מנוע: {ENGINE_LABELS[goal.engine_status] ?? goal.engine_status} ·
          איטרציות: {goal.iteration_count ?? 0}
          {goal.next_run_at && (
            <>
              {" "}
              · הבאה:{" "}
              {new Date(goal.next_run_at).toLocaleString("he-IL", {
                timeZone: "Asia/Jerusalem",
              })}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isNew ? "צור יעד" : "שמור"}
        </Button>
        {!isNew && goal?.autonomous_mode && (
          <Button
            variant="outline"
            onClick={() => iterate.mutate()}
            disabled={iterate.isPending}
          >
            <Play className="h-4 w-4" /> הרץ איטרציה עכשיו
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
      </div>
    </div>
  );
}
