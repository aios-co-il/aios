import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { CashFlowTab } from "./CashFlowTab";

describe("CashFlowTab tenant-scoped queries", () => {
  it("does not request accounting data without a selected tenant", () => {
    render(withTestQuery(<CashFlowTab />));

    expect(backend.from).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "ייצוא CSV" }),
    ).not.toBeInTheDocument();
  });

  it("loads the selected tenant's cashflow before exposing its export", async () => {
    backend.tenantId = "tenant-1";
    render(withTestQuery(<CashFlowTab />));

    expect(
      await screen.findByRole("button", { name: "ייצוא CSV" }),
    ).toBeInTheDocument();
    expect(backend.tenantRead).toHaveBeenCalledWith("clients", "tenant-1");
    expect(
      backend.tenantRead.mock.calls.every(
        ([, tenantId]) => tenantId === "tenant-1",
      ),
    ).toBe(true);
  });
});

type QueryResult = { data: Array<never>; error: null };
type ReadQuery = PromiseLike<QueryResult> & {
  select: () => ReadQuery;
  eq: (column: string, value: string) => ReadQuery;
  in: () => ReadQuery;
};

const backend = vi.hoisted(() => ({
  tenantId: null as string | null,
  from: vi.fn<(table: string) => ReadQuery>(),
  tenantRead: vi.fn<(table: string, tenantId: string) => void>(),
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: backend.tenantId }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: backend.from },
}));

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));

beforeEach(() => {
  backend.tenantId = null;
  backend.tenantRead.mockClear();
  backend.from.mockReset().mockImplementation((table) => {
    const response = Promise.resolve<QueryResult>({ data: [], error: null });
    const query: ReadQuery = {
      select: () => query,
      eq: (column, value) => {
        if (column === "tenant_id") {
          backend.tenantRead(table, value);
        }
        return query;
      },
      in: () => query,
      then: response.then.bind(response),
    };
    return query;
  });
});
