import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function CreateAgentDialog({
  tenantId,
  open,
  onOpenChange,
  onCreated,
}: {
  tenantId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newTalent, setNewTalent] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("missing tenant");
      const { data, error } = await supabase
        .from("ai_agents")
        .insert({
          tenant_id: tenantId,
          name: newName,
          talent: newTalent,
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
      onCreated(data.id);
      setNewName("");
      setNewTalent("");
      onOpenChange(false);
      toast.success("סוכן נוצר");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>סוכן חדש</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>שם</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="לדוגמה: סוכן מכירות"
            />
          </div>
          <div>
            <Label>טלנט / מומחיות</Label>
            <Input
              value={newTalent}
              onChange={(e) => setNewTalent(e.target.value)}
              placeholder="מה הסוכן עושה?"
            />
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={!newName || create.isPending}
            className="w-full"
          >
            {create.isPending ? "יוצר..." : "צור סוכן"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
