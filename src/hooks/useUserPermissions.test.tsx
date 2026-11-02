import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { useUserPermissions } from "./useUserPermissions";

describe("useUserPermissions finance access", () => {
  it("is not ready until the database answers, then follows the read and write helpers", async () => {
    const { result } = renderPermissions();
    expect(result.current.financeAccessReady).toBe(false);
    expect(result.current.canViewFinance()).toBe(false);

    db.answer({ read: true, write: false });

    await waitFor(() => expect(result.current.financeAccessReady).toBe(true));
    expect(result.current.canViewFinance()).toBe(true);
    expect(result.current.canEditFinance()).toBe(false);
    expect(db.rpcCalls).toEqual([
      { name: "has_finance_permission", args: { _user_id: "user-1" } },
      { name: "has_finance_write_permission", args: { _user_id: "user-1" } },
    ]);
  });

  it("is ready with no access when the access check fails", async () => {
    const { result } = renderPermissions();

    db.fail({ message: "rpc unavailable" });

    await waitFor(() => expect(result.current.financeAccessReady).toBe(true));
    expect(result.current.canViewFinance()).toBe(false);
    expect(result.current.canEditFinance()).toBe(false);
  });
});

type Answer = { data: boolean | null; error: { message: string } | null };

const db = vi.hoisted(() => {
  const state = {
    rpcCalls: [] as { name: string; args: unknown }[],
    pending: [] as ((answer: Answer) => void)[],
    answer(access: { read: boolean; write: boolean }) {
      state.rpcCalls.forEach((call, index) => {
        const allowed =
          call.name === "has_finance_write_permission"
            ? access.write
            : access.read;
        state.pending[index]({ data: allowed, error: null });
      });
    },
    fail(error: { message: string }) {
      state.pending.forEach((resolve) => resolve({ data: null, error }));
    },
  };
  return state;
});

beforeEach(() => {
  db.rpcCalls = [];
  db.pending = [];
});

function renderPermissions() {
  const { wrapper } = withTestQuery();
  return renderHook(() => useUserPermissions(), { wrapper });
}

vi.mock("@/integrations/supabase/client", () => {
  const permissionsQuery = {
    select: () => permissionsQuery,
    eq: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    supabase: {
      from: () => permissionsQuery,
      rpc: (name: string, args: unknown) =>
        new Promise<Answer>((resolve) => {
          db.rpcCalls.push({ name, args });
          db.pending.push(resolve);
        }),
    },
  };
});

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({
    isOwner: false,
    isSuperAdmin: false,
    isCampaigner: false,
    isTeamManager: false,
    isAgencyOwner: false,
    userId: "user-1",
  }),
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-1" }),
}));
