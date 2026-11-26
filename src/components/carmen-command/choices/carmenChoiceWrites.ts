import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  type ChoiceScope,
  type ChoiceWrite,
  type ChoicesState,
  carmenChoicesKey,
  saveCarmenChoice,
  shownChoices,
  withChoicePatch,
} from "./carmenChoiceQueries";

export const CARMEN_CHOICES_MUTATION_KEY = ["carmen-choices", "save"];

/** Sends the pick to the row; a "view as" pick stays in the session. */
export async function storeChoice({ scope, patch }: ChoiceWrite) {
  if (!scope.viewAsUserId) {
    await saveCarmenChoice(scope.tenantId, patch);
  }
}

/** A picked voice shows in the picker at once, before the row confirms it. */
export async function showVoiceAtOnce(
  queryClient: QueryClient,
  write: ChoiceWrite,
): Promise<void> {
  if ("voice" in write.patch) {
    await showPick(queryClient, write);
  }
}

/**
 * A picked brain becomes the stored pick only once the row took it, so the
 * query always holds what the row holds. The sidecar it was picked in already
 * shows it for this session; the stored pick is what moves the other chats
 * (useApplyBrainPick), and a pick the row refused must not move them.
 */
export async function showBrainOnceStored(
  queryClient: QueryClient,
  write: ChoiceWrite,
): Promise<void> {
  if ("brain_slug" in write.patch) {
    await showPick(queryClient, write);
  }
}

/**
 * Reads the row again, unless a pick write is still in flight: the last write
 * to end reads it, which also restores the server's value after a refused
 * write. A write that is ending still counts as in flight, so it passes
 * `endingWrites` 1.
 */
export function rereadChoices(
  queryClient: QueryClient,
  scope: ChoiceScope,
  endingWrites = 0,
): void {
  const writesInFlight = queryClient.isMutating({
    mutationKey: CARMEN_CHOICES_MUTATION_KEY,
  });
  if (writesInFlight > endingWrites) {
    return;
  }

  // Not awaited, so an ending write counts as over before the read answers
  // and a Realtime change that lands meanwhile triggers its own read.
  void queryClient.invalidateQueries({
    queryKey: carmenChoicesKey(scope),
    exact: true,
  });
}

/** Logs the failed write and tells the user their pick was not stored. */
export function reportSaveError(error: Error, { patch }: ChoiceWrite): void {
  console.error("[carmenChoiceWrites] the pick was not stored", error);
  toast.error(
    "voice" in patch
      ? "הקול שנבחר לא נשמר"
      : "המוח שנבחר לא נשמר, והוא יחול רק כאן",
  );
}

/** Puts one pick into the picks the app shows. */
async function showPick(
  queryClient: QueryClient,
  { scope, patch }: ChoiceWrite,
): Promise<void> {
  const queryKey = carmenChoicesKey(scope);
  // A read still in flight must not overwrite the new pick.
  await queryClient.cancelQueries({ queryKey, exact: true });

  queryClient.setQueryData<ChoicesState>(queryKey, (held) =>
    withChoicePatch(shownChoices(scope, held), patch),
  );
}
