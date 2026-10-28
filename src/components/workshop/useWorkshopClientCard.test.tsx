import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { useWorkshopClientCard } from "./useWorkshopClientCard";

const tables = vi.hoisted(
  () => ({}) as Record<string, Record<string, unknown>[]>,
);

vi.mock("@/integrations/supabase/client", () => {
  // A small PostgREST: eq and in filter the rows; a head count returns only the count.
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    let head = false;
    const chain: Record<string, unknown> = {};
    for (const name of ["order", "limit", "gte"]) chain[name] = () => chain;
    chain.select = (_columns: string, options?: { head?: boolean }) => {
      head = options?.head === true;
      return chain;
    };
    chain.eq = (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return chain;
    };
    chain.in = (column: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes(row[column]));
      return chain;
    };
    chain.maybeSingle = () =>
      Promise.resolve({ data: rows[0] ?? null, error: null });
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve({ data: head ? null : rows, count: rows.length, error: null });
    return chain;
  };
  return { supabase: { from } };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

const client = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  tenant_id: "t-1",
  status: "active",
  name: "פיצה",
  website: null,
  ...over,
});

test("a client the picker does not list reads like an unknown client", async () => {
  tables.social_media_wordpress_sites = [
    { id: "s-1", client_id: "c-1", tenant_id: "t-1", site_url: "pizza.co.il" },
  ];
  // A paused client, and another tenant's client (seen through a shared agency).
  for (const outside of [
    client({ status: "paused" }),
    client({ tenant_id: "t-2" }),
  ]) {
    tables.clients = [outside];
    const { result, unmount } = renderHook(
      () => useWorkshopClientCard("t-1", "c-1"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.client.isSuccess).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.client.data).toBeNull();
    expect(result.current.sites.data).toBeUndefined();
    unmount();
  }
});

test("the rank block counts active projects and keywords, as the SEO screen does", async () => {
  tables.clients = [client()];
  tables.rank_tracking_projects = [
    { id: "p-on", client_id: "c-1", is_active: true },
    { id: "p-off", client_id: "c-1", is_active: false },
    { id: "p-other", client_id: "c-2", is_active: true },
  ];
  tables.rank_tracking_keywords = [
    { id: "k1", project_id: "p-on", is_active: true },
    { id: "k2", project_id: "p-on", is_active: true },
    { id: "k3", project_id: "p-on", is_active: false },
    { id: "k4", project_id: "p-off", is_active: true },
    { id: "k5", project_id: "p-other", is_active: true },
  ];
  const { result } = renderHook(() => useWorkshopClientCard("t-1", "c-1"), {
    wrapper,
  });
  await waitFor(() => expect(result.current.ranks.isSuccess).toBe(true));
  expect(result.current.ranks.data).toStrictEqual({ projects: 1, keywords: 2 });
});
