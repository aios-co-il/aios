import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentEditor } from "@/components/agents/AgentEditor";

export function isCarmenName(name?: string | null) {
  const n = (name || "").toLowerCase();
  return n.includes("carmen") || (name || "").includes("כרמן");
}

/** Sub-agents that work under Carmen — list, create, and edit in place. */
export function CarmenSubAgents({
  tenantId,
  agentId,
  onNavigate,
  onManageKeys,
}: {
  tenantId: string | null;
  agentId: string | null;
  onNavigate: (path: string) => void;
  onManageKeys: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [talent, setTalent] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["ai-agents", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("אין ארגון פעיל");
      const { data, error } = await supabase
        .from("ai_agents")
        .insert({
          tenant_id: tenantId,
          name: name.trim(),
          talent: talent.trim(),
          engine: "gemini-3-flash",
          active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-agents", tenantId] });
      setName("");
      setTalent("");
      setCreating(false);
      toast.success("הסוכן נוצר");
      onNavigate(`settings/agents/${data.id}`);
    },
    onError: (e) => toast.error(e?.message ?? String(e)),
  });

  if (agentId) {
    const agent = agents.find((a) => a.id === agentId);
    if (isLoading)
      return <p className="text-sm text-muted-foreground">טוען…</p>;
    if (!agent)
      return <p className="text-sm text-muted-foreground">הסוכן לא נמצא.</p>;
    return (
      <div className="-mx-4 -mt-4 flex min-h-[70vh] flex-col">
        <AgentEditor
          key={agent.id}
          agent={agent}
          embedded
          onManageKeys={onManageKeys}
        />
      </div>
    );
  }

  const subAgents = agents.filter((a) => !isCarmenName(a.name));

  return (
    <div className="space-y-3" dir="rtl">
      <p className="text-sm text-muted-foreground">
        הסוכנים שעובדים תחת כרמן. כרמן מאצילה להם משימות; כל אחד עם מוח, כלים
        וידע משלו.
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">טוען…</p>}
      <ul className="space-y-1.5">
        {subAgents.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onNavigate(`settings/agents/${a.id}`)}
              className="flex w-full items-center gap-3 rounded-lg border p-3 text-right hover:bg-muted"
            >
              <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                {a.talent && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.talent}
                  </span>
                )}
              </span>
              {a.active === false ? (
                <Badge variant="secondary">כבוי</Badge>
              ) : (
                <Badge variant="outline">{a.engine}</Badge>
              )}
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      {!isLoading && subAgents.length === 0 && (
        <p className="text-sm text-muted-foreground">אין עדיין סוכני משנה.</p>
      )}
      {creating ? (
        <div className="space-y-2 rounded-lg border p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם הסוכן"
          />
          <Input
            value={talent}
            onChange={(e) => setTalent(e.target.value)}
            placeholder="מה הוא עושה? (למשל: קופירייטר מודעות)"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => create.mutate()}
              disabled={!name.trim() || create.isPending}
            >
              צור סוכן
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCreating(false)}
            >
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> סוכן חדש
        </Button>
      )}
    </div>
  );
}
