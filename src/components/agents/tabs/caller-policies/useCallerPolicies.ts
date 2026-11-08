import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { skipToken } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  callerPolicyRow,
  type CallerKind,
  type CallerPolicy,
  type CallerPolicyRow,
} from "../../../../../supabase/functions/_shared/carmen/caller-policy/policy.ts";

const policiesKey = (tenantId: string | null) => [
  "carmen-caller-policies",
  tenantId,
];

/**
 * The org's stored caller policies (carmen_caller_policies, AIO-511). RLS lets members read and
 * owners write; a kind with no row uses the defaults.
 */
export function useCallerPolicies(tenantId: string | null) {
  return useQuery({
    queryKey: policiesKey(tenantId),
    queryFn: tenantId ? () => loadCallerPolicies(tenantId) : skipToken,
  });
}

/** Saves one caller kind's policy for the org; a refused write is the mutation's error. */
export function useSaveCallerPolicy(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kind,
      policy,
    }: {
      kind: CallerKind;
      policy: CallerPolicy;
    }) => {
      if (!tenantId) {
        throw new Error("לא נבחר ארגון");
      }
      const { error } = await supabase
        .from("carmen_caller_policies")
        .upsert(callerPolicyRow(tenantId, kind, policy), {
          onConflict: "tenant_id,caller_kind",
        });
      if (error) {
        throw error;
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: policiesKey(tenantId) }),
  });
}

/** Reads the org's policy rows. */
async function loadCallerPolicies(
  tenantId: string,
): Promise<Array<CallerPolicyRow>> {
  const { data, error } = await supabase
    .from("carmen_caller_policies")
    .select(
      "caller_kind, instructions, allowed_topics, forbidden_topics, may_take_message, may_book_meeting",
    )
    .eq("tenant_id", tenantId);
  if (error) {
    throw error;
  }
  return data ?? [];
}
