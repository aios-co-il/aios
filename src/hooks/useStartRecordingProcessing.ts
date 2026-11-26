import { useToast } from "@/hooks/use-toast";
import { invokeEdgeFunction } from "@/lib/edgeFunctionInvoke";

/**
 * Returns a callback that starts processing for freshly uploaded recordings,
 * then calls `onStarted` (to refetch the list so "processing" shows) and
 * warns when a recording's processing could not start.
 */
export function useStartRecordingProcessing(
  onStarted: () => void,
): (recordingIds: Array<string>) => Promise<void> {
  const { toast } = useToast();

  return async (recordingIds) => {
    if (recordingIds.length === 0) {
      return;
    }
    const failed = await startRecordingProcessing(recordingIds);
    onStarted();
    if (failed > 0) {
      toast({
        title: "התמלול האוטומטי לא התחיל",
        description: "ההקלטה נשמרה. אפשר להפעיל תמלול ידנית מכרטיס ההקלטה.",
        variant: "destructive",
      });
    }
  };
}

/**
 * Starts transcription and summary for freshly uploaded recordings through the
 * same ingest pipeline extension recordings use. Returns how many failed to
 * start; the uploads themselves are already saved either way.
 */
export async function startRecordingProcessing(
  recordingIds: Array<string>,
): Promise<number> {
  const results = await Promise.allSettled(
    recordingIds.map((recordingId) =>
      invokeEdgeFunction("ingest-extension-recording", {
        recording_id: recordingId,
      }),
    ),
  );

  const failures = results.filter((result) => result.status === "rejected");
  for (const failure of failures) {
    console.error("[startRecordingProcessing]", failure.reason);
  }
  return failures.length;
}
