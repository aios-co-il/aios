import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, crmTables } from "./pulseTargetSaveFake";
import { withTestQuery } from "@/test/withTestQuery";
import { TABLE_NOT_UPDATED } from "./pulseTargetSave";
import { useSavePulseTarget } from "./useSavePulseTarget";

vi.mock(
  "@/integrations/supabase/client",
  () => import("./pulseTargetSaveFake"),
);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** The hook for a tenant saving a CPL target on table t1; returns its query client. */
function saveCplOnT1(tenantId: string | null = "tenant-1") {
  const { queryClient, wrapper } = withTestQuery();
  vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(() => useSavePulseTarget(tenantId), {
    wrapper,
  });
  act(() => {
    result.current.save({
      tableIds: ["t1"],
      goal: "leads",
      kind: "cpl",
      value: 50,
    });
  });
  return queryClient;
}

beforeEach(() => {
  crmTables.rows = {};
  crmTables.log = [];
  auth.error = null;
});

describe("useSavePulseTarget", () => {
  it("confirms a target the table took", async () => {
    crmTables.rows = { t1: { tenant_id: "tenant-1", settings: {} } };
    saveCplOnT1();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("היעד נשמר"),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the refusal, never success, and reloads the tables the editor shows", async () => {
    crmTables.rows = {
      t1: { tenant_id: "tenant-1", settings: {}, readOnly: true },
    };
    const queryClient = saveCplOnT1();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(TABLE_NOT_UPDATED),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(crmTables.rows.t1.settings).toEqual({});
    await waitFor(() =>
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["pulse-dash-tables"],
      }),
    );
  });

  it("saves nothing when the signed-in user cannot be read", async () => {
    crmTables.rows = { t1: { tenant_id: "tenant-1", settings: {} } };
    auth.error = new Error("Auth session missing!");
    saveCplOnT1();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Auth session missing!"),
    );
    expect(crmTables.log).toEqual([]);
  });

  it("saves nothing and says why when no tenant is selected", async () => {
    crmTables.rows = { t1: { tenant_id: "tenant-1", settings: {} } };
    saveCplOnT1(null);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("לא נבחר ארגון (tenant)"),
    );
    expect(crmTables.log).toEqual([]);
  });
});
