import { useMutation, useQueryClient } from "@tanstack/react-query";
import { carmenFindingsKey } from "@/lib/carmenFindings";

/** A write that changes the tenant's Carmen findings; every findings query refetches once it settles. */
export function useCarmenFindingsMutation<Variables, Result>(
  tenantId: string | null,
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () =>
      qc.invalidateQueries({ queryKey: carmenFindingsKey(tenantId) }),
  });
}
