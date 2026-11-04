import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useLeadStageScopeDefault } from "./useLeadStageScopeDefault";

type Failure = { message: string } | null;

const backend = vi.hoisted(() => ({
  row: null as { stage_scope: string } | null,
  readError: null as Failure,
  writeError: null as Failure,
  filters: [] as [string, string][],
  upsert: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-dmm" }),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-david" }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: backend.toast }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          backend.filters.push([column, value]);
          return query;
        },
        maybeSingle: () =>
          Promise.resolve({ data: backend.row, error: backend.readError }),
        upsert: (row: unknown, options: unknown) => {
          backend.upsert(table, row, options);
          return Promise.resolve({ error: backend.writeError });
        },
      };
      return query;
    },
  },
}));

/** The hook once its read has settled. */
async function settledHook() {
  const { wrapper } = createTestQueryHarness();
  const hook = renderHook(() => useLeadStageScopeDefault(), { wrapper });
  await waitFor(() => expect(hook.result.current.isSettled).toBe(true));
  return hook;
}

beforeEach(() => {
  backend.row = null;
  backend.readError = null;
  backend.writeError = null;
  backend.filters = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useLeadStageScopeDefault", () => {
  it("reads the saved scope for this user in this tenant", async () => {
    backend.row = { stage_scope: "new" };
    const { result } = await settledHook();
    expect(result.current.savedScope).toBe("new");
    expect(backend.filters).toEqual([
      ["tenant_id", "tenant-dmm"],
      ["user_id", "user-david"],
    ]);
  });

  it("has no saved scope when the user never saved one", async () => {
    const { result } = await settledHook();
    expect(result.current.savedScope).toBeNull();
  });

  it("settles and shows an error toast when the read fails", async () => {
    backend.readError = { message: "permission denied" };
    const { result } = await settledHook();
    expect(result.current.savedScope).toBeNull();
    await waitFor(() =>
      expect(backend.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "permission denied",
        }),
      ),
    );
  });

  it("upserts one row per user and tenant and keeps the new scope", async () => {
    const { result } = await settledHook();
    act(() => result.current.saveScope("all"));
    await waitFor(() => expect(result.current.savedScope).toBe("all"));
    expect(backend.upsert).toHaveBeenCalledWith(
      "lead_list_defaults",
      { tenant_id: "tenant-dmm", user_id: "user-david", stage_scope: "all" },
      { onConflict: "tenant_id,user_id" },
    );
  });

  it("keeps the old scope and shows an error toast when the save fails", async () => {
    backend.row = { stage_scope: "new" };
    backend.writeError = { message: "network down" };
    const { result } = await settledHook();
    act(() => result.current.saveScope("all"));
    await waitFor(() =>
      expect(backend.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "network down",
        }),
      ),
    );
    expect(result.current.savedScope).toBe("new");
  });
});
