// Hook helpers live apart from the fake backend: the supabase mock loads that
// fixture, and importing the hook there would make the mock import itself.
import { renderHook, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY } from "./legacyLeadColumnOrder";
import { useLeadTableColumnOrder } from "./useLeadTableColumnOrder";
import { backend } from "./useLeadTableColumnOrder.test-fixture";

/** The hook once the account's saved order has loaded. */
export async function loadedHook(harness = createTestQueryHarness()) {
  const hook = renderHook(() => useLeadTableColumnOrder(), {
    wrapper: harness.wrapper,
  });
  await waitFor(() => expect(backend.filters.length).toBeGreaterThan(0));
  return hook;
}

/** The hook once reordering is allowed (the saved order has loaded). */
export async function reorderableHook() {
  const hook = await loadedHook();
  await waitFor(() => expect(hook.result.current.setOrder).toBeDefined());
  return hook;
}

/** Stores an order the way this browser kept it before the account did. */
export function seedLegacyOrder(order: Array<string>) {
  window.localStorage.setItem(
    LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY,
    JSON.stringify(order),
  );
}

/** The column order sent by each upsert so far. */
export function savedOrders() {
  return backend.upsert.mock.calls.map(
    (call) => (call[1] as { column_order: Array<string> }).column_order,
  );
}
