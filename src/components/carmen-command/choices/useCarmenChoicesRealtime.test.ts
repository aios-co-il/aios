import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { carmenChoicesKey } from "./carmenChoiceQueries";
import { backend, resetBackend } from "./carmenChoiceQueries.test-fixture";
import { useCarmenChoicesRealtime } from "./useCarmenChoicesRealtime";

interface FakeChannel {
  name: string;
  filter?: { table: string; filter: string };
  onChange?: () => void;
  onStatus?: (status: string) => void;
}

const state = vi.hoisted(() => ({
  channels: [] as Array<FakeChannel>,
  removed: [] as Array<FakeChannel>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (name: string) => {
      const channel: FakeChannel = { name };
      const api = {
        on: (
          _event: string,
          filter: FakeChannel["filter"],
          onChange: () => void,
        ) => {
          channel.filter = filter;
          channel.onChange = onChange;
          return api;
        },
        subscribe: (onStatus: (status: string) => void) => {
          channel.onStatus = onStatus;
          state.channels.push(channel);
          return channel;
        },
      };
      return api;
    },
    removeChannel: async (channel: FakeChannel) => {
      state.removed.push(channel);
    },
  },
}));
vi.mock("@/hooks/useCurrentUser", async () => ({
  useCurrentUser: (await import("./carmenChoiceQueries.test-fixture"))
    .fakeCurrentUser,
}));
vi.mock("@/contexts/ViewAsContext", async () => ({
  useViewAs: (await import("./carmenChoiceQueries.test-fixture")).fakeViewAs,
}));

/** Mounts one sidecar's feed and spies on the re-reads it asks for. */
function mountFeed() {
  const { queryClient, wrapper } = createTestQueryHarness();
  const reread = vi.spyOn(queryClient, "invalidateQueries");
  const view = renderHook(() => useCarmenChoicesRealtime("tenant-a"), {
    wrapper,
  });

  return { queryClient, reread, unmount: view.unmount };
}

beforeEach(() => {
  state.channels = [];
  state.removed = [];
  resetBackend();
});

describe("useCarmenChoicesRealtime", () => {
  it("listens to the user's own rows and re-reads the picks on a change", () => {
    const { reread } = mountFeed();
    const [channel] = state.channels;

    channel.onChange?.();

    expect(channel.filter).toMatchObject({
      table: "carmen_user_choices",
      filter: "user_id=eq.user-1",
    });
    expect(reread).toHaveBeenCalledExactlyOnceWith({
      queryKey: carmenChoicesKey({
        tenantId: "tenant-a",
        userId: "user-1",
        viewAsUserId: null,
      }),
      exact: true,
    });
  });

  it("re-reads once the feed connects, for a pick stored meanwhile", () => {
    const { reread } = mountFeed();

    state.channels[0].onStatus?.("SUBSCRIBED");

    expect(reread).toHaveBeenCalledOnce();
  });

  it("leaves the re-read to a write of our own that is still in flight", () => {
    const { queryClient, reread } = mountFeed();
    vi.spyOn(queryClient, "isMutating").mockReturnValue(1);

    state.channels[0].onChange?.();

    expect(reread).not.toHaveBeenCalled();
  });

  it("gives two mounted sidecars their own channels and removes only its own", () => {
    const first = mountFeed();
    mountFeed();
    const [firstChannel, secondChannel] = state.channels;

    first.unmount();

    expect(firstChannel.name).not.toBe(secondChannel.name);
    expect(state.removed).toEqual([firstChannel]);
  });

  it("logs a feed that fails to connect", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mountFeed();

    state.channels[0].onStatus?.("CHANNEL_ERROR");

    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not listen in view-as", () => {
    backend.viewAsUserId = "user-2";

    mountFeed();

    expect(state.channels).toEqual([]);
  });
});
