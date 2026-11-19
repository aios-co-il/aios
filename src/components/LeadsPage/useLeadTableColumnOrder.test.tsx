import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { backend, resetBackend } from "./useLeadTableColumnOrder.test-fixture";
import {
  loadedHook,
  reorderableHook,
  savedOrders,
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
    const { result } = await reorderableHook();
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
    const { result } = await reorderableHook();
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
    const { result } = await reorderableHook();
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
});
