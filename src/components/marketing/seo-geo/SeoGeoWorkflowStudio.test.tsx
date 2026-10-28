import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SeoGeoWorkflowStudio } from "./SeoGeoWorkflowStudio";

// Every table is empty: the project has no program, keywords, entries or sites yet.
vi.mock("@/lib/seoGeoDb", () => {
  const empty = { data: null, error: null };
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: [], error: null }),
    maybeSingle: async () => empty,
    single: async () => empty,
  };
  for (const method of ["select", "eq", "order", "insert", "update", "gte"])
    chain[method] = () => chain;
  return { seoGeoDb: { from: () => chain } };
});
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: [], error: null }),
  };
  for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
  return { supabase: { from: () => chain, functions: { invoke: vi.fn() } } };
});

const renderStudio = (projectClient: string | null) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SeoGeoWorkflowStudio
        workItem={{
          id: "item-1",
          title: "SEO",
          payload: {},
          client_id: projectClient,
        }}
        tenantId="tenant-1"
        clientId="client-1"
        onPlanRefresh={vi.fn()}
      />
    </QueryClientProvider>,
  );

test("a project of another client says so instead of empty program settings", async () => {
  renderStudio("client-2");
  expect(
    await screen.findByText("הפרויקט הזה שייך ללקוח אחר"),
  ).toBeInTheDocument();
  expect(screen.queryByText("אתר WordPress")).not.toBeInTheDocument();
});

test("on the project's own client the program settings show", async () => {
  renderStudio("client-1");
  // The settings also render while the program loads; the auto-approve switch is enabled only
  // once the query has settled, so the checks below see the loaded state.
  await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
  expect(screen.getByText("אתר WordPress")).toBeInTheDocument();
  expect(
    screen.queryByText("הפרויקט הזה שייך ללקוח אחר"),
  ).not.toBeInTheDocument();
});

test("a project without a client asks to assign it first", async () => {
  renderStudio(null);
  expect(
    await screen.findByText("שייכו את הפרויקט ללקוח כדי להגדיר תוכנית"),
  ).toBeInTheDocument();
});
