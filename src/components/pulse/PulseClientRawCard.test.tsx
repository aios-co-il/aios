import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PulseSnapshotRow } from "@/lib/pulseDashboard";
import { PulseClientRawCard } from "./PulseClientRawCard";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const DAY_MS = 24 * 60 * 60 * 1000;

function snapshot(lastCallAt: string | null): PulseSnapshotRow {
  return {
    client_id: "client-1",
    agency_id: null,
    status: "healthy",
    is_ecommerce: false,
    spend_7d: 900,
    leads_7d: 12,
    cpl_7d: 75,
    cpl_change_pct: 3,
    purchases_7d: 0,
    revenue_7d: 0,
    roas_7d: null,
    flags: [],
    data_fresh_through: null,
    calculated_at: null,
    last_meta_change_at: null,
    last_meta_change_type: null,
    last_meta_change_actor: null,
    last_meta_change_object: null,
    meta_change_availability: null,
    last_client_call_at: lastCallAt,
    last_client_call_by: lastCallAt ? "דוד" : null,
  };
}

function renderCard(pulse: PulseSnapshotRow | null) {
  return render(
    <PulseClientRawCard
      clientName="בילבי"
      campaignerName="רוני"
      agencyName="DMM"
      period="last_7_days"
      pulse={pulse}
      campaignsByGoal={{}}
      lastCampaignTouchAt={null}
      onOpenClient={vi.fn()}
      onCallLog={vi.fn()}
    />,
  );
}

describe("PulseClientRawCard contact indicator (AIO-227)", () => {
  it("flags a call older than 14 days next to the date", () => {
    renderCard(snapshot(new Date(Date.now() - 20 * DAY_MS).toISOString()));
    const badge = screen.getByText("ללא שיחה מתועדת ב-14 יום");
    expect(badge).toHaveAttribute(
      "title",
      "ללא שיחה מתועדת ב-14 הימים האחרונים",
    );
  });

  it("shows no indicator for a recent call", () => {
    renderCard(snapshot(new Date(Date.now() - 2 * DAY_MS).toISOString()));
    expect(screen.queryByText(/ללא שיחה מתועדת/)).not.toBeInTheDocument();
  });

  it("highlights a client with no logged call at all", () => {
    renderCard(snapshot(null));
    expect(screen.getByRole("button", { name: "לא תועדה שיחה" })).toHaveClass(
      "text-amber-700",
    );
  });

  it("claims nothing without a pulse snapshot", () => {
    renderCard(null);
    expect(
      screen.getByRole("button", { name: "לא תועדה שיחה" }),
    ).not.toHaveClass("text-amber-700");
  });
});
