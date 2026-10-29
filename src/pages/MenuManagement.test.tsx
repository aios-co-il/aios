import { createClient } from "@supabase/supabase-js";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { cloneElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import MenuManagement from "./MenuManagement";

const state = vi.hoisted<{
  tenantId: string | null;
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
  writeStatus: number;
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
}>(() => ({
  tenantId: "tenant-1",
  fetch: vi.fn<typeof fetch>(),
  writeStatus: 200,
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error },
}));

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
  state.tenantId = "tenant-1";
  state.writeStatus = 200;
  state.success.mockReset();
  state.error.mockReset();
  state.fetch.mockReset();
  state.fetch.mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const write =
      request.method === "POST" &&
      new URL(request.url).pathname === "/rest/v1/menu_items";
    return new Response(
      write && state.writeStatus !== 200
        ? JSON.stringify({ message: "menu write failed", code: "23514" })
        : "[]",
      {
        status: write ? state.writeStatus : 200,
        headers: { "content-type": "application/json" },
      },
    );
  });
});

describe("MenuManagement add-item tenant boundary", () => {
  it("creates with the selected tenant and existing defaults, then refreshes and resets", async () => {
    renderMenu();
    const user = await fillMenu();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "הוסף" }));
    await waitFor(() =>
      expect(state.success).toHaveBeenCalledWith("פריט תפריט נוסף"),
    );
    const writes = menuWrites();
    expect(writes).toHaveLength(1);
    expect(await writes[0].json()).toEqual({
      tenant_id: "tenant-1",
      menu_key: "new-agents",
      original_label: "New Agents",
      route: "/t/acme/agents",
      icon: "Zap",
      is_visible: true,
      sort_order: 1,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["menu-items", "tenant-1"],
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "פריט חדש" }));
    expect(screen.getByPlaceholderText("למשל: סוכנים")).toHaveValue("");
    expect(state.error).not.toHaveBeenCalled();
  });

  it("rejects a synthetic direct-page tenant loss without writing or clearing the filled dialog", async () => {
    const view = renderMenu();
    const user = await fillMenu();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    state.tenantId = null;
    // Synthetic cache data keeps the filled dialog mounted for this boundary test.
    queryClient.setQueryData(["menu-items", null], []);
    view.rerenderTenant();
    state.fetch.mockClear();
    await user.click(screen.getByRole("button", { name: "הוסף" }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith("שגיאה: לא נבחר ארגון (tenant)"),
    );
    expect(menuWrites()).toHaveLength(0);
    expect(state.success).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("למשל: סוכנים")).toHaveValue(
      "New Agents",
    );
    expect(screen.getByPlaceholderText("למשל: /t/{tenant}/agents")).toHaveValue(
      "/t/acme/agents",
    );
  });

  it("keeps backend rejection feedback and entered values without success or invalidation", async () => {
    state.writeStatus = 400;
    renderMenu();
    const user = await fillMenu();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "הוסף" }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith("שגיאה: menu write failed"),
    );
    expect(menuWrites()).toHaveLength(1);
    expect(state.success).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("למשל: סוכנים")).toHaveValue(
      "New Agents",
    );
    expect(screen.getByPlaceholderText("למשל: /t/{tenant}/agents")).toHaveValue(
      "/t/acme/agents",
    );
  });
});

/** Keep the actual page's state and query provider when simulating tenant changes. */
function renderMenu() {
  const page = () => (
    <>
      <QueryProbe />
      <MenuManagement />
    </>
  );
  const wrapped = withTestQuery(page());
  const view = render(wrapped);
  return {
    ...view,
    rerenderTenant: () =>
      view.rerender(cloneElement(wrapped, undefined, page())),
  };
}

/** Fill the actual Radix add dialog using user-level interactions. */
async function fillMenu() {
  const user = userEvent.setup();
  await waitFor(() =>
    expect(
      queryClient.getQueryCache().find({ queryKey: ["menu-items", "tenant-1"] })
        ?.state.status,
    ).toBe("success"),
  );
  await user.click(screen.getByRole("button", { name: "פריט חדש" }));
  await user.type(screen.getByPlaceholderText("למשל: סוכנים"), "New Agents");
  await user.type(
    screen.getByPlaceholderText("למשל: /t/{tenant}/agents"),
    "/t/acme/agents",
  );
  return user;
}

/** Read only captured menu inserts, excluding read-only settings RPC requests. */
function menuWrites() {
  return state.fetch.mock.calls
    .map(([input, init]) => new Request(input, init))
    .filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname === "/rest/v1/menu_items",
    );
}

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
