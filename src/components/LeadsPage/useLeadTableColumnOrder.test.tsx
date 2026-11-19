import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import {
  LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY,
  useLeadTableColumnOrder,
} from "./useLeadTableColumnOrder";

type Failure = { message: string } | null;

const backend = vi.hoisted(() => ({
  row: null as { column_order: Array<string> | null } | null,
  readError: null as Failure,
  writeError: null as Failure,
  filters: [] as Array<[string, string]>,
  upsert: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-psagot" }),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-raya" }),
}));

vi.mock("sonner", () => ({
  toast: { error: backend.toastError, success: vi.fn() },
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

/** The hook once the account's saved order has loaded. */
async function loadedHook() {
  const { wrapper } = createTestQueryHarness();
  const hook = renderHook(() => useLeadTableColumnOrder(), { wrapper });
  await waitFor(() => expect(backend.filters.length).toBeGreaterThan(0));
  return hook;
}

beforeEach(() => {
  backend.row = null;
  backend.readError = null;
  backend.writeError = null;
  backend.filters = [];
  backend.upsert.mockClear();
  backend.toastError.mockClear();
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useLeadTableColumnOrder", () => {
  it("shows the order saved on this user's account in this tenant", async () => {
    backend.row = { column_order: ["status", "name"] };
    const { result } = await loadedHook();
    await waitFor(() =>
      expect(result.current.order).toEqual(["status", "name"]),
    );
    expect(backend.filters).toEqual([
      ["tenant_id", "tenant-psagot"],
      ["user_id", "user-raya"],
    ]);
    expect(backend.upsert).not.toHaveBeenCalled();
  });

  it("saves a dragged order to the user's own row only", async () => {
    const { result } = await loadedHook();
    await waitFor(() => expect(result.current.setOrder).toBeDefined());
    act(() => result.current.setOrder?.(["phone", "name"]));
    await waitFor(() => expect(backend.upsert).toHaveBeenCalledTimes(1));
    expect(backend.upsert).toHaveBeenCalledWith(
      "lead_list_defaults",
      {
        tenant_id: "tenant-psagot",
        user_id: "user-raya",
        column_order: ["phone", "name"],
      },
      { onConflict: "tenant_id,user_id" },
    );
    expect(result.current.order).toEqual(["phone", "name"]);
  });

  it("moves the browser's old order to the account once and clears it", async () => {
    window.localStorage.setItem(
      LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY,
      JSON.stringify(["actions", "name"]),
    );
    const { result, rerender } = await loadedHook();
    expect(result.current.order).toEqual(["actions", "name"]);
    await waitFor(() =>
      expect(
        window.localStorage.getItem(LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY),
      ).toBeNull(),
    );
    rerender();
    expect(backend.upsert).toHaveBeenCalledTimes(1);
    expect(backend.upsert.mock.calls[0][1]).toMatchObject({
      column_order: ["actions", "name"],
    });
  });

  it("keeps the account's order over an old browser order", async () => {
    backend.row = { column_order: ["status", "name"] };
    window.localStorage.setItem(
      LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY,
      JSON.stringify(["actions", "name"]),
    );
    const { result } = await loadedHook();
    await waitFor(() =>
      expect(result.current.order).toEqual(["status", "name"]),
    );
    expect(
      window.localStorage.getItem(LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY),
    ).toBeNull();
    expect(backend.upsert).not.toHaveBeenCalled();
  });

  it("keeps the browser's old order when moving it fails, to retry next visit", async () => {
    backend.writeError = { message: "permission denied" };
    window.localStorage.setItem(
      LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY,
      JSON.stringify(["actions", "name"]),
    );
    await loadedHook();
    await waitFor(() => expect(backend.toastError).toHaveBeenCalled());
    expect(
      window.localStorage.getItem(LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY),
    ).not.toBeNull();
  });

  it("reports a failed load and blocks reordering over the default order", async () => {
    backend.readError = { message: "network down" };
    const { result } = await loadedHook();
    await waitFor(() =>
      expect(backend.toastError).toHaveBeenCalledWith(
        "לא ניתן לטעון את סדר העמודות השמור",
      ),
    );
    expect(result.current.setOrder).toBeUndefined();
    expect(backend.upsert).not.toHaveBeenCalled();
  });

  it("rolls back and reports a save that fails", async () => {
    backend.row = { column_order: ["status", "name"] };
    backend.writeError = { message: "permission denied" };
    const { result } = await loadedHook();
    await waitFor(() =>
      expect(result.current.order).toEqual(["status", "name"]),
    );
    act(() => result.current.setOrder?.(["name", "status"]));
    await waitFor(() =>
      expect(backend.toastError).toHaveBeenCalledWith(
        "לא ניתן לשמור את סדר העמודות",
      ),
    );
    expect(result.current.order).toEqual(["status", "name"]);
  });
});
