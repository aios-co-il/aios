import { useMutation, useQueryClient } from "@tanstack/react-query";
import { waitForRecordingSummary } from "@/lib/waitForRecordingSummary";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  pickTranscriptRow,
  resolveSummaryTarget,
} from "@/lib/recordingSummaryTarget";

interface UseRegenerateRecordingSummaryOptions {
  tenantId: string;
  /** Every row of the meeting — grouped Zoom files must stay in sync. */
  recordingIds: string[];
  onRegenerated?: (summaryMd: string) => void;
}

/**
 * Re-runs `summarize-recording` over the stored transcript so an old, thin
 * summary is replaced by one produced with the current summary method.
 */
export function useRegenerateRecordingSummary({
  tenantId,
  recordingIds,
  onRegenerated,
}: UseRegenerateRecordingSummaryOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: rows, error: rowsError } = await supabase
        .from("zoom_recordings")
        .select(
          "id, transcription, client_id, lead_id, campaigner_ids, agency_id, summary_scope",
        )
        .in("id", recordingIds);
      if (rowsError) throw rowsError;

      const sourceRow = pickTranscriptRow(rows ?? []);
      if (!sourceRow?.transcription?.trim()) {
        throw new Error("אין תמלול להקלטה הזו — צריך לתמלל אותה קודם");
      }

      let target = resolveSummaryTarget(sourceRow);
      if (!target) {
        const { data: agency } = await supabase
          .from("agencies")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        target = resolveSummaryTarget(sourceRow, agency?.id ?? null);
      }
      if (!target) {
        throw new Error(
          "אין יעד לשיוך הסיכום — שייך את ההקלטה ללקוח, ליד, איש צוות או סוכנות",
        );
      }

      const requestedAt = new Date();
      const { data, error } = await supabase.functions.invoke(
        "summarize-recording",
        {
          body: {
            recording_id: sourceRow.id,
            transcript: sourceRow.transcription,
            focus_points: [],
            custom_focus: "",
            target_type: target.target_type,
            target_id: target.target_id,
            tenant_id: tenantId,
          },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.pending && data.channel !== "model") {
        return null;
      }
      // The model writes long summaries in the background (AIO-581); wait for
      // the row instead of the HTTP reply.
      const saved = data?.pending
        ? await waitForRecordingSummary(sourceRow.id, requestedAt)
        : data?.summary
          ? { summary: data.summary as string, fileUrl: data.file_url ?? null }
          : null;
      if (!saved) {
        throw new Error(
          data?.pending
            ? "הסיכום עדיין נכתב. הוא יופיע על ההקלטה בעוד כמה דקות."
            : "לא התקבל סיכום חדש",
        );
      }

      // The edge function writes onto the row it was given; the other rows of
      // the same meeting are updated here so every card shows the new summary.
      const siblingIds = recordingIds.filter((id) => id !== sourceRow.id);
      if (siblingIds.length > 0) {
        await supabase
          .from("zoom_recordings")
          .update({
            summary_md: saved.summary,
            summary_file_url: saved.fileUrl,
          })
          .in("id", siblingIds);
      }

      return saved.summary;
    },
    onSuccess: (summaryMd) => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
      queryClient.invalidateQueries({ queryKey: ["client-recordings"] });
      if (!summaryMd) {
        toast.success("הסיכום נשלח לקרסר ישיר. הוא יישמר על ההקלטה כשיחזור.");
        return;
      }
      onRegenerated?.(summaryMd);
      toast.success("נוצר סיכום מפורט מחדש מהתמלול");
    },
    onError: (err: Error) => {
      toast.error(err.message || "שגיאה ביצירת סיכום מחדש");
    },
  });
}
