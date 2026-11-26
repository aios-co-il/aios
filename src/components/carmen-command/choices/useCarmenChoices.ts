import { useCallback, useEffect, useMemo } from "react";
import {
  skipToken,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type ChoiceWrite,
  carmenChoicesKey,
  loadCarmenChoices,
  rememberChoices,
  shownChoices,
  storedRow,
} from "./carmenChoiceQueries";
import {
  CARMEN_CHOICES_MUTATION_KEY,
  reportSaveError,
  rereadChoices,
  showBrainOnceStored,
  showVoiceAtOnce,
  storeChoice,
} from "./carmenChoiceWrites";
import { useChoiceScope } from "./useChoiceScope";

/** Called when the pick reached the row. */
interface SaveOptions {
  onSuccess?: () => void;
}

/**
 * The brain and voice the signed-in user picked for Carmen in the org, read
 * from their carmen_user_choices row, and the writes that change them. One row
 * serves every device, so a pick made elsewhere arrives here too.
 */
export function useCarmenChoices(tenantId: string | null) {
  const { scope, sessionOnly } = useChoiceScope(tenantId);
  const queryClient = useQueryClient();
  const row = storedRow(scope);

  const query = useQuery({
    queryKey: carmenChoicesKey(scope),
    queryFn: row
      ? () => loadCarmenChoices(row.tenantId, row.userId)
      : skipToken,
    // Each open and each return to the tab reads the row again, so a pick made
    // on another device while Realtime was disconnected still arrives.
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    // A failed read falls back to the cache at once: the chat waits for
    // `ready` before it opens on a brain.
    retry: false,
  });
  const { data } = query;
  useEffect(() => rememberChoices(scope, data), [scope, data]);

  // Each write carries the org and user it started in, so a write that ends
  // after an org switch updates that org's picks, not the new one's.
  const { mutate } = useMutation({
    mutationKey: CARMEN_CHOICES_MUTATION_KEY,
    // One write at a time, so the row keeps the pick that was made last.
    scope: { id: "carmen-choices" },
    mutationFn: storeChoice,
    onMutate: (write: ChoiceWrite) => showVoiceAtOnce(queryClient, write),
    onSuccess: (_data, write) => showBrainOnceStored(queryClient, write),
    onError: reportSaveError,
    onSettled: (_data, _error, write) =>
      rereadChoices(queryClient, write.scope, 1),
  });
  const writesInFlight = useIsMutating({
    mutationKey: CARMEN_CHOICES_MUTATION_KEY,
  });
  const saveBrain = useCallback(
    (slug: string | null) => mutate({ scope, patch: { brain_slug: slug } }),
    [mutate, scope],
  );
  const saveVoice = useCallback(
    (voice: string | null, options?: SaveOptions) =>
      mutate({ scope, patch: { voice } }, options),
    [mutate, scope],
  );

  const picks = useMemo(() => shownChoices(scope, data), [scope, data]);
  const ready = sessionOnly || query.isFetchedAfterMount;
  return {
    /** The brain the row holds; a pick still on its way to the row is not here yet. */
    brainSlug: picks.brainSlug,
    voice: picks.voice,
    /** The server answered or failed, so the picks are as good as they will get. */
    ready,
    /** No write or read of the picks is under way: they show what the row holds. */
    settled: ready && writesInFlight === 0 && !query.isFetching,
    /** The picks came from the server, not from the cache or an unconfirmed write. */
    answered: picks.answered,
    saveBrain,
    saveVoice,
  };
}
