import { createClient } from "@supabase/supabase-js";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Database,
  Tables,
  TablesUpdate,
} from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import { SocialContentGantt } from "./SocialContentGantt";

const state = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  success: vi.fn(),
  error: vi.fn(),
  invalidSelection: false,
}));

vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error },
}));
vi.mock("@/components/ui/select", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/ui/select")>();
  return {
    ...actual,
    Select: (props: ComponentProps<typeof actual.Select>) => (
      <actual.Select
        {...props}
        onValueChange={(value) =>
          props.onValueChange?.(
            state.invalidSelection ? "invalid_status" : value,
          )
        }
      />
    ),
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createClient<Database>("https://social.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => state.fetch(...args) },
  }),
}));

let row: Tables<"marketing_work_items">;
let rejectUpdate = false;
let updates: Array<{ url: URL; patch: TablesUpdate<"marketing_work_items"> }>;

beforeEach(() => {
  row = {
    id: "post-1",
    title: "Approval post",
    status: "draft",
    tenant_id: "tenant-1",
    pipeline_id: "pipeline-1",
    client_id: "client-1",
    payload: { channel: "instagram" },
    scheduled_date: null,
    current_stage_id: null,
    target_channel: "instagram",
    links: {},
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  rejectUpdate = false;
  state.invalidSelection = false;
  updates = [];
  state.success.mockReset();
  state.error.mockReset();
  state.fetch.mockReset().mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    expect(url.pathname).toBe("/rest/v1/marketing_work_items");
    if (request.method === "GET") {
      expect(url.searchParams.get("pipeline_id")).toBe("eq.pipeline-1");
      return response([{ ...row, marketing_pipeline_stages: null }]);
    }
    expect(request.method).toBe("PATCH");
    const patch: TablesUpdate<"marketing_work_items"> = await request.json();
    updates.push({ url, patch });
    if (
      rejectUpdate ||
      !Constants.public.Enums.marketing_item_status.some(
        (value) => value === patch.status,
      )
    ) {
      return response({ message: "status update rejected" }, 400);
    }
    row = { ...row, ...patch };
    return response(null);
  });
});

describe("SocialContentGantt approval persistence", () => {
  it("renders a persisted waiting_approval item with the approval style", async () => {
    row.status = "waiting_approval";
    const user = await showList();
    const badge = screen.getByText("לאישור");
    expect(badge).toHaveClass("text-amber-700", "bg-amber-50");
    await user.click(screen.getByRole("button", { name: "Approval post" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("combobox"),
    ).toHaveTextContent("לאישור");
    expect(updates).toEqual([]);
  });

  it.each([
    { label: "לאישור", status: "waiting_approval" },
    { label: "מאושר", status: "approved" },
  ])(
    "saves $label using its database value and refreshes the list",
    async ({ label, status }) => {
      await editStatus(label);
      await waitFor(() => expect(updates).toHaveLength(1));
      expect(updates[0]?.patch).toEqual({ status });
      expect(updates[0]?.url.searchParams.get("id")).toBe("eq.post-1");
      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(state.success).toHaveBeenCalledWith("עודכן");
      expect(state.error).not.toHaveBeenCalled();
    },
  );

  it("keeps the persisted status and shows error feedback after a rejected approval update", async () => {
    rejectUpdate = true;
    await editStatus("לאישור");
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith("שגיאה בעדכון"),
    );
    expect(updates[0]?.patch).toEqual({ status: "waiting_approval" });
    expect(screen.getByText("טיוטה")).toBeInTheDocument();
    expect(state.success).not.toHaveBeenCalled();
    expect(row.status).toBe("draft");
  });

  it("rejects a synthetic invalid selector payload locally without writing", async () => {
    // Normal Radix options are valid; inject drift only at their callback boundary.
    state.invalidSelection = true;
    await editStatus("לאישור");
    expect(state.error).toHaveBeenCalledWith("סטטוס לא תקין");
    expect(updates).toEqual([]);
    expect(state.success).not.toHaveBeenCalled();
    expect(row.status).toBe("draft");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

/** Render the actual Gantt and switch to its persisted status badges. */
async function showList() {
  const user = userEvent.setup();
  render(
    withTestQuery(
      <SocialContentGantt
        pipelineId="pipeline-1"
        tenantId="tenant-1"
        clientId="client-1"
      />,
    ),
  );
  await screen.findByRole("button", { name: "Approval post" });
  await user.click(screen.getByRole("button", { name: "רשימה" }));
  return user;
}

/** Select a status through the real detail dialog and submit its mutation. */
async function editStatus(label: string) {
  const user = await showList();
  await user.click(screen.getByRole("button", { name: "Approval post" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("combobox"));
  await user.click(screen.getByRole("option", { name: label }));
  await user.click(screen.getByRole("button", { name: "שמור שינויים" }));
}

/** Return a local SDK response; no hosted database or provider is contacted. */
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
