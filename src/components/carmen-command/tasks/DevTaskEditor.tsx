import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, devTaskAction, type DevTask } from "@/lib/devTasks";
import { carmenTasksKey } from "../useCarmenTasks";

async function token() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("לא מחובר");
  return session.access_token;
}

const AGENTS = [
  { value: "cursor", label: "Cursor" },
  { value: "claude", label: "Claude" },
];

export function DevTaskEditor({
  tenantId,
  devTaskId,
  onDone,
}: {
  tenantId: string | null;
  devTaskId: string | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const isNew = !devTaskId;
  const { data, isLoading } = useQuery({
    queryKey: ["carmen-dev-task", devTaskId],
    enabled: !!devTaskId && !!tenantId,
    queryFn: async () =>
      (await devTaskAction(await token(), {
        action: "get",
        tenant_id: tenantId,
        id: devTaskId,
      })) as {
        task: DevTask | null;
        events: { id: string; event_type: string; created_at: string }[];
      },
  });

  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [expected, setExpected] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [agent, setAgent] = useState("cursor");
  const [priority, setPriority] = useState("normal");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: carmenTasksKey(tenantId) });
    qc.invalidateQueries({ queryKey: ["carmen-dev-task", devTaskId] });
    qc.invalidateQueries({ queryKey: ["dev-tasks", tenantId] });
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("חסרה כותרת");
      return devTaskAction(await token(), {
        action: "create",
        tenant_id: tenantId,
        priority,
        assigned_agent: agent,
        brief: {
          title: title.trim(),
          problem: problem || undefined,
          expected_behavior: expected || undefined,
          acceptance_criteria: acceptance || undefined,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("משימת הפיתוח נוצרה כטיוטה — אשרו כדי לשלוח");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? String(e)),
  });

  const act = useMutation({
    mutationFn: async (action: string) =>
      devTaskAction(await token(), {
        action,
        tenant_id: tenantId,
        id: devTaskId,
      }),
    onSuccess: () => {
      invalidate();
      toast.success("עודכן");
    },
    onError: (e: any) => toast.error(e?.message ?? String(e)),
  });

  if (!isNew) {
    if (isLoading)
      return <p className="text-sm text-muted-foreground">טוען…</p>;
    const t = data?.task;
    if (!t)
      return <p className="text-sm text-muted-foreground">המשימה לא נמצאה.</p>;
    const open = !["done", "cancelled"].includes(t.status);
    return (
      <div className="space-y-3 text-sm" dir="rtl">
        <p className="text-base font-medium">{t.title}</p>
        <p className="text-xs text-muted-foreground">
          {STATUS_LABELS[t.status] ?? t.status} · {t.assigned_agent} · עדיפות{" "}
          {t.priority}
        </p>
        {[
          ["הבעיה", t.problem],
          ["מה צריך לקרות", t.expected_behavior],
          ["מה קורה היום", t.current_behavior],
          ["קריטריוני קבלה", t.acceptance_criteria],
          ["שגיאת שליחה", t.dispatch_error],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k as string}>
              <p className="text-xs font-medium text-muted-foreground">{k}</p>
              <p className="whitespace-pre-wrap">{v}</p>
            </div>
          ))}
        <div className="flex flex-wrap gap-2">
          {t.pr_url && (
            <Button asChild variant="outline" size="sm">
              <a href={t.pr_url} target="_blank" rel="noopener noreferrer">
                PR <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          {t.cursor_session_url && (
            <Button asChild variant="outline" size="sm">
              <a
                href={t.cursor_session_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                סשן <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            {t.status === "draft" && (
              <Button
                size="sm"
                onClick={() => act.mutate("approve")}
                disabled={act.isPending}
              >
                אישור
              </Button>
            )}
            {t.status === "approved" && (
              <Button
                size="sm"
                onClick={() => act.mutate("dispatch")}
                disabled={act.isPending}
              >
                שליחה ל-
                {t.assigned_agent === "cursor" ? "Cursor" : t.assigned_agent}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => act.mutate("mark_done")}
              disabled={act.isPending}
            >
              סימון כהושלם
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => act.mutate("cancel")}
              disabled={act.isPending}
            >
              ביטול המשימה
            </Button>
          </div>
        )}
        {data?.events?.length ? (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              היסטוריה
            </summary>
            <ul className="mt-1 space-y-0.5 text-xs">
              {data.events.map((e) => (
                <li key={e.id}>
                  {new Date(e.created_at).toLocaleString("he-IL")} ·{" "}
                  {e.event_type}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <Button variant="ghost" onClick={onDone}>
          חזרה
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="space-y-1.5">
        <Label htmlFor="dev-title">כותרת</Label>
        <Input
          id="dev-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dev-problem">הבעיה / הבקשה</Label>
        <Textarea
          id="dev-problem"
          rows={4}
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dev-expected">מה צריך לקרות</Label>
        <Textarea
          id="dev-expected"
          rows={3}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dev-acceptance">קריטריוני קבלה</Label>
        <Textarea
          id="dev-acceptance"
          rows={3}
          value={acceptance}
          onChange={(e) => setAcceptance(e.target.value)}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[120]">
            {AGENTS.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                סוכן פיתוח: {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[120]">
            {[
              ["urgent", "דחוף"],
              ["high", "גבוה"],
              ["normal", "רגיל"],
              ["low", "נמוך"],
            ].map(([v, l]) => (
              <SelectItem key={v} value={v}>
                עדיפות: {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        משימה חדשה נשמרת כטיוטה. שליחה לסוכן הפיתוח רק אחרי אישור.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          צור משימת פיתוח
        </Button>
        <Button variant="ghost" onClick={onDone}>
          ביטול
        </Button>
      </div>
    </div>
  );
}
