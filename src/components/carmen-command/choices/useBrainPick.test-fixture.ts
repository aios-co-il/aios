// One sidecar as the brain pick tests mount it: its brain channel and the
// chat that opens on the stored pick. The test file mocks the modules; see
// useBrainPick.test.ts.
import { act, renderHook } from "@testing-library/react";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useBrainChannel } from "../useBrainChannel";
import { resetChannel } from "../brainChannelApi.test-fixture";
import { carmenChoicesKey } from "./carmenChoiceQueries";
import { backend, resetBackend } from "./carmenChoiceQueries.test-fixture";
import { useApplyBrainPick } from "./useApplyBrainPick";

type Harness = ReturnType<typeof createTestQueryHarness>;

const TENANT = "tenant-a";

/** A user whose stored pick is the model brain, signed in on a working backend. */
export function resetSidecar(): void {
  localStorage.clear();
  resetBackend();
  resetChannel();
  storeBrain("gpt-fast");
}

/** Puts a brain pick on the user's row, as stored before the test or elsewhere. */
export function storeBrain(slug: string | null): void {
  backend.row = { brain_slug: slug, voice: backend.row?.voice ?? null };
}

/**
 * Opens a sidecar; sidecars sharing a harness share one tab. `quiet` false is
 * a session that reopened on a conversation, so its chat was never empty.
 */
export function openSidecar(harness = createTestQueryHarness(), quiet = true) {
  const view = renderHook(useSidecar, {
    wrapper: harness.wrapper,
    initialProps: { quiet },
  });

  /** The slug of the brain the selector shows. */
  function shownBrain() {
    return view.result.current.selected.slug;
  }

  return { ...view, harness, shownBrain };
}

/** A pick stored from another tab or device, as the Realtime feed reports it. */
export async function pickElsewhere(slug: string, { queryClient }: Harness) {
  storeBrain(slug);
  await act(() =>
    queryClient.invalidateQueries({
      queryKey: carmenChoicesKey({
        tenantId: TENANT,
        userId: "user-1",
        viewAsUserId: null,
      }),
    }),
  );
}

/** Lets the writes and reads that are already answered reach the hooks. */
export async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The sidecar's brain channel, and the chat that opens on the stored pick. */
function useSidecar({ quiet }: { quiet: boolean }) {
  const brain = useBrainChannel(TENANT);
  useApplyBrainPick(brain, TENANT, quiet);
  return brain;
}
