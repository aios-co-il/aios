import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_BRAIN_ROUTES } from "@/lib/agentChannelRouting";
import { channel } from "../brainChannelApi.test-fixture";
import {
  DENIED,
  backend,
  toastError,
} from "./carmenChoiceQueries.test-fixture";
import {
  openSidecar,
  pickElsewhere,
  resetSidecar,
  storeBrain,
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

const [cursor, , grok] = FALLBACK_BRAIN_ROUTES;

beforeEach(() => {
  resetSidecar();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the sidecar's brain", () => {
  it("opens on Carmen's internal brain when nothing is stored, and stores nothing", async () => {
    storeBrain(null);
    const { shownBrain } = openSidecar();

    await waitFor(() => expect(shownBrain()).toBe("internal"));
    expect(backend.upserts).toEqual([]);
    expect(channel.posts).toEqual([]);
  });

  it("opens on the stored pick", async () => {
    const { shownBrain } = openSidecar();

    await waitFor(() => expect(shownBrain()).toBe("gpt-fast"));
    expect(backend.upserts).toEqual([]);
  });

  it("opens on the internal brain when the stored pick is no longer granted, and keeps the row", async () => {
    channel.routes = FALLBACK_BRAIN_ROUTES;
    const { shownBrain } = openSidecar();

    await waitFor(() => expect(shownBrain()).toBe("internal"));
    expect(backend.upserts).toEqual([]);
  });

  it("stores the brain picked in the selector on the user's row only", async () => {
    const { result, shownBrain } = openSidecar();
    await waitFor(() => expect(shownBrain()).toBe("gpt-fast"));

    act(() => result.current.pickRoute(grok));

    expect(shownBrain()).toBe("grok");
    await waitFor(() =>
      expect(backend.upserts.map((upsert) => upsert.row)).toEqual([
        { tenant_id: "tenant-a", brain_slug: "grok" },
      ]),
    );
    expect(channel.posts).toEqual([]);
  });

  it("follows a pick made elsewhere while the chat is quiet", async () => {
    const { harness, shownBrain } = openSidecar();
    await waitFor(() => expect(shownBrain()).toBe("gpt-fast"));

    await pickElsewhere("grok", harness);

    await waitFor(() => expect(shownBrain()).toBe("grok"));
    expect(backend.upserts).toEqual([]);
  });

  it("holds a pick made elsewhere during a conversation, and opens the next new chat on it", async () => {
    const { result, rerender, harness, shownBrain } = openSidecar();
    await waitFor(() => expect(shownBrain()).toBe("gpt-fast"));

    rerender({ quiet: false });
    await pickElsewhere("grok", harness);

    await waitFor(() => expect(result.current.storedPick.slug).toBe("grok"));
    expect(shownBrain()).toBe("gpt-fast");

    rerender({ quiet: true });

    expect(shownBrain()).toBe("grok");
  });

  it("runs a reopened conversation on its own brain, then returns to the pick in a new chat", async () => {
    const { result, rerender, shownBrain } = openSidecar();
    await waitFor(() => expect(shownBrain()).toBe("gpt-fast"));

    rerender({ quiet: false });
    act(() => result.current.selectRoute(cursor, "conv-1"));

    expect(shownBrain()).toBe("cursor");
    expect(channel.posts).toMatchObject([
      {
        action: "select_route",
        brain_slug: "cursor",
        conversation_id: "conv-1",
      },
    ]);

    rerender({ quiet: true });

    expect(shownBrain()).toBe("gpt-fast");
    expect(backend.upserts).toEqual([]);
  });

  it("keeps a brain picked while a reopened conversation was on screen", async () => {
    const { result, rerender, shownBrain } = openSidecar();
    await waitFor(() => expect(shownBrain()).toBe("gpt-fast"));

    rerender({ quiet: false });
    act(() => result.current.selectRoute(cursor, "conv-1"));
    act(() => result.current.pickRoute(grok));
    rerender({ quiet: true });

    expect(shownBrain()).toBe("grok");
    await waitFor(() => expect(result.current.storedPick.slug).toBe("grok"));
    expect(shownBrain()).toBe("grok");
  });

  it("moves a second sidecar in the same tab to the brain picked in the first", async () => {
    const first = openSidecar();
    const second = openSidecar(first.harness);
    await waitFor(() => expect(second.shownBrain()).toBe("gpt-fast"));

    act(() => first.result.current.pickRoute(grok));

    await waitFor(() => expect(second.shownBrain()).toBe("grok"));
    expect(first.shownBrain()).toBe("grok");
    expect(backend.upserts).toHaveLength(1);
  });

  it("keeps a brain the row refused for this sidecar only, and tells the user", async () => {
    const first = openSidecar();
    const second = openSidecar(first.harness);
    await waitFor(() => expect(second.shownBrain()).toBe("gpt-fast"));
    backend.writeErrors = [DENIED];

    act(() => first.result.current.pickRoute(grok));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "המוח שנבחר לא נשמר, והוא יחול רק כאן",
      ),
    );
    expect(first.shownBrain()).toBe("grok");
    expect(second.shownBrain()).toBe("gpt-fast");
    expect(first.result.current.storedPick.slug).toBe("gpt-fast");
  });

  it("ignores the admin's own pick in view-as and keeps a pick there for the session only", async () => {
    backend.viewAsUserId = "user-2";
    const { result, shownBrain } = openSidecar();
    await waitFor(() => expect(shownBrain()).toBe("internal"));

    act(() => result.current.pickRoute(grok));

    await waitFor(() => expect(result.current.storedPick.slug).toBe("grok"));
    expect(shownBrain()).toBe("grok");
    expect(backend.upserts).toEqual([]);
  });

  it("logs a conversation brain that was not recorded and keeps the selection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    channel.postOk = false;
    const { result, rerender, shownBrain } = openSidecar();
    await waitFor(() => expect(shownBrain()).toBe("gpt-fast"));

    rerender({ quiet: false });
    act(() => result.current.selectRoute(cursor, "conv-1"));

    await waitFor(() => expect(warn).toHaveBeenCalledOnce());
    expect(shownBrain()).toBe("cursor");
  });
});
