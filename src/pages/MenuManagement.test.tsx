import { createClient } from "@supabase/supabase-js";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { createTestQueryHarness } from "@/test/withTestQuery";
import MenuManagement from "./MenuManagement";

const state = vi.hoisted<{
  tenantId: string | null;
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
  writeStatus: number;
  created: boolean;
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
}>(() => ({
  tenantId: "tenant-1",
  fetch: vi.fn<typeof fetch>(),
  writeStatus: 200,
  created: false,
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

const createdMenuItem = {
  id: "menu-1",
  tenant_id: "tenant-1",
  menu_key: "new-agents",
  original_label: "New Agents",
  custom_label: null,
  route: "/t/acme/agents",
  icon: "Zap",
  is_visible: true,
  sort_order: 1,
};

beforeEach(() => {
  state.tenantId = "tenant-1";
  state.writeStatus = 200;
  state.created = false;
  state.success.mockReset();
  state.error.mockReset();
  state.fetch.mockReset();
  state.fetch.mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const write =
      request.method === "POST" &&
      new URL(request.url).pathname === "/rest/v1/menu_items";
    if (write && state.writeStatus === 200) {
      state.created = true;
    }
    return new Response(
      JSON.stringify(
        write && state.writeStatus !== 200
          ? { message: "menu write failed", code: "23514" }
          : state.created
            ? [createdMenuItem]
            : [],
      ),
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
    await user.click(screen.getByRole("button", { name: "הוסף" }));
    await waitFor(() =>
      expect(state.success).toHaveBeenCalledWith("פריט תפריט נוסף"),
    );
    const writes = menuRequests("POST");
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
    await screen.findByText("New Agents");
    const reads = menuRequests("GET");
    expect(reads).toHaveLength(2);
    expect(
      reads.map((entry) => new URL(entry.url).searchParams.get("tenant_id")),
    ).toEqual(["eq.tenant-1", "eq.tenant-1"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "פריט חדש" }));
    expect(screen.getByPlaceholderText("למשל: סוכנים")).toHaveValue("");
    expect(state.error).not.toHaveBeenCalled();
  });

  it("rejects a synthetic direct-page tenant loss without writing or clearing the filled dialog", async () => {
    const view = renderMenu();
    const user = await fillMenu();
    state.tenantId = null;
    // Synthetic cache data keeps the filled dialog mounted for this boundary test.
    view.queryClient.setQueryData(["menu-items", null], []);
    view.rerenderTenant();
    state.fetch.mockClear();
    await user.click(screen.getByRole("button", { name: "הוסף" }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith("שגיאה: לא נבחר ארגון (tenant)"),
    );
    expect(menuRequests("POST")).toHaveLength(0);
    expect(state.success).not.toHaveBeenCalled();
    expect(menuRequests("GET")).toHaveLength(0);
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
    await user.click(screen.getByRole("button", { name: "הוסף" }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith("שגיאה: menu write failed"),
    );
    expect(menuRequests("POST")).toHaveLength(1);
    expect(state.success).not.toHaveBeenCalled();
    expect(menuRequests("GET")).toHaveLength(1);
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
  const { queryClient, wrapper } = createTestQueryHarness();
  const view = render(<MenuManagement />, { wrapper });
  return {
    queryClient,
    rerenderTenant: () => view.rerender(<MenuManagement />),
  };
}

/** Fill the actual Radix add dialog using user-level interactions. */
async function fillMenu() {
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "פריט חדש" });
  await user.click(screen.getByRole("button", { name: "פריט חדש" }));
  await user.type(screen.getByPlaceholderText("למשל: סוכנים"), "New Agents");
  await user.type(
    screen.getByPlaceholderText("למשל: /t/{tenant}/agents"),
    "/t/acme/agents",
  );
  return user;
}

/** Read only requests for menu rows, excluding read-only settings RPC requests. */
function menuRequests(method: string) {
  return state.fetch.mock.calls
    .map(([input, init]) => new Request(input, init))
    .filter(
      (request) =>
        request.method === method &&
        new URL(request.url).pathname === "/rest/v1/menu_items",
    );
}

afterEach(cleanup);

describe("MenuManagement SDK read contract", () => {
  it("automatically reads the selected tenant's menu", async () => {
    renderMenu();
    await screen.findByRole("button", { name: "פריט חדש" });
    await expectMenuRead("tenant-1");
  });

  it.each([null, ""])(
    "preserves the existing explicit-fetch request for unavailable tenant %s",
    async (tenantId) => {
      state.tenantId = tenantId;
      const { queryClient } = renderMenu();
      expect(menuRequests("GET")).toHaveLength(0);
      await act(async () => {
        await expect(
          queryClient.fetchQuery({ queryKey: ["menu-items", tenantId] }),
        ).resolves.toEqual([]);
      });
      await expectMenuRead(tenantId);
    },
  );
});

/** Check requests emitted by the actual mounted page's query. */
async function expectMenuRead(tenantId: string | null) {
  const calls = menuRequests("GET");
  expect(calls).toHaveLength(1);
  const request = calls[0];
  expect(await request.text()).toBe("");
  const url = new URL(request.url);
  expect([...url.searchParams.entries()]).toEqual([
    ["select", "*"],
    ["tenant_id", `eq.${tenantId}`],
    ["order", "sort_order.asc"],
  ]);
}
