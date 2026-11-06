import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import ChatIntegrations from "./ChatIntegrations";

const state = vi.hoisted(() => {
  const values: {
    tenantId: string | null;
    userId: string | null;
    requests: Array<Request>;
    status: number;
  } = { tenantId: "tenant-1", userId: "user-1", requests: [], status: 200 };
  return values;
});

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: state.tenantId }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: state.userId }),
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("@/components/forms/ManageIntegrationPermissionsDialog", () => ({
  ManageIntegrationPermissionsDialog: () => null,
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const captureFetch: typeof fetch = async (input, init) => {
    state.requests.push(new Request(input, init));
    return new Response(
      state.status === 200
        ? "[]"
        : JSON.stringify({ code: "42501", message: "permission denied" }),
      { status: state.status, headers: { "content-type": "application/json" } },
    );
  };
  return {
    supabase: createClient("https://example.com", "test-key", {
      global: { fetch: captureFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
});

const providers = [
  { type: "manychat", key: "integration-manychat", personal: false },
  { type: "green_api", key: "integration-green-api", personal: true },
  { type: "manus_wa", key: "integration-manus-wa", personal: true },
  { type: "meta_whatsapp", key: "integration-meta-whatsapp", personal: false },
];

beforeEach(() => {
  state.tenantId = "tenant-1";
  state.userId = "user-1";
  state.requests = [];
  state.status = 200;
});

describe("ChatIntegrations provider queries", () => {
  it.each(["tenant-1", null])(
    "uses the page's actual provider query functions for tenant %s",
    async (tenantId) => {
      state.tenantId = tenantId;
      const client = renderPage();
      if (tenantId) {
        await waitFor(() =>
          expect(providerRequests()).toHaveLength(providers.length),
        );
      } else {
        expect(state.requests).toHaveLength(0);
        for (const provider of providers) {
          const query = findProviderQuery(client, provider);
          expect(query.isActive()).toBe(false);
          await query.fetch();
        }
      }

      for (const provider of providers) {
        const request = providerRequests().find(
          (request) =>
            new URL(request.url).searchParams.get("integration_type") ===
            `eq.${provider.type}`,
        );
        if (!request) {
          throw new Error(`Missing ${provider.type} request`);
        }
        const params = new URL(request.url).searchParams;
        expect(request.method).toBe("GET");
        expect(params.get("tenant_id")).toBe(`eq.${tenantId}`);
        expect(params.get("user_id")).toBe(
          provider.personal ? "eq.user-1" : null,
        );
        expect(params.get("select")).toBe(
          provider.type === "meta_whatsapp"
            ? "id,user_id,display_name,is_active,settings"
            : "*",
        );
        expect(params.get("order")).toBe(
          provider.type === "meta_whatsapp" ? "created_at.asc" : null,
        );
        expect(params.get("limit")).toBe(
          provider.type === "meta_whatsapp" ? "1" : null,
        );
        expect(findProviderQuery(client, provider).isActive()).toBe(!!tenantId);
      }
    },
  );

  it.each(providers)("propagates $type read errors", async (provider) => {
    state.tenantId = null;
    const client = renderPage();
    state.status = 403;
    await expect(
      findProviderQuery(client, provider).fetch(),
    ).rejects.toMatchObject({ code: "42501", message: "permission denied" });
  });

  it("retains the personal-provider user readiness guard", async () => {
    state.userId = null;
    const client = renderPage();
    await waitFor(() => expect(providerRequests()).toHaveLength(2));
    for (const provider of providers.filter((provider) => provider.personal)) {
      const query = findProviderQuery(client, provider);
      expect(query.isActive()).toBe(false);
      await expect(query.fetch()).resolves.toBeNull();
    }
    expect(providerRequests()).toHaveLength(2);
  });
});

/** Render the page with its real query observers and expose their isolated cache. */
function renderPage(): QueryClient {
  let client: QueryClient | undefined;
  /** Capture the same cache used by the page, including its disabled queries. */
  function CaptureClient() {
    client = useQueryClient();
    return null;
  }
  render(
    withTestQuery(
      <MemoryRouter>
        <CaptureClient />
        <ChatIntegrations />
      </MemoryRouter>,
    ),
  );
  if (!client) {
    throw new Error("Page query client was not mounted");
  }
  return client;
}

/** Locate the page-registered provider callback rather than rebuilding its query. */
function findProviderQuery(
  client: QueryClient,
  provider: (typeof providers)[number],
) {
  const queryKey = provider.personal
    ? [provider.key, state.tenantId, state.userId]
    : [provider.key, state.tenantId];
  const query = client.getQueryCache().find({ queryKey, exact: true });
  if (!query) {
    throw new Error(`Page did not register ${provider.type}`);
  }
  return query;
}

/** Exclude the page's unrelated permission and group requests. */
function providerRequests() {
  return state.requests.filter((request) =>
    new URL(request.url).searchParams.has("integration_type"),
  );
}
