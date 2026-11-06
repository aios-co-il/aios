import { createClient } from "@supabase/supabase-js";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import MenuManagement from "./MenuManagement";

const state = vi.hoisted<{
  tenantId: string | null;
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
}>(() => ({ tenantId: "tenant-1", fetch: vi.fn<typeof fetch>() }));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: state.tenantId }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createClient<Database>("https://menu.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => state.fetch(...args) },
  }),
}));

let queryClient: QueryClient;

/** Observe the real page query for manual refetch while disabled. */
function QueryProbe() {
  queryClient = useQueryClient();
  return null;
}

beforeEach(() => {
  state.fetch.mockReset();
  state.fetch.mockImplementation(
    async () =>
      new Response("[]", { headers: { "content-type": "application/json" } }),
  );
});

afterEach(cleanup);

describe("MenuManagement tenant query", () => {
  it.each(["tenant-1", null, ""])(
    "preserves enabled state and SDK requests for %s",
    async (tenantId) => {
      state.tenantId = tenantId;
      render(
        withTestQuery(
          <>
            <QueryProbe />
            <MenuManagement />
          </>,
        ),
      );
      const query = queryClient.getQueryCache().find({
        queryKey: ["menu-items", tenantId],
      });
      expect(query).toBeDefined();
      if (!query) {
        throw new Error("Missing menu-items query");
      }
      expect(query.isDisabled()).toBe(!tenantId);
      if (tenantId) {
        await waitFor(() => expect(query.state.status).toBe("success"));
      } else {
        expect(state.fetch).not.toHaveBeenCalled();
        await act(async () => {
          await query.fetch();
        });
      }
      const calls = state.fetch.mock.calls.filter(([input]) =>
        String(input).includes("/rest/v1/menu_items?"),
      );
      expect(calls).toHaveLength(1);
      const [input, init] = calls[0];
      const request = new Request(input, init);
      expect(request.method).toBe("GET");
      expect(await request.text()).toBe("");
      const url = new URL(request.url);
      expect(url.pathname).toBe("/rest/v1/menu_items");
      expect([...url.searchParams.entries()]).toEqual([
        ["select", "*"],
        ["tenant_id", `eq.${tenantId}`],
        ["order", "sort_order.asc"],
      ]);
      expect(query.state.data).toEqual([]);
    },
  );
});
