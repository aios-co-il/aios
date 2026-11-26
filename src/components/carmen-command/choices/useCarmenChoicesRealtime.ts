import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storedRow } from "./carmenChoiceQueries";
import { rereadChoices } from "./carmenChoiceWrites";
import { useChoiceScope } from "./useChoiceScope";

/**
 * Follows the user's stored picks live: a pick made in another tab or on
 * another device re-reads them here. Mount once per sidecar.
 */
export function useCarmenChoicesRealtime(tenantId: string | null) {
  const { scope } = useChoiceScope(tenantId);
  const queryClient = useQueryClient();
  // Two sidecars can be mounted at once, and one channel name is one channel:
  // a shared name would let the first sidecar to close end the other's feed.
  const [instanceId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const row = storedRow(scope);
    if (!row) {
      return;
    }

    /** Reads the row again, unless a write of our own will do so when it ends. */
    function reread() {
      rereadChoices(queryClient, scope);
    }

    const channel = supabase
      .channel(`carmen-choices-${row.userId}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "carmen_user_choices",
          filter: `user_id=eq.${row.userId}`,
        },
        reread,
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          // A pick stored while the feed was connecting or away was not sent.
          reread();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "[useCarmenChoicesRealtime] feed is down",
            status,
            error,
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [scope, instanceId, queryClient]);
}
