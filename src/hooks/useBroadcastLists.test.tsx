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
import { useBroadcastLists } from "./useBroadcastLists";

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

/** Exercise the real hook's enabled queries and explicit refetches. */
function Probe({ listId }: { listId: string | undefined }) {
  const { lists, useMembers, useRules } = useBroadcastLists();
  const members = useMembers(listId);
  const rules = useRules(listId);
  return (
    <button
      onClick={() => {
        void lists.refetch();
        void members.refetch();
        void rules.refetch();
      }}
    >
      Refetch
    </button>
  );
}

describe("broadcast list query request equivalence", () => {
  for (const table of [
    "broadcast_lists",
    "broadcast_list_members",
    "broadcast_list_rules",
  ]) {
    for (const id of ["id-1", null, undefined]) {
      it(`preserves ${table} SDK requests for ${id}`, async () => {
        for (const useFilter of [false, true]) {
          const query = client.from(table).select("*");
          const column = table === "broadcast_lists" ? "tenant_id" : "list_id";
          const filtered = useFilter
            ? query.filter(column, "eq", id)
            : query.eq(column, id);
          if (table !== "broadcast_list_rules") {
            filtered.order("created_at", { ascending: false });
          }
          if (table === "broadcast_list_members") filtered.limit(1000);
          const { error } = await filtered;
          expect(error).toBeNull();
        }
        expect(requests).toHaveLength(2);
        const [before, after] = requests;
        expect(after.url).toBe(before.url);
        expect(after.method).toBe(before.method);
        expect([...after.headers]).toEqual([...before.headers]);
        expect(await after.text()).toBe(await before.text());
      });
    }
  }

  for (const enabled of [true, false]) {
    it(`preserves ${enabled ? "enabled" : "disabled"} reads and manual refetch`, async () => {
      context.tenantId = enabled ? "tenant-1" : null;
      render(withTestQuery(<Probe listId={enabled ? "list-1" : undefined} />));
      if (enabled) {
        await waitFor(() => expect(requests).toHaveLength(3));
      } else {
        expect(requests).toHaveLength(0);
      }
      requests.length = 0;
      fireEvent.click(screen.getByRole("button", { name: "Refetch" }));
      await waitFor(() => expect(requests).toHaveLength(3));
      const urls = requests.map((request) => new URL(request.url));
      expect(urls.map((url) => url.pathname)).toEqual([
        "/rest/v1/broadcast_lists",
        "/rest/v1/broadcast_list_members",
        "/rest/v1/broadcast_list_rules",
      ]);
      expect(urls[0].searchParams.get("tenant_id")).toBe(
        enabled ? "eq.tenant-1" : "eq.null",
      );
      for (const url of urls.slice(1)) {
        expect(url.searchParams.get("list_id")).toBe(
          enabled ? "eq.list-1" : "eq.undefined",
        );
      }
      expect(urls[0].searchParams.get("order")).toBe("created_at.desc");
      expect(urls[1].searchParams.get("order")).toBe("created_at.desc");
      expect(urls[1].searchParams.get("limit")).toBe("1000");
    });
  }
});
