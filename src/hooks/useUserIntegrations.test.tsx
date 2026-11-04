import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
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
        select: () => query,
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
  it.each(["google_search_console", "meta_whatsapp"])(
    "rejects invalid IDs before exposing %s rows to any consumer",
    async (type) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      /** Give the hook an isolated cache without replacing its query function. */
      function Wrapper({ children }: PropsWithChildren) {
        return (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );
      }
      const { result } = renderHook(
        () => useUserIntegrations("tenant-1", type),
        { wrapper: Wrapper },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.map((row) => row.id)).toEqual(
        type === "google_search_console"
          ? ["valid"]
          : ["valid", "shared-valid"],
      );
      expect(console.error).toHaveBeenCalledTimes(
        type === "google_search_console" ? 1 : 2,
      );
      expect(console.error).toHaveBeenCalledWith(
        "Ignoring integration with an invalid id",
      );
      client.clear();
    },
  );

  it("keeps the tenant fallback available when a malformed personal ID has a matching site", async () => {
    mocks.own = [{ ...fixture, id: 42 }];
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    /** Exercise the real integration and fallback hooks in one cache. */
    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    }
    const { result } = renderHook(
      () =>
        useResolvedGscIntegration({
          clientId: "client-1",
          tenantIds: ["tenant-1"],
          expectedDomain: "example.com",
        }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.integrationId).toBe("fallback"));
    expect(result.current.isFallback).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith(
      "resolve-seo-gsc-integration",
      expect.objectContaining({
        body: expect.objectContaining({
          clientId: "client-1",
          tenantIds: ["tenant-1"],
        }),
      }),
    );
    client.clear();
  });
});
