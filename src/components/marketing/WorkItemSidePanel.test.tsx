import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { WorkItemSidePanel } from "./WorkItemSidePanel";

const db = vi.hoisted(() => ({ updates: vi.fn() }));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-1" }),
}));
vi.mock("./CampaignLauncher", () => ({ CampaignLauncher: () => null }));
vi.mock("./SEOPublishPanel", () => ({ SEOPublishPanel: () => null }));
vi.mock("./ABTestPanel", () => ({ ABTestPanel: () => null }));
vi.mock("@/integrations/supabase/client", () => {
  const item = {
    id: "item-1",
    tenant_id: "tenant-1",
    pipeline_id: "pipeline-1",
    title: "Copy",
    status: "waiting_approval",
    payload: {},
    current_stage_id: "stage-1",
  };
  const stage = {
    id: "stage-1",
    name: "Copy",
    stage_type: "copy",
    sort_order: 1,
  };
  const rows: Record<string, Array<Record<string, unknown>>> = {
    marketing_work_items: [item],
    marketing_pipeline_stages: [stage],
    marketing_assets: [],
    marketing_runs: [
      {
        id: "run-1",
        stage_id: "stage-1",
        status: "awaiting_approval",
        created_at: "2026-11-01T00:00:00Z",
        marketing_pipeline_stages: stage,
      },
    ],
  };
  const from = (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      update: (patch: Record<string, unknown>) => {
        db.updates(table, patch);
        return query;
      },
      single: async () => ({ data: rows[table]?.[0], error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve),
    };
    return query;
  };
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    supabase: { from, channel: () => channel, removeChannel: vi.fn() },
  };
});

describe("WorkItemSidePanel final approval", () => {
  test("completes the run and saves the item with the database approved status", async () => {
    render(<WorkItemSidePanel itemId="item-1" onClose={vi.fn()} />, {
      wrapper: createTestQueryHarness().wrapper,
    });
    fireEvent.click(await screen.findByRole("button", { name: "אשר וסיים" }));
    await waitFor(() =>
      expect(db.updates).toHaveBeenCalledWith("marketing_work_items", {
        status: "approved",
      }),
    );
    expect(db.updates).toHaveBeenCalledWith("marketing_runs", {
      status: "completed",
    });
  });
});
