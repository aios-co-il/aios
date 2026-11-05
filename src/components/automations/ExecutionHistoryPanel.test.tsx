import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { ExecutionHistoryPanel } from "./ExecutionHistoryPanel";

describe("ExecutionHistoryPanel timestamps", () => {
  it("shows a missing timestamp without inventing an epoch date", () => {
    fixture.triggeredAt = null;
    render(<ExecutionHistoryPanel open onClose={vi.fn()} automationId="a1" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("uses the shared date-time format for a known timestamp", () => {
    fixture.triggeredAt = "2026-01-02T12:34:56";
    render(<ExecutionHistoryPanel open onClose={vi.fn()} automationId="a1" />);
    expect(screen.getByText("02/01/2026 12:34")).toBeInTheDocument();
  });
});

const fixture = vi.hoisted((): { triggeredAt: string | null } => ({
  triggeredAt: null,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => {
    const log: Database["public"]["Tables"]["automation_logs"]["Row"] = {
      id: "log-1",
      automation_id: "a1",
      triggered_at: fixture.triggeredAt,
      success: true,
      execution_time_ms: null,
      error_message: null,
      payload: null,
      response: null,
    };
    return { data: [log], isLoading: false, refetch: vi.fn() };
  },
}));
