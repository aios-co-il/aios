import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { describe, expect, it, vi } from "vitest";

describe("SiteAnalytics tenant filter request equivalence", () => {
  for (const tenantId of ["tenant-1", null]) {
    it(`preserves the existing request for tenant ${tenantId}`, async () => {
      const fetch = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response("[]"),
      );
      const client = createClient<Database>(
        "https://analytics.test",
        "test-publishable-key",
        { global: { fetch } },
      );
      const cases = [
        ["clients", "id,name,website"],
        ["site_tracking_configs", "*,clients:client_id(id,name)"],
        ["site_visitors", "*"],
        ["site_sessions", "*"],
        ["site_pageviews", "*"],
        ["site_events", "*"],
      ] as const;

      for (const [table, columns] of cases) {
        const original = client.from(table).select(columns);
        // Invoke the old API with its actual nullable runtime input.
        Reflect.apply(original.eq, original, ["tenant_id", tenantId]);
        await original;
        const revised = client
          .from(table)
          .select(columns)
          .filter("tenant_id", "eq", tenantId);
        await revised;

        const oldCall = fetch.mock.calls[fetch.mock.calls.length - 2];
        const newCall = fetch.mock.calls[fetch.mock.calls.length - 1];
        expect(newCall).toEqual(oldCall);
      }
    });
  }
});
