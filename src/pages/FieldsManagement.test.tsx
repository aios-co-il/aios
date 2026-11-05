import { cloneElement } from "react";
import userEvent from "@testing-library/user-event";
import { createClient } from "@supabase/supabase-js";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import FieldsManagement from "./FieldsManagement";

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

let queryClient: QueryClient;

/** Observe the real page query for manual refetch while disabled. */
function QueryProbe() {
  queryClient = useQueryClient();
  return null;
}

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

describe("FieldsManagement tenant query", () => {
  it.each(["tenant-1", null, ""])(
    "preserves enabled state and SDK requests for %s",
    async (tenantId) => {
      state.tenantId = tenantId;
      render(
        withTestQuery(
          <>
            <QueryProbe />
            <FieldsManagement />
          </>,
        ),
      );
      const query = queryClient.getQueryCache().find({
        queryKey: ["custom-fields", tenantId, "task"],
      });
      expect(query).toBeDefined();
      if (!query) {
        throw new Error("Missing custom-fields query");
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
      expect(state.fetch).toHaveBeenCalledTimes(1);
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
      expect(query.state.data).toEqual([]);
    },
  );
});

/** Fill the actual add dialog and retain its provider across a synthetic tenant transition. */
async function fillNewField() {
  const user = userEvent.setup();
  const page = () => (
    <>
      <QueryProbe />
      <FieldsManagement />
    </>
  );
  const wrapped = withTestQuery(page());
  const view = render(wrapped);
  await waitFor(() =>
    expect(
      queryClient.getQueryState(["custom-fields", "tenant-1", "task"])?.status,
    ).toBe("success"),
  );
  await user.click(screen.getByRole("button", { name: "הוסף שדה" }));
  await user.type(
    screen.getByLabelText("מזהה שדה (באנגלית) *"),
    "priority_label",
  );
  await user.type(screen.getByLabelText("תווית שדה *"), "Priority label");
  return {
    user,
    rerender: () => view.rerender(cloneElement(wrapped, undefined, page())),
  };
}

/** Collect only write requests without altering the real SDK boundary. */
function posts() {
  return state.fetch.mock.calls
    .map(([input, init]) => new Request(input, init))
    .filter((request) => request.method === "POST");
}

describe("FieldsManagement tenant-safe creation", () => {
  it("creates the exact ready-tenant field and refreshes its list", async () => {
    const { user } = await fillNewField();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "שמור שדה" }));
    await waitFor(() =>
      expect(state.success).toHaveBeenCalledWith("שדה נוסף בהצלחה"),
    );
    expect(posts()).toHaveLength(1);
    const request = posts()[0];
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
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["custom-fields", "tenant-1"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["custom-field-labels", "tenant-1"],
    });
    await screen.findByText("Priority label");
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
    expect(posts()).toHaveLength(1);
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("תווית שדה *")).toHaveValue("Priority label");
  });
});
