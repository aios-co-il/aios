import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
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
  const [draft, setDraft] = useState(notes ?? "");
  const cancelRef = useRef(false);

  const saveNotes = useMutation({
    mutationFn: async (next: string | null) => {
      const { error } = await supabase
        .from("leads")
        .update({ notes: next })
        .eq("id", leadId);
      if (error) throw error;
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

  const commit = () => {
    const next = normalizeLeadNotes(draft);
    if (next === normalizeLeadNotes(notes ?? "")) {
      setEditing(false);
      return;
    }
    saveNotes.mutate(next);
  };

  if (!editing) {
    const text = notes?.trim();
    return (
      <button
        type="button"
        className="block w-full truncate text-right hover:text-primary"
        title={text || "עריכת הערות"}
        onClick={(event) => {
          event.stopPropagation();
          setDraft(notes ?? "");
          setEditing(true);
        }}
      >
        {text ? text : <span className="text-muted-foreground">הוסף הערה</span>}
      </button>
    );
  }

  return (
    <Textarea
      autoFocus
      value={draft}
      rows={3}
      dir="rtl"
      disabled={saveNotes.isPending}
      className="min-h-[72px] px-2 py-1 text-right"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelRef.current) {
          cancelRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          cancelRef.current = true;
          setDraft(notes ?? "");
          setEditing(false);
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
