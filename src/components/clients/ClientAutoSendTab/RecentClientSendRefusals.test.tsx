import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { backend, refusalRow, resetBackend } from "./fakeAutoSendBackend";
import { RecentClientSendRefusals } from "./RecentClientSendRefusals";

vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("./fakeAutoSendBackend")).fakeSupabase,
}));

/** The refusal list of client-1, with a fresh query client. */
function renderList() {
  const { wrapper } = withTestQuery();
  return render(<RecentClientSendRefusals clientId="client-1" />, { wrapper });
}

beforeEach(resetBackend);

describe("RecentClientSendRefusals", () => {
  it("says when the refusal list failed to load", async () => {
    backend.failing = ["client_send_refusals"];
    renderList();
    expect(
      await screen.findByText("טעינת השליחות שנחסמו נכשלה"),
    ).toBeInTheDocument();
  });

  it("lists blocked and observed refusals, one line per reason", async () => {
    backend.refusals = [
      refusalRow("r1", "staff_only", true),
      refusalRow("r2", "carmen_unverified", false),
      refusalRow("r3", "carmen_unverified", false),
    ];
    renderList();
    expect(
      await screen.findByText("שליחות אוטומטיות שנחסמו (30 יום)"),
    ).toBeInTheDocument();
    const lines = screen.getAllByRole("listitem");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent("הודעה פנימית לצוות");
    expect(lines[0]).toHaveTextContent("נחסם");
    expect(lines[0]).not.toHaveTextContent("פעמים");
    expect(lines[1]).toHaveTextContent("הודעה של כרמן שלא אומתה · 2 פעמים");
    expect(lines[1]).toHaveTextContent("ייחסם כשההגנה תופעל");
  });
});
