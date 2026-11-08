import userEvent from "@testing-library/user-event";
import { createClient } from "@supabase/supabase-js";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { createTestQueryHarness } from "@/test/withTestQuery";
import FieldsManagement from "./FieldsManagement";
import { useCustomFieldLabels } from "@/hooks/useCustomFieldLabels";

const state = vi.hoisted<{
  tenantId: string | null;
  postStatus: number;
  created: boolean;
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
}>(() => ({
  tenantId: "tenant-1",
  postStatus: 201,
  created: false,
  success: vi.fn(),
  error: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error },
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: state.tenantId }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createClient<Database>("https://fields.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => state.fetch(...args) },
  }),
}));

const createdField = {
  id: "field-1",
  entity_type: "task",
  field_key: "priority_label",
  field_label: "Priority label",
  field_type: "text",
  is_required: false,
  is_visible: true,
  options: null,
  sort_order: 1,
};

beforeEach(() => {
  state.tenantId = "tenant-1";
  state.postStatus = 201;
  state.created = false;
  state.success.mockReset();
  state.error.mockReset();
  state.fetch.mockReset().mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const posting = request.method === "POST";
    if (posting && state.postStatus < 400) {
      state.created = true;
    }
    return new Response(
      JSON.stringify(
        posting
          ? state.postStatus >= 400
            ? { message: "write failed", code: "XX000" }
            : createdField
          : state.created
            ? [createdField]
            : [],
      ),
      {
        status: posting ? state.postStatus : 200,
        headers: { "content-type": "application/json" },
      },
    );
  });
});

afterEach(cleanup);

describe("FieldsManagement SDK read contract", () => {
  it("automatically reads the selected tenant's fields", async () => {
    renderFields();
    await waitFor(() => expect(state.fetch).toHaveBeenCalledOnce());
    await expectFieldRead("tenant-1");
  });

  it.each([null, ""])(
    "preserves the existing explicit-fetch request for unavailable tenant %s",
    async (tenantId) => {
      state.tenantId = tenantId;
      const { queryClient } = renderFields();
      expect(state.fetch).not.toHaveBeenCalled();
      await act(async () => {
        await expect(
          queryClient.fetchQuery({
            queryKey: ["custom-fields", tenantId, "task"],
          }),
        ).resolves.toEqual([]);
      });
      expect(state.fetch).toHaveBeenCalledOnce();
      await expectFieldRead(tenantId);
    },
  );
});

/** Keep each page instance and query client stable across tenant transitions. */
function renderFields() {
  const { queryClient, wrapper } = createTestQueryHarness();
  const view = render(<FieldsManagement />, { wrapper });
  return {
    queryClient,
    wrapper,
    rerenderTenant: () => view.rerender(<FieldsManagement />),
  };
}

/** Check the request emitted by the actual mounted page's query. */
async function expectFieldRead(tenantId: string | null) {
  const [input, init] = state.fetch.mock.calls[0];
  const request = new Request(input, init);
  expect(request.method).toBe("GET");
  expect(await request.text()).toBe("");
  const url = new URL(request.url);
  expect(url.pathname).toBe("/rest/v1/custom_fields");
  expect([...url.searchParams.entries()]).toEqual([
    ["select", "*"],
    ["tenant_id", `eq.${tenantId}`],
    ["entity_type", "eq.task"],
    ["order", "sort_order.asc"],
  ]);
}

/** Fill the actual add dialog and retain its provider across a synthetic tenant transition. */
async function fillNewField() {
  const user = userEvent.setup();
  const view = renderFields();
  await waitFor(() => expect(state.fetch).toHaveBeenCalledOnce());
  await user.click(screen.getByRole("button", { name: "הוסף שדה" }));
  await user.type(
    screen.getByLabelText("מזהה שדה (באנגלית) *"),
    "priority_label",
  );
  await user.type(screen.getByLabelText("תווית שדה *"), "Priority label");
  return {
    user,
    wrapper: view.wrapper,
    rerender: view.rerenderTenant,
  };
}

/** Collect only write requests without altering the real SDK boundary. */
function fieldRequests(method: string) {
  return state.fetch.mock.calls
    .map(([input, init]) => new Request(input, init))
    .filter((request) => request.method === method);
}

describe("FieldsManagement tenant-safe creation", () => {
  it("creates the exact ready-tenant field and refreshes its list", async () => {
    const { user, wrapper } = await fillNewField();
    const { result: labels } = renderHook(() => useCustomFieldLabels("task"), {
      wrapper,
    });
    await waitFor(() => expect(labels.current.isLoading).toBe(false));
    expect(labels.current.fieldLabels).toEqual({});
    await user.click(screen.getByRole("button", { name: "שמור שדה" }));
    await waitFor(() =>
      expect(state.success).toHaveBeenCalledWith("שדה נוסף בהצלחה"),
    );
    expect(fieldRequests("POST")).toHaveLength(1);
    const request = fieldRequests("POST")[0];
    expect(new URL(request.url).pathname).toBe("/rest/v1/custom_fields");
    expect(await request.json()).toEqual({
      entity_type: "task",
      field_key: "priority_label",
      field_label: "Priority label",
      field_type: "text",
      is_required: false,
      is_visible: true,
      tenant_id: "tenant-1",
      sort_order: 1,
    });
    await screen.findByText("Priority label");
    await waitFor(() =>
      expect(labels.current.getFieldLabel("priority_label")).toBe(
        "Priority label",
      ),
    );
    const reads = fieldRequests("GET");
    expect(reads).toHaveLength(4);
    expect(
      reads.map((entry) => new URL(entry.url).searchParams.get("tenant_id")),
    ).toEqual(Array(4).fill("eq.tenant-1"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.error).not.toHaveBeenCalled();
  });

  it("rejects a synthetic direct-page tenant loss without writing or clearing the dialog", async () => {
    const { user, rerender } = await fillNewField();
    state.tenantId = null;
    rerender();
    state.fetch.mockClear();
    await user.click(screen.getByRole("button", { name: "שמור שדה" }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith(
        "שגיאה בהוספת שדה: לא נבחר ארגון (tenant)",
      ),
    );
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("מזהה שדה (באנגלית) *")).toHaveValue(
      "priority_label",
    );
    expect(screen.getByLabelText("תווית שדה *")).toHaveValue("Priority label");
  });

  it("keeps entered fields and error feedback after a ready-tenant backend rejection", async () => {
    const { user } = await fillNewField();
    state.postStatus = 400;
    await user.click(screen.getByRole("button", { name: "שמור שדה" }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith(
        "שגיאה בהוספת שדה: write failed",
      ),
    );
    expect(fieldRequests("POST")).toHaveLength(1);
    expect(fieldRequests("GET")).toHaveLength(1);
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("תווית שדה *")).toHaveValue("Priority label");
  });
});
