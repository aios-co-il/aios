import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_BRAIN_ROUTES } from "@/lib/agentChannelRouting";
import {
  DENIED,
  backend,
  gate,
  toastError,
} from "./carmenChoiceQueries.test-fixture";
import {
  flush,
  openSidecar,
  pickElsewhere,
  resetSidecar,
} from "./useBrainPick.test-fixture";

vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("./carmenChoiceQueries.test-fixture")).fakeSupabase,
}));
vi.mock("@/hooks/useCurrentUser", async () => ({
  useCurrentUser: (await import("./carmenChoiceQueries.test-fixture"))
    .fakeCurrentUser,
}));
vi.mock("@/contexts/ViewAsContext", async () => ({
  useViewAs: (await import("./carmenChoiceQueries.test-fixture")).fakeViewAs,
}));
vi.mock("sonner", async () => ({
  toast: {
    error: (await import("./carmenChoiceQueries.test-fixture")).toastError,
  },
}));
vi.mock(
  "../brainChannelApi",
  async () =>
    (await import("../brainChannelApi.test-fixture")).fakeBrainChannelApi,
);

const NOT_STORED = "המוח שנבחר לא נשמר, והוא יחול רק כאן";
const [cursor, , grok] = FALLBACK_BRAIN_ROUTES;

type Sidecar = ReturnType<typeof openSidecar>;

/** A session that reopened on a conversation: its chat was never empty. */
async function reopenOnConversation() {
  const sidecar = openSidecar(undefined, false);
  act(() => sidecar.result.current.selectRoute(cursor, "conv-1"));
  await picksSettled(sidecar);
  await waitFor(() => expect(sidecar.result.current.routesReady).toBe(true));

  return sidecar;
}

/** Waits until no write or read of the picks is under way. */
async function picksSettled({ result }: Sidecar) {
  await waitFor(() => expect(result.current.storedPick.settled).toBe(true));
}

beforeEach(() => {
  resetSidecar();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a brain the user picks in this sidecar", () => {
  it("stays in a session that reopened on a conversation, while its write is in flight and once it is stored", async () => {
    const sidecar = await reopenOnConversation();
    const write = gate();
    backend.writeGate = write.closed;

    act(() => sidecar.result.current.pickRoute(grok));
    // The seat switch empties the chat, so it is quiet from here on.
    sidecar.rerender({ quiet: true });
    await flush();

    expect(sidecar.shownBrain()).toBe("grok");

    write.open();
    await waitFor(() =>
      expect(sidecar.result.current.storedPick.slug).toBe("grok"),
    );
    await picksSettled(sidecar);

    expect(sidecar.shownBrain()).toBe("grok");
  });

  it("stays in a session that reopened on a conversation when the row refuses it, and a later pick elsewhere is followed", async () => {
    const sidecar = await reopenOnConversation();
    backend.writeErrors = [DENIED];

    act(() => sidecar.result.current.pickRoute(grok));
    sidecar.rerender({ quiet: true });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(NOT_STORED));
    await picksSettled(sidecar);

    expect(sidecar.shownBrain()).toBe("grok");
    expect(sidecar.result.current.storedPick.slug).toBe("gpt-fast");

    await pickElsewhere("cursor", sidecar.harness);

    await waitFor(() => expect(sidecar.shownBrain()).toBe("cursor"));
  });

  it("is not undone by the first read of the row answering after it", async () => {
    const read = gate();
    const write = gate();
    backend.readGate = read.closed;
    backend.writeGate = write.closed;
    const sidecar = openSidecar();
    await waitFor(() => expect(sidecar.result.current.routesReady).toBe(true));

    act(() => sidecar.result.current.pickRoute(grok));
    read.open();
    await waitFor(() =>
      expect(sidecar.result.current.storedPick.ready).toBe(true),
    );
    await flush();

    expect(sidecar.result.current.storedPick.slug).toBe("gpt-fast");
    expect(sidecar.shownBrain()).toBe("grok");

    write.open();
    await picksSettled(sidecar);

    expect(sidecar.shownBrain()).toBe("grok");
    expect(sidecar.result.current.storedPick.slug).toBe("grok");
  });

  it("stays when the row refuses it before the first read of the row answered", async () => {
    const read = gate();
    backend.readGate = read.closed;
    backend.writeErrors = [DENIED];
    const sidecar = openSidecar();
    await waitFor(() => expect(sidecar.result.current.routesReady).toBe(true));

    act(() => sidecar.result.current.pickRoute(grok));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(NOT_STORED));
    read.open();
    await picksSettled(sidecar);

    expect(sidecar.result.current.storedPick.slug).toBe("gpt-fast");
    expect(sidecar.shownBrain()).toBe("grok");
  });

  it.each([
    { second: "stored", errors: [null, null], rowHolds: "cursor" },
    { second: "refused", errors: [null, DENIED], rowHolds: "grok" },
  ])(
    "ends on the second of two quick picks when its write is $second",
    async ({ errors, rowHolds }) => {
      const sidecar = openSidecar();
      await waitFor(() => expect(sidecar.shownBrain()).toBe("gpt-fast"));
      backend.writeErrors = errors;

      act(() => {
        sidecar.result.current.pickRoute(grok);
        sidecar.result.current.pickRoute(cursor);
      });
      await waitFor(() => expect(backend.upserts).toHaveLength(2));
      await picksSettled(sidecar);

      expect(sidecar.result.current.storedPick.slug).toBe(rowHolds);
      expect(sidecar.shownBrain()).toBe("cursor");
    },
  );

  it("replaces a pick from another device that was being held during a conversation", async () => {
    const sidecar = openSidecar();
    await waitFor(() => expect(sidecar.shownBrain()).toBe("gpt-fast"));
    sidecar.rerender({ quiet: false });
    await pickElsewhere("grok", sidecar.harness);
    await waitFor(() =>
      expect(sidecar.result.current.storedPick.slug).toBe("grok"),
    );
    const write = gate();
    backend.writeGate = write.closed;

    act(() => sidecar.result.current.pickRoute(cursor));
    sidecar.rerender({ quiet: true });
    await flush();

    expect(sidecar.shownBrain()).toBe("cursor");

    write.open();
    await waitFor(() =>
      expect(sidecar.result.current.storedPick.slug).toBe("cursor"),
    );
    await picksSettled(sidecar);

    expect(sidecar.shownBrain()).toBe("cursor");
  });
});
