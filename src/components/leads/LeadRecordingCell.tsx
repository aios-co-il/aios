import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { LeadRecordingItem } from "@/lib/leadRecordings";

export function LeadRecordingCell({
  leadId,
  tenantId,
  agencyId,
  recordings,
}: {
  leadId: string;
  tenantId: string | null;
  agencyId?: string | null;
  recordings: LeadRecordingItem[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (!tenantId) throw new Error("חסר ארגון");
      for (const [index, file] of files.entries()) {
        const ext = file.name.split(".").pop() || "bin";
        const filePath = `${tenantId}/${leadId}/${Date.now()}-${index}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("recordings")
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        const topic = file.name.replace(/\.[^.]+$/, "") || "הקלטה ידנית";
        const { error } = await supabase.from("zoom_recordings").insert({
          tenant_id: tenantId,
          lead_id: leadId,
          agency_id: agencyId || null,
          meeting_topic: topic,
          start_time: new Date().toISOString(),
          source: "manual",
          file_path: filePath,
          meeting_id: `manual_${leadId}_${Date.now()}_${index}`,
          recording_type: file.type.startsWith("audio/")
            ? "audio_only"
            : "manual",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["lead-call-recordings", tenantId],
      });
      toast({ title: "ההקלטה הועלתה" });
    },
    onError: (error: Error) => {
      toast({
        title: "לא ניתן להעלות הקלטה",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openRecording = async (item: LeadRecordingItem) => {
    if (item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!item.filePath) return;
    const { data, error } = await supabase.storage
      .from(item.bucket ?? "recordings")
      .createSignedUrl(item.filePath, 3600);
    if (error || !data?.signedUrl) {
      toast({
        title: "לא ניתן לפתוח את ההקלטה",
        description: error?.message,
        variant: "destructive",
      });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="flex min-w-0 flex-col items-start gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      {recordings.map((item) => (
        <button
          key={item.id}
          type="button"
          className="max-w-full truncate text-primary underline"
          onClick={() => openRecording(item)}
        >
          {item.label}
        </button>
      ))}
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) upload.mutate(files);
        }}
      />
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-primary"
        disabled={upload.isPending || !tenantId}
        onClick={() => inputRef.current?.click()}
      >
        {upload.isPending
          ? "מעלה..."
          : recordings.length
            ? "העלה עוד"
            : "העלה הקלטה"}
      </button>
    </div>
  );
}
