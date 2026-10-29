import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  approvalEndpoint,
  approvalOutcome,
  approvalRequestBody,
  type ApprovalDecision,
  type ApprovalRowRef,
  type DecisionResponse,
} from "./approvalDecision";

/**
 * Approve or reject one approvals-screen row on the server and toast the real
 * outcome (AIO-230): the browser never flips the row's status itself.
 */
export function useApprovalDecision(item: ApprovalRowRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (decision: ApprovalDecision) => {
      const { data, error } = await supabase.functions.invoke<DecisionResponse>(
        approvalEndpoint(item),
        { body: approvalRequestBody(item, decision) },
      );
      const outcome = approvalOutcome(
        decision,
        error ? await functionErrorBody(error) : data,
      );
      if (!outcome.ok) {
        throw new Error(outcome.message);
      }

      return outcome.message;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["agent-approvals"] });
      qc.invalidateQueries({ queryKey: ["agent-approvals-global"] });
    },
    onSuccess: (message) => toast.success(message),
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Body of a non-2xx edge-function response, so the real reason reaches the user. */
async function functionErrorBody(error: Error): Promise<DecisionResponse> {
  if (
    error instanceof FunctionsHttpError &&
    error.context instanceof Response
  ) {
    const body: DecisionResponse | null = await error.context
      .json()
      .catch(() => null);
    if (body) {
      return body;
    }
  }

  return { error: error.message };
}
