import { render, screen, waitFor } from "@testing-library/react";
import { withTestQuery } from "@/test/withTestQuery";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserIntegrations } from "./useUserIntegrations";
import { useResolvedGscIntegration } from "./useResolvedGscIntegration";

interface IntegrationFixture {
  id: string | number;
  tenant_id: string;
  user_id: string;
  integration_type: string;
  settings: { client_sites: { "client-1": string } };
}

const mocks = vi.hoisted(() => ({
  own: [] as Array<IntegrationFixture>,
  shared: [] as Array<IntegrationFixture>,
  selects: [] as Array<{ table: string; columns: string }>,
  invoke: vi.fn(),
}));

vi.mock("./useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-1" }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test" } } }),
    },
    functions: { invoke: mocks.invoke },
    from: (table: string) => {
      let shared = false;
      const query = {
        select: (columns: string) => {
          mocks.selects.push({ table, columns });
          return query;
        },
        eq: () => query,
        in: (column: string) => {
          shared ||= column === "id";
          return query;
        },
        then: (
          resolve: (value: {
            data: Array<IntegrationFixture | { integration_id: string }>;
            error: null;
          }) => unknown,
        ) =>
          Promise.resolve({
            data:
              table === "integration_user_permissions"
                ? [{ integration_id: "shared-valid" }]
                : shared
                  ? mocks.shared
                  : mocks.own,
            error: null,
          }).then(resolve),
      };
      return query;
    },
  },
}));

const fixture: IntegrationFixture = {
  id: "valid",
  tenant_id: "tenant-1",
  user_id: "user-1",
  integration_type: "google_search_console",
  settings: { client_sites: { "client-1": "https://example.com/" } },
};

beforeEach(() => {
  mocks.selects = [];
  mocks.own = [{ ...fixture, id: 42 }, fixture];
  mocks.shared = [
    { ...fixture, id: 99 },
    { ...fixture, id: "shared-valid" },
  ];
  mocks.invoke.mockResolvedValue({
    data: { integrationId: "fallback", siteUrl: "https://example.com/" },
    error: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("useUserIntegrations identity boundary", () => {
  it.each([
    { type: "google_search_console", google: true, reads: 1 },
    { type: "facebook_lead_ads", google: false, reads: 1 },
    { type: "meta_whatsapp", google: false, reads: 2 },
  ])(
    "uses the exact own/shared projection for $type",
    async ({ type, google, reads }) => {
      mocks.own = [{ ...fixture, integration_type: type }];
      mocks.shared = [
        { ...fixture, id: "shared-valid", integration_type: type },
      ];

      render(withTestQuery(<IntegrationList type={type} />));

      await waitFor(() =>
        expect(screen.getByLabelText("integration IDs").textContent).toBe(
          reads === 1 ? "valid" : "valid,shared-valid",
        ),
      );
      const selects = mocks.selects.filter(
        ({ table }) => table === "tenant_integrations",
      );
      const publicColumns =
        "id, tenant_id, user_id, integration_type, is_active, settings, display_name, connection_visibility, shared_from_integration_id, auto_sync_enabled, last_sync_at, created_at, updated_at, instance_id, company_id, api_token_last_4";
      const expected = google ? publicColumns : `${publicColumns}, api_key`;
      expect(selects.map(({ columns }) => columns)).toEqual(
        Array.from({ length: reads }, () => expected),
      );
      for (const { columns } of selects) {
        expect(columns.split(", ").includes("api_key")).toBe(!google);
      }
    },
  );

  it.each(["google_search_console", "meta_whatsapp"])(
    "rejects invalid IDs before exposing %s rows to any consumer",
    async (type) => {
      render(withTestQuery(<IntegrationList type={type} />));
      await waitFor(() =>
        expect(screen.getByLabelText("integration IDs").textContent).toBe(
          type === "google_search_console" ? "valid" : "valid,shared-valid",
        ),
      );
      expect(console.error).toHaveBeenCalledTimes(
        type === "google_search_console" ? 1 : 2,
      );
      expect(console.error).toHaveBeenCalledWith(
        "Ignoring integration with an invalid id",
      );
    },
  );

  it("keeps the tenant fallback available when a malformed personal ID has a matching site", async () => {
    mocks.own = [{ ...fixture, id: 42 }];
    render(withTestQuery(<ResolvedIntegration />));
    expect(await screen.findByText("fallback:true")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith(
      "resolve-seo-gsc-integration",
      expect.objectContaining({
        body: expect.objectContaining({
          clientId: "client-1",
          tenantIds: ["tenant-1"],
        }),
      }),
    );
  });
});

/** Render the real query result through the shared provider. */
function IntegrationList({ type }: { type: string }) {
  const { data, isSuccess } = useUserIntegrations("tenant-1", type);
  return (
    <output aria-label="integration IDs">
      {isSuccess ? data.map((row) => row.id).join(",") : "loading"}
    </output>
  );
}

/** Keep the fallback observable while its real queries settle. */
function ResolvedIntegration() {
  const { integrationId, isFallback } = useResolvedGscIntegration({
    clientId: "client-1",
    tenantIds: ["tenant-1"],
    expectedDomain: "example.com",
  });
  return <output>{`${integrationId}:${isFallback}`}</output>;
}
