import { createClient } from "@supabase/supabase-js";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { useBroadcasts } from "./useBroadcasts";

const context = vi.hoisted((): { tenantId: string | null } => ({
  tenantId: "tenant-1",
}));
const requests: Request[] = [];
const client = createClient("https://example.com", "test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return new Response("[]", {
        headers: { "content-type": "application/json" },
      });
    },
  },
});

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return client;
  },
}));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => context,
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-1" }),
}));

afterEach(() => {
  cleanup();
  requests.length = 0;
});

/** Exercise the actual hook's enabled query and explicit refetch. */
function Probe() {
  const { list } = useBroadcasts();
  return <button onClick={() => void list.refetch()}>Refetch</button>;
}

describe("broadcast list tenant filter", () => {
  for (const tenantId of ["tenant-1", "", null, undefined]) {
    it(`preserves the SDK request for ${tenantId}`, async () => {
      for (const useFilter of [false, true]) {
        const query = client.from("broadcasts").select("*");
        const filtered = useFilter
          ? query.filter("tenant_id", "eq", tenantId)
          : query.eq("tenant_id", tenantId);
        const { error } = await filtered.order("created_at", {
          ascending: false,
        });
        expect(error).toBeNull();
      }
      expect(requests).toHaveLength(2);
      const [before, after] = requests;
      expect(after.url).toBe(before.url);
      expect(after.method).toBe(before.method);
      expect([...after.headers]).toEqual([...before.headers]);
      expect(await after.text()).toBe(await before.text());
      expect(new URL(after.url).searchParams.get("tenant_id")).toBe(
        `eq.${tenantId}`,
      );
    });
  }

  for (const tenantId of ["tenant-1", "", null]) {
    it(`preserves enabled and explicit refetch behavior for ${tenantId}`, async () => {
      context.tenantId = tenantId;
      render(withTestQuery(<Probe />));
      if (tenantId) {
        await waitFor(() => expect(requests).toHaveLength(1));
      } else {
        expect(requests).toHaveLength(0);
      }
      requests.length = 0;
      fireEvent.click(screen.getByRole("button", { name: "Refetch" }));
      await waitFor(() => expect(requests).toHaveLength(1));
      const url = new URL(requests[0].url);
      expect(url.pathname).toBe("/rest/v1/broadcasts");
      expect(url.searchParams.get("select")).toBe("*");
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${tenantId}`);
      expect(url.searchParams.get("order")).toBe("created_at.desc");
    });
  }
});
