import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crmTables } from "@/lib/pulseTargetSaveFake";
import { useSavePulseTarget } from "./useSavePulseTarget";

vi.mock(
  "@/integrations/supabase/client",
  () => import("@/lib/pulseTargetSaveFake"),
);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** The hook for tenant-1, saving a CPL target on table t1. */
function saveCplOnT1() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(() => useSavePulseTarget("tenant-1"), {
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
}

beforeEach(() => {
  crmTables.rows = {};
  crmTables.log = [];
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

  it("shows the permission error, never success, on a table the org may only read", async () => {
    crmTables.rows = {
      t1: { tenant_id: "tenant-1", settings: {}, readOnly: true },
    };
    saveCplOnT1();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "אין לך הרשאה לעדכן את היעד בטבלה הזו",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(crmTables.rows.t1.settings).toEqual({});
  });
});
