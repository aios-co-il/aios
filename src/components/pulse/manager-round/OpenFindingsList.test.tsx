import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OpenFindingsList } from "./OpenFindingsList";

type ListResult = { data: unknown[]; error: { message: string } | null };

const result = vi.hoisted(() => {
  const state: { value: ListResult; filters: unknown[][] } = {
    value: { data: [], error: null },
    filters: [],
  };
  return state;
});

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "t1" }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    eq: (...args: unknown[]) => {
      result.filters.push(args);
      return chain;
    },
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result.value),
  };
  return { supabase: { from: () => chain } };
});

/** Renders the list with a fresh query client (no retries). */
function renderList() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OpenFindingsList />
    </QueryClientProvider>,
  );
}

describe("OpenFindingsList", () => {
  it("lists the tenant's open findings with their codes and kinds", async () => {
    result.value = {
      data: [
        {
          id: "f1",
          short_code: 231,
          kind: "no_campaigner",
          severity: "warning",
          summary_he: "לקוח א: אין קמפיינר",
          status: "open",
        },
      ],
      error: null,
    };
    renderList();
    expect(await screen.findByText("לקוח א: אין קמפיינר")).toBeInTheDocument();
    expect(screen.getByText("#231")).toBeInTheDocument();
    expect(screen.getByText("לקוח בלי קמפיינר")).toBeInTheDocument();
    expect(result.filters).toContainEqual(["tenant_id", "t1"]);
  });

  it("says so when the findings cannot be loaded", async () => {
    result.value = { data: [], error: { message: "denied" } };
    renderList();
    expect(
      await screen.findByText("לא הצלחנו לטעון את הממצאים."),
    ).toBeInTheDocument();
  });
});
