import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

describe("dashboard supplier campaigner filter requests", () => {
  for (const campaignerId of ["campaigner-1", "", null, undefined]) {
    it(`preserves the request for ${campaignerId}`, async () => {
      const requests: Array<Request> = [];
      const client = createClient("https://example.com", "test-key", {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          storageKey: `dashboard-filter-${campaignerId}`,
        },
        global: {
          fetch: async (input, init) => {
            requests.push(new Request(input, init));
            return new Response("[]", {
              headers: { "content-type": "application/json" },
            });
          },
        },
      });

      for (const useFilter of [false, true]) {
        const query = client
          .from("tasks")
          .select("*")
          .eq("tenant_id", "tenant-1")
          .eq("status", "open")
          .eq("agency_id", "agency-1")
          .eq("client_id", "client-1");
        const filtered = useFilter
          ? query.filter("campaigner_id", "eq", campaignerId)
          : query.eq("campaigner_id", campaignerId);
        const { error } = await filtered;
        expect(error).toBeNull();
      }

      expect(requests).toHaveLength(2);
      const [before, after] = requests;
      expect(after.url).toBe(before.url);
      expect(after.method).toBe(before.method);
      expect([...after.headers]).toEqual([...before.headers]);
      expect(await after.text()).toBe(await before.text());
      const params = new URL(after.url).searchParams;
      expect(params.get("campaigner_id")).toBe(`eq.${campaignerId}`);
      expect(params.get("tenant_id")).toBe("eq.tenant-1");
      expect(params.get("status")).toBe("eq.open");
      expect(params.get("agency_id")).toBe("eq.agency-1");
      expect(params.get("client_id")).toBe("eq.client-1");
    });
  }
});
