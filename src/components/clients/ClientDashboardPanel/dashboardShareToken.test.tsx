import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import {
  type FakeShareRow,
  fakeShareSupabase,
} from "../ClientReportCard/shareRows.test-fixture";
import { useShareToken } from "../ClientReportCard/useShareToken";
import { dashboardShareSource } from "./dashboardShareToken";

const holder = vi.hoisted(() => ({
  supabase: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return holder.supabase;
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const dashboard = { id: "dash-1", name: "דשבורד" };

/** Opens the card's share link for the dashboard over these rows. */
function openCard(rows: Array<FakeShareRow>) {
  const fake = fakeShareSupabase(rows);
  holder.supabase = fake.supabase;
  const { wrapper } = createTestQueryHarness();
  const hook = renderHook(
    () => useShareToken(dashboardShareSource(dashboard, "tenant-1")),
    { wrapper },
  );
  return { ...hook, writes: fake.writes };
}

describe("dashboardShareSource in the client card", () => {
  it("leaves a link the user turned off inactive and creates nothing on open", async () => {
    const rows = [
      {
        dashboard_id: "dash-1",
        share_token: "old",
        is_active: false,
        created_at: "2026-01-01",
      },
    ];
    const { result, writes } = openCard(rows);

    await waitFor(() => expect(result.current.status).toBe("none"));
    expect(writes.updates).toEqual([]);
    expect(writes.inserts).toEqual([]);
    expect(rows[0].is_active).toBe(false);
  });

  it("uses an older active link when the newest one is turned off", async () => {
    const { result, writes } = openCard([
      {
        dashboard_id: "dash-1",
        share_token: "older-active",
        is_active: true,
        created_at: "2026-01-01",
      },
      {
        dashboard_id: "dash-1",
        share_token: "newest-off",
        is_active: false,
        created_at: "2026-02-01",
      },
    ]);

    await waitFor(() => expect(result.current.token).toBe("older-active"));
    expect(writes.updates).toEqual([]);
  });
});
