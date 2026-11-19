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
  // When set, each upsert waits on the next deferred result instead of resolving at once.
  deferred: null as Array<{
    resolve: (result: { error: Failure }) => void;
  }> | null,
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
          const deferred = backend.deferred;
          if (deferred) {
            return new Promise<{ error: Failure }>((resolve) => {
              deferred.push({ resolve });
            });
          }
          return Promise.resolve({ error: backend.writeError });
        },
      };
      return query;
    },
  },
}));

/** The hook once the account's saved order has loaded. */
async function loadedHook(harness = createTestQueryHarness()) {
  const hook = renderHook(() => useLeadTableColumnOrder(), {
    wrapper: harness.wrapper,
  });
  await waitFor(() => expect(backend.filters.length).toBeGreaterThan(0));
  return hook;
}

/** The column order sent by each upsert so far. */
function savedOrders() {
  return backend.upsert.mock.calls.map(
    (call) => (call[1] as { column_order: Array<string> }).column_order,
  );
}

beforeEach(() => {
  backend.row = null;
  backend.readError = null;
  backend.writeError = null;
  backend.filters = [];
  backend.upsert.mockClear();
  backend.deferred = null;
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

  it("saves two quick drags one at a time, so the later order wins", async () => {
    backend.row = { column_order: ["name", "phone", "status"] };
    const { result } = await loadedHook();
    await waitFor(() => expect(result.current.setOrder).toBeDefined());
    backend.deferred = [];

    act(() => result.current.setOrder?.(["phone", "name", "status"]));
    act(() => result.current.setOrder?.(["status", "phone", "name"]));
    expect(result.current.order).toEqual(["status", "phone", "name"]);
    await waitFor(() => expect(backend.upsert).toHaveBeenCalledTimes(1));
    expect(savedOrders()).toEqual([["phone", "name", "status"]]);

    await act(async () => backend.deferred?.[0].resolve({ error: null }));
    await waitFor(() => expect(backend.upsert).toHaveBeenCalledTimes(2));
    expect(result.current.order).toEqual(["status", "phone", "name"]);

    await act(async () => backend.deferred?.[1].resolve({ error: null }));
    await waitFor(() =>
      expect(result.current.order).toEqual(["status", "phone", "name"]),
    );
    expect(savedOrders()[1]).toEqual(["status", "phone", "name"]);
  });

  it("keeps the newer drag on screen when an earlier save fails", async () => {
    backend.row = { column_order: ["name", "phone"] };
    const { result } = await loadedHook();
    await waitFor(() => expect(result.current.setOrder).toBeDefined());
    backend.deferred = [];

    act(() => result.current.setOrder?.(["phone", "name"]));
    act(() => result.current.setOrder?.(["name", "phone", "status"]));
    await waitFor(() => expect(backend.upsert).toHaveBeenCalledTimes(1));
    await act(async () =>
      backend.deferred?.[0].resolve({ error: { message: "timeout" } }),
    );
    await waitFor(() => expect(backend.toastError).toHaveBeenCalled());
    expect(result.current.order).toEqual(["name", "phone", "status"]);

    await waitFor(() => expect(backend.upsert).toHaveBeenCalledTimes(2));
    await act(async () => backend.deferred?.[1].resolve({ error: null }));
    await waitFor(() =>
      expect(result.current.order).toEqual(["name", "phone", "status"]),
    );
  });

  it("keeps the browser's old order when a remount happens before the move is confirmed", async () => {
    window.localStorage.setItem(
      LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY,
      JSON.stringify(["actions", "name"]),
    );
    backend.deferred = [];
    const harness = createTestQueryHarness();
    const first = await loadedHook(harness);
    await waitFor(() => expect(backend.upsert).toHaveBeenCalledTimes(1));

    first.unmount();
    await loadedHook(harness);
    for (const pending of backend.deferred ?? []) {
      await act(async () =>
        pending.resolve({ error: { message: "permission denied" } }),
      );
    }
    await waitFor(() => expect(backend.toastError).toHaveBeenCalled());
    await act(async () => {
      for (const pending of backend.deferred ?? []) {
        pending.resolve({ error: { message: "permission denied" } });
      }
    });

    expect(
      window.localStorage.getItem(LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY),
    ).toBe(JSON.stringify(["actions", "name"]));
  });

  it("skips a queued browser-order move once a newer drag is on the account", async () => {
    window.localStorage.setItem(
      LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY,
      JSON.stringify(["actions", "name"]),
    );
    backend.deferred = [];
    const harness = createTestQueryHarness();
    const first = await loadedHook(harness);
    await waitFor(() => expect(backend.upsert).toHaveBeenCalledTimes(1));

    // A drag queues behind the pending move, then the CRM remounts.
    act(() => first.result.current.setOrder?.(["name", "actions"]));
    first.unmount();
    const second = await loadedHook(harness);

    // The first move and the drag commit; the database now holds the drag.
    await act(async () => backend.deferred?.[0].resolve({ error: null }));
    backend.row = { column_order: ["actions", "name"] };
    await waitFor(() => expect(backend.upsert).toHaveBeenCalledTimes(2));
    backend.row = { column_order: ["name", "actions"] };
    await act(async () => backend.deferred?.[1].resolve({ error: null }));

    // The remount's queued move rereads the account and does not write.
    await waitFor(() =>
      expect(second.result.current.order).toEqual(["name", "actions"]),
    );
    expect(savedOrders()).toEqual([
      ["actions", "name"],
      ["name", "actions"],
    ]);
  });
});
