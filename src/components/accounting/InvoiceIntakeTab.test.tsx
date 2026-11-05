import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { InvoiceIntakeTab } from "./InvoiceIntakeTab";

describe("InvoiceIntakeTab tenant-scoped queries", () => {
  it("does not request invoices or lookup lists without a selected tenant", () => {
    render(withTestQuery(<InvoiceIntakeTab />));

    expect(screen.getByText("עדיין לא נקלטו חשבוניות")).toBeInTheDocument();
    expect(backend.from).not.toHaveBeenCalled();
  });

  it("loads the selected tenant's invoices and lookup lists", async () => {
    backend.tenantId = "tenant-1";
    render(withTestQuery(<InvoiceIntakeTab />));

    expect(
      await screen.findByText("עדיין לא נקלטו חשבוניות"),
    ).toBeInTheDocument();
    expect(backend.tenantRead).toHaveBeenCalledWith(
      "invoice_uploads",
      "tenant-1",
    );
    expect(backend.tenantRead).toHaveBeenCalledWith("suppliers", "tenant-1");
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
  order: () => ReadQuery;
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
      order: () => query,
      then: response.then.bind(response),
    };
    return query;
  });
});
