import { createClient } from "@supabase/supabase-js";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import SiteAnalytics from "./SiteAnalytics";

const state = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  fetch: vi.fn<typeof globalThis.fetch>(),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenantId: state.tenantId }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createClient<Database>("https://analytics.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => state.fetch(...args) },
  }),
}));
vi.mock("@/components/analytics/AnalyticsDashboard", () => ({
  AnalyticsDashboard: () => null,
}));
vi.mock("@/components/analytics/TrackingCodeGenerator", () => ({
  TrackingCodeGenerator: () => null,
}));
vi.mock("@/components/analytics/ImportAnalyticsDialog", () => ({
  ImportAnalyticsDialog: () => null,
}));
vi.mock("@/components/analytics/DateRangeFilter", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/analytics/DateRangeFilter")
  >()),
  DateRangeFilter: () => null,
}));

const tables = [
  "clients",
  "site_tracking_configs",
  "site_visitors",
  "site_sessions",
  "site_pageviews",
  "site_events",
];
let queryClient: QueryClient;

/** Read the tested provider's cache without replacing production query hooks. */
function QueryCacheProbe() {
  queryClient = useQueryClient();
  return null;
}

/** Render the page with isolated real React Query scheduling. */
function renderPage() {
  return render(
    withTestQuery(
      <>
        <QueryCacheProbe />
        <SiteAnalytics />
      </>,
    ),
  );
}

/** Return real SDK responses without contacting any backend. */
function queryResponse(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: RequestInit,
) {
  return new Response(init?.method === "HEAD" ? null : "[]", {
    headers: {
      "content-type": "application/json",
      "content-range": "0-6/7",
    },
  });
}

beforeEach(() => {
  state.tenantId = "tenant-1";
  state.fetch.mockReset();
  state.fetch.mockImplementation(async (...args) => queryResponse(...args));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-07T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SiteAnalytics page-issued tenant queries", () => {
  for (const tenantId of ["tenant-1", null]) {
    it(`preserves six query requests and enabled state for ${tenantId}`, async () => {
      state.tenantId = tenantId;
      renderPage();
      await waitFor(() =>
        expect(queryClient.getQueryCache().getAll()).toHaveLength(3),
      );
      const queries = queryClient.getQueryCache().getAll();
      expect(queries.map((query) => query.isDisabled())).toEqual([
        !tenantId,
        !tenantId,
        !tenantId,
      ]);
      if (tenantId === null) {
        expect(state.fetch).not.toHaveBeenCalled();
        await act(async () => {
          await Promise.all(queries.map((query) => query.fetch()));
        });
      }
      await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(6));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const urls = state.fetch.mock.calls.map(
        ([input]) => new URL(String(input)),
      );
      expect(urls.map((url) => url.pathname.split("/").pop()).sort()).toEqual(
        [...tables].sort(),
      );
      for (const [input, init] of state.fetch.mock.calls) {
        const url = new URL(String(input));
        const table = url.pathname.split("/").pop();
        expect(url.origin).toBe("https://analytics.test");
        expect(url.searchParams.get("tenant_id")).toBe(`eq.${tenantId}`);
        expect(init?.method).toBe(
          table === "clients" || table === "site_tracking_configs"
            ? "GET"
            : "HEAD",
        );
        expect(init?.body).toBeUndefined();
        if (table === "clients") {
          expect(url.search).toBe(
            `?select=id%2Cname%2Cwebsite&tenant_id=eq.${tenantId}&order=name.asc`,
          );
        } else if (table === "site_tracking_configs") {
          expect(url.search).toBe(
            `?select=*%2Cclients%3Aclient_id%28id%2Cname%29&tenant_id=eq.${tenantId}&order=created_at.desc`,
          );
        } else {
          expect(url.searchParams.get("select")).toBe("*");
          expect(new Headers(init?.headers).get("prefer")).toBe("count=exact");
          const dateColumn =
            table === "site_sessions"
              ? "started_at"
              : table === "site_pageviews"
                ? "viewed_at"
                : "occurred_at";
          expect(url.searchParams.size).toBe(table === "site_visitors" ? 2 : 3);
          if (table !== "site_visitors") {
            expect(url.searchParams.get(dateColumn)).toBe(
              `gte.${today.toISOString()}`,
            );
          }
        }
      }
      await waitFor(() =>
        expect(queries.every((query) => query.state.status === "success")).toBe(
          true,
        ),
      );
      expect(
        queryClient.getQueryData(["analytics_stats", tenantId, ""]),
      ).toEqual({
        totalVisitors: 7,
        sessionsToday: 7,
        pageviewsToday: 7,
        eventsToday: 7,
      });
    });
  }

  it.each(["clients", "site_tracking_configs"])(
    "retains %s query errors",
    async (table) => {
      state.fetch.mockImplementation(async (input, init) =>
        String(input).includes(`/rest/v1/${table}?`)
          ? new Response(
              JSON.stringify({ message: "read failed", code: "42501" }),
              {
                status: 403,
                headers: { "content-type": "application/json" },
              },
            )
          : queryResponse(input, init),
      );
      renderPage();
      await waitFor(() =>
        expect(queryClient.getQueryState([table, state.tenantId])?.status).toBe(
          "error",
        ),
      );
      expect(
        queryClient.getQueryState([table, state.tenantId])?.error,
      ).toMatchObject({
        message: "read failed",
        code: "42501",
      });
    },
  );
});
