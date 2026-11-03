import { createClient } from "@supabase/supabase-js";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import Dashboard from "./Dashboard";

const state = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  campaignerId: "campaigner-1" as string | null | undefined,
  fetch: vi.fn<typeof globalThis.fetch>(),
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: state.tenantId }),
}));
vi.mock("@/contexts/AgencyContext", () => ({
  useAgency: () => ({ selectedAgency: "agency-1" }),
}));
vi.mock("@/hooks/useUserAgencies", () => ({
  useUserAgencies: () => ({ userAgencyIds: [] }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isOwner: true }),
}));
vi.mock("@/hooks/useTerminology", () => ({
  useTerminology: () => ({ t: () => "campaigners" }),
}));
vi.mock("@/hooks/useCrossTenantAgencyIds", () => ({
  useCrossTenantAgencyIds: () => ({ crossTenantAgencyIds: [] }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const client = createClient<Database>("https://dashboard.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => state.fetch(...args) },
  });
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: client.from.bind(client),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: PropsWithChildren<{
    value: string;
    onValueChange: (value: string) => void;
  }>) => (
    <select
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: PropsWithChildren) => <>{children}</>,
  SelectItem: ({ value, children }: PropsWithChildren<{ value: string }>) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

let queryClient: QueryClient;

/** Observe the real page's queries without replacing React Query. */
function QueryCacheProbe() {
  queryClient = useQueryClient();
  return null;
}

/** Render the production page with an isolated cache and mocked network only. */
function renderPage() {
  render(
    withTestQuery(
      <>
        <QueryCacheProbe />
        <Dashboard />
      </>,
    ),
  );
}

/** Supply the minimum display rows needed to select the production filters. */
function respond(input: Parameters<typeof fetch>[0], init?: RequestInit) {
  const url = new URL(String(input));
  const table = url.pathname.split("/").pop();
  const select = url.searchParams.get("select");
  const rows =
    table === "suppliers" && select === "id,name,related_campaigner_id"
      ? [
          {
            id: "supplier-1",
            name: "Supplier",
            related_campaigner_id: state.campaignerId,
          },
        ]
      : table === "clients" && select?.startsWith("id,name,")
        ? [{ id: "client-1", name: "Client", agency_id: "agency-1" }]
        : table === "client_team"
          ? [{ client_id: "client-1" }]
          : [];
  return new Response(init?.method === "HEAD" ? null : JSON.stringify(rows), {
    headers: { "content-type": "application/json", "content-range": "0-0/0" },
  });
}

/** Read actual page-issued requests for a particular table. */
function requestsFor(table: string) {
  return state.fetch.mock.calls.filter(([input]) =>
    new URL(String(input)).pathname.endsWith(`/${table}`),
  );
}

/** Compare the actual task request against the pre-change SDK call sequence. */
async function expectLegacyTaskRequest(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  campaignerId: string,
) {
  const legacyRequests: Array<Request> = [];
  const client = createClient("https://dashboard.test", "test-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: "dashboard-legacy-oracle",
    },
    global: {
      fetch: async (legacyInput, legacyInit) => {
        legacyRequests.push(new Request(legacyInput, legacyInit));
        return new Response("[]", {
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  const { error } = await client
    .from("tasks")
    .select("*")
    .eq("tenant_id", "tenant-1")
    .eq("status", "open")
    .eq("agency_id", "agency-1")
    .eq("client_id", "client-1")
    .eq("campaigner_id", campaignerId);
  expect(error).toBeNull();
  expect(legacyRequests).toHaveLength(1);
  const legacyRequest = legacyRequests[0];
  const actual = new Request(input, init);
  expect(actual.url).toBe(legacyRequest.url);
  expect(actual.method).toBe(legacyRequest.method);
  expect([...actual.headers]).toEqual([...legacyRequest.headers]);
  expect(await actual.text()).toBe(await legacyRequest.text());
}

beforeEach(() => {
  state.tenantId = "tenant-1";
  state.campaignerId = "campaigner-1";
  state.fetch.mockReset();
  state.fetch.mockImplementation(async (...args) => respond(...args));
});
afterEach(cleanup);

describe("Dashboard supplier query integration", () => {
  for (const campaignerId of ["campaigner-1", "", null, undefined]) {
    it(`preserves actual supplier filtering for ${String(campaignerId)}`, async () => {
      state.campaignerId = campaignerId;
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole("option", { name: "Supplier" });
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      await user.selectOptions(screen.getAllByRole("combobox")[0], "client-1");
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      state.fetch.mockClear();
      await user.selectOptions(
        screen.getAllByRole("combobox")[1],
        "supplier-1",
      );
      await waitFor(() => expect(requestsFor("tasks")).toHaveLength(1));
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      const [input, init] = requestsFor("tasks")[0];
      const params = new URL(String(input)).searchParams;
      expect(params.get("tenant_id")).toBe("eq.tenant-1");
      expect(params.get("status")).toBe("eq.open");
      expect(params.get("agency_id")).toBe("eq.agency-1");
      expect(params.get("client_id")).toBe("eq.client-1");
      expect(params.get("campaigner_id")).toBe(
        campaignerId ? `eq.${campaignerId}` : null,
      );
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(requestsFor("client_team")).toHaveLength(campaignerId ? 1 : 0);
      if (campaignerId) {
        await expectLegacyTaskRequest(input, init, campaignerId);
        const [teamInput] = requestsFor("client_team")[0];
        expect(
          new URL(String(teamInput)).searchParams.get("campaigner_id"),
        ).toBe(`eq.${campaignerId}`);
      }
    });
  }

  it("keeps missing-tenant queries disabled and manual refetch guarded", async () => {
    state.tenantId = null;
    renderPage();
    const queries = queryClient.getQueryCache().getAll();
    expect(queries).toHaveLength(5);
    expect(queries.every((query) => query.isDisabled())).toBe(true);
    expect(state.fetch).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.all(queries.map((query) => query.fetch()));
    });
    expect(state.fetch).not.toHaveBeenCalled();
  });
});
