import { useMutation } from "@tanstack/react-query";
import type { ReportInsightResponse } from "@functions/carmen-report-insight/types.ts";
import { supabase } from "@/integrations/supabase/client";
import type { ReportData } from "./data/reportData";
import { reportInsightRequestOf } from "./data/reportInsightRequest";

/** Asks Carmen for a read of the report's figures; runs only on demand. */
export function useCarmenInsight() {
  return useMutation({
    mutationFn: async (data: ReportData): Promise<string> => {
      const { data: reply, error } =
        await supabase.functions.invoke<ReportInsightResponse>(
          "carmen-report-insight",
          { body: reportInsightRequestOf(data) },
        );
      if (error) {
        throw error;
      }
      if (!reply?.insight) {
        throw new Error("Carmen returned no insight");
      }
      return reply.insight;
    },
    onError: (error) => console.error("carmen-report-insight failed", error),
  });
}
