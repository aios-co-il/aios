import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LeadCellEditor } from "@/components/LeadsPage/LeadCellEditor";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizeLeadNotes, patchLeadNotesInCache } from "@/lib/leadNotes";

export function LeadNotesCell({
  leadId,
  notes,
}: {
  leadId: string;
  notes: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const saveNotes = useMutation({
    mutationFn: async (next: string | null) => {
      const { error } = await supabase
        .from("leads")
        .update({ notes: next })
        .eq("id", leadId);
      if (error) {
        throw error;
      }
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueriesData({ queryKey: ["leads-table"] }, (old) =>
        patchLeadNotesInCache(old, leadId, next),
      );
      queryClient.setQueriesData({ queryKey: ["leads-kanban"] }, (old) =>
        patchLeadNotesInCache(old, leadId, next),
      );
      setEditing(false);
    },
    onError: (error: Error) => {
      toast({
        title: "לא ניתן לשמור הערות",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  /** Saves the typed notes, or just closes the field when nothing changed. */
  function commit(draft: string) {
    const next = normalizeLeadNotes(draft);
    if (next === normalizeLeadNotes(notes ?? "")) {
      setEditing(false);
      return;
    }
    saveNotes.mutate(next);
  }

  if (!editing) {
    const text = notes?.trim();
    return (
      <button
        type="button"
        className="block w-full truncate text-right hover:text-primary"
        title={text || "עריכת הערות"}
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
      >
        {text ? text : <span className="text-muted-foreground">הוסף הערה</span>}
      </button>
    );
  }

  return (
    <LeadCellEditor
      kind="textarea"
      initialValue={notes ?? ""}
      disabled={saveNotes.isPending}
      onCommit={commit}
      onCancel={() => setEditing(false)}
    />
  );
}
