import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY } from "./legacyLeadColumnOrder";
import { backend, resetBackend } from "./useLeadTableColumnOrder.test-fixture";
import {
  loadedHook,
  savedOrders,
  seedLegacyOrder,
} from "./useLeadTableColumnOrder.hook.test-fixture";

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-psagot" }),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-raya" }),
}));

vi.mock(
  "sonner",
  async () =>
    (await import("./useLeadTableColumnOrder.test-fixture")).sonnerModule,
);

vi.mock(
  "@/integrations/supabase/client",
  async () =>
    (await import("./useLeadTableColumnOrder.test-fixture")).supabaseModule,
);

beforeEach(resetBackend);

describe("useLeadTableColumnOrder: moving the old browser order", () => {
  it("moves the browser's old order to the account once and clears it", async () => {
    seedLegacyOrder(["actions", "name"]);
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
    seedLegacyOrder(["actions", "name"]);
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
    seedLegacyOrder(["actions", "name"]);
    await loadedHook();
    await waitFor(() => expect(backend.toastError).toHaveBeenCalled());
    expect(
      window.localStorage.getItem(LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY),
    ).not.toBeNull();
  });

  it("keeps the browser's old order when a remount happens before the move is confirmed", async () => {
    seedLegacyOrder(["actions", "name"]);
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
    seedLegacyOrder(["actions", "name"]);
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

  it("moves the browser's old order only where the account has none, in the database", async () => {
    seedLegacyOrder(["actions", "name"]);
    await loadedHook();
    await waitFor(() => expect(backend.update).toHaveBeenCalledTimes(1));

    expect(backend.upsert.mock.calls[0][2]).toEqual({
      onConflict: "tenant_id,user_id",
      ignoreDuplicates: true,
    });
    expect(backend.update).toHaveBeenCalledWith(
      "lead_list_defaults",
      { column_order: ["actions", "name"] },
      [
        ["tenant_id", "tenant-psagot"],
        ["user_id", "user-raya"],
        ["column_order is", null],
      ],
    );
  });

  it("shows the account's order when another tab saves one during the move", async () => {
    seedLegacyOrder(["actions", "name"]);
    // Another tab saves its order just as this tab's conditional writes run.
    backend.upsert.mockImplementationOnce(() => {
      backend.row = { column_order: ["status", "phone"] };
    });
    const { result } = await loadedHook();

    await waitFor(() =>
      expect(result.current.order).toEqual(["status", "phone"]),
    );
    expect(
      window.localStorage.getItem(LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY),
    ).toBeNull();
  });
});
