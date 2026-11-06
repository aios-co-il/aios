import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

const mocks = vi.hoisted(() => ({
  queries: [] as Array<{ queryFn: () => Promise<unknown>; enabled: boolean }>,
  requests: [] as Array<string>,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: (options: {
    queryFn: () => Promise<unknown>;
    enabled: boolean;
  }) => {
    mocks.queries.push(options);
    return { data: undefined, isLoading: false };
  },
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://example.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input: RequestInfo | URL) => {
          mocks.requests.push(String(input));
          return new Response("[]", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    }),
  };
});

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));

afterEach(() => {
  cleanup();
  mocks.queries.length = 0;
  mocks.requests.length = 0;
});

describe("AnalyticsDashboard tenant filters", () => {
  it.each(["tenant-id", null])(
    "retains enabled decisions and eq.%s on manual query execution",
    async (tenantId) => {
      const range = {
        start: new Date("2026-01-01T00:00:00Z"),
        end: new Date("2026-01-07T00:00:00Z"),
      };
      render(
        withTestQuery(
          <AnalyticsDashboard
            tenantId={tenantId}
            dateRange={range}
            comparisonRange={range}
            compareEnabled
          />,
        ),
      );
      expect(mocks.queries.map((query) => query.enabled)).toEqual(
        Array.from({ length: 4 }, () => !!tenantId),
      );
      expect(mocks.requests).toHaveLength(0);
      for (const query of mocks.queries) {
        await query.queryFn();
      }
      expect(mocks.requests).toHaveLength(4);
      expect(
        mocks.requests.map((url) => new URL(url).searchParams.get("tenant_id")),
      ).toEqual(Array.from({ length: 4 }, () => `eq.${tenantId}`));
    },
  );
});
