import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useClientRowMutations } from "./useClientRowMutations";

const state = vi.hoisted(() => ({
  lookupError: null as { message: string } | null,
  existing: null as { id: string } | null,
  inserts: [] as Array<unknown>,
  toasts: [] as Array<{ kind: string; message: string }>,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (message: string) =>
      state.toasts.push({ kind: "success", message }),
    error: (message: string) => state.toasts.push({ kind: "error", message }),
    info: (message: string) => state.toasts.push({ kind: "info", message }),
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  const lookup = {
    eq: () => lookup,
    maybeSingle: async () => ({
      data: state.existing,
      error: state.lookupError,
    }),
  };
  return {
    supabase: {
      from: () => ({
        select: () => lookup,
        insert: async (row: unknown) => {
          state.inserts.push(row);
          return { error: null };
        },
      }),
    },
  };
});

/** Mounts the hook in a fresh query client. */
function mountHook() {
  const { wrapper } = createTestQueryHarness();
  return renderHook(() => useClientRowMutations("tenant-a"), { wrapper });
}

beforeEach(() => {
  state.lookupError = null;
  state.existing = null;
  state.inserts = [];
  state.toasts = [];
});

describe("assignCampaigner", () => {
  it("inserts nothing and reports an error when the duplicate check fails", async () => {
    state.lookupError = { message: "permission denied" };
    const { result } = mountHook();

    result.current.assignCampaigner.mutate({
      clientId: "c1",
      campaignerId: "p1",
    });

    await waitFor(() =>
      expect(result.current.assignCampaigner.isError).toBe(true),
    );
    expect(state.inserts).toEqual([]);
    expect(state.toasts).toEqual([
      { kind: "error", message: "שגיאה בשיוך הקמפיינר" },
    ]);
  });

  it("assigns a campaigner who is not on the client yet", async () => {
    const { result } = mountHook();

    result.current.assignCampaigner.mutate({
      clientId: "c1",
      campaignerId: "p1",
    });

    await waitFor(() =>
      expect(result.current.assignCampaigner.isSuccess).toBe(true),
    );
    expect(state.inserts).toEqual([{ client_id: "c1", campaigner_id: "p1" }]);
  });
});
