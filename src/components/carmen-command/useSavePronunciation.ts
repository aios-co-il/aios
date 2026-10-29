import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Correction = { term: string; spoken: string };

/**
 * Saves a pronunciation the user taught Carmen in a live voice call to the org's dictionary
 * (carmen_pronunciations, written as the user under RLS). The returned function resolves to
 * the line handed back to the voice model, so a failure is said aloud instead of thrown.
 */
export function useSavePronunciation(
  tenantId: string | null,
): (term: string, spoken: string) => Promise<string> {
  const { mutateAsync } = useMutation({
    mutationFn: async ({ term, spoken }: Correction) => {
      if (!tenantId) {
        throw new Error("no tenant");
      }
      const { error } = await supabase
        .from("carmen_pronunciations")
        .upsert(
          { tenant_id: tenantId, term: term.trim(), spoken: spoken.trim() },
          { onConflict: "tenant_id,term_key" },
        );
      if (error) {
        throw error;
      }
    },
  });
  return useCallback(
    async (term: string, spoken: string) => {
      if (!term.trim() || !spoken.trim()) {
        return "חסרה המילה או ההגייה, לא נשמר.";
      }
      try {
        await mutateAsync({ term, spoken });
        return `נשמר: ${term.trim()} נהגה ${spoken.trim()}.`;
      } catch (e) {
        console.error("[realtime] save_pronunciation failed", e);
        return "לא הצלחתי לשמור את ההגייה כרגע.";
      }
    },
    [mutateAsync],
  );
}
