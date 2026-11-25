import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
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

describe("useUserPermissions modules", () => {
  it("reads only the active tenant's modules", async () => {
    const { result } = renderPermissions();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(db.filters).toEqual([
      ["user_id", "user-1"],
      ["tenant_id", "tenant-1"],
    ]);
  });
});

type Answer = { data: boolean | null; error: { message: string } | null };

const db = vi.hoisted(() => {
  const state = {
    rpcCalls: [] as Array<{ name: string; args: unknown }>,
    filters: [] as Array<[string, unknown]>,
    pending: [] as Array<(answer: Answer) => void>,
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
  db.filters = [];
});

function renderPermissions() {
  const { wrapper } = createTestQueryHarness();
  return renderHook(() => useUserPermissions(), { wrapper });
}

vi.mock("@/integrations/supabase/client", () => {
  const result = Promise.resolve({ data: [], error: null });
  const permissionsQuery = {
    select: () => permissionsQuery,
    eq: (column: string, value: unknown) => {
      db.filters.push([column, value]);
      return permissionsQuery;
    },
    then: result.then.bind(result),
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
