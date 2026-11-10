import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CommandCenterAttachment } from "@/lib/commandCenterAttachments";

/** A message typed while Carmen was still answering; it is sent once she finishes. */
export type QueuedMessage = {
  text: string;
  attachments: Array<CommandCenterAttachment>;
};

/**
 * The chat's control over the running answer (AIO-509): each request gets a run id, the stop
 * button records a stop for it (`carmen_run_cancellations`), and run-ai-agent stops before its
 * next step and says what it already did. Messages typed meanwhile wait here in order.
 */
export function useRunControl(tenantId: string | null) {
  const runIdRef = useRef<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [queue, setQueue] = useState<Array<QueuedMessage>>([]);

  /** Starts a run and returns its id for the request. */
  const begin = useCallback(() => {
    const runId = crypto.randomUUID();
    runIdRef.current = runId;
    setStopping(false);
    return runId;
  }, []);

  /** The run finished, stopped or failed. */
  const end = useCallback(() => {
    runIdRef.current = null;
    setStopping(false);
  }, []);

  /** Asks the server to stop the current run; it stops at its next step. */
  const stop = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId || !tenantId) {
      return;
    }
    setStopping(true);
    const { error } = await supabase
      .from("carmen_run_cancellations")
      .insert({ run_id: runId, tenant_id: tenantId });
    if (error) {
      setStopping(false);
      throw error;
    }
  }, [tenantId]);

  const enqueue = useCallback((message: QueuedMessage) => {
    setQueue((prev) => [...prev, message]);
  }, []);

  /** Drops the oldest waiting message, once it is being sent. */
  const dequeue = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  return { begin, end, stop, stopping, queue, enqueue, dequeue };
}
