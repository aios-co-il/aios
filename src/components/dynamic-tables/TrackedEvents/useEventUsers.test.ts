import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useEventUsers } from "./useEventUsers";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

const tracked = [{ event: "purchase", label: "רכישה" }];

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue({ data: { events: [] }, error: null });
});

describe("useEventUsers on a share link", () => {
  it("sends the custom range's days with the filter", async () => {
    const { wrapper } = createTestQueryHarness();
    renderHook(
      () =>
        useEventUsers({
          source: { shareToken: "share-token" },
          tracked,
          dateFilter: "custom",
          customFrom: "2026-09-01",
          customTo: "2026-09-30",
        }),
      { wrapper },
    );

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    expect(mocks.invoke).toHaveBeenCalledWith("ga-event-users", {
      body: {
        share_token: "share-token",
        date_filter: "custom",
        custom_start: "2026-09-01",
        custom_end: "2026-09-30",
      },
    });
  });

  it("sends a preset alone", async () => {
    const { wrapper } = createTestQueryHarness();
    renderHook(
      () =>
        useEventUsers({
          source: { shareToken: "share-token" },
          tracked,
          dateFilter: "last_7_days",
        }),
      { wrapper },
    );

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    expect(mocks.invoke).toHaveBeenCalledWith("ga-event-users", {
      body: { share_token: "share-token", date_filter: "last_7_days" },
    });
  });

  it("waits for both days of a custom range", () => {
    const { wrapper } = createTestQueryHarness();
    renderHook(
      () =>
        useEventUsers({
          source: { shareToken: "share-token" },
          tracked,
          dateFilter: "custom",
          customFrom: "2026-09-01",
          customTo: "",
        }),
      { wrapper },
    );

    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
