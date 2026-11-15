import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { RunChecksNow } from "./RunChecksNow";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "t1" }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

describe("RunChecksNow", () => {
  it("runs the chosen check for the tenant and shows its result", async () => {
    invoke.mockResolvedValue({
      data: {
        mode: "observe",
        status: "ok",
        reason: null,
        candidates: 3,
        inserted: 1,
        cleared: 2,
        llmCalls: 4,
      },
      error: null,
    });
    const user = userEvent.setup();
    render(withTestQuery(<RunChecksNow />));
    await user.click(screen.getByRole("button", { name: /עדכוני קבוצות/ }));
    expect(invoke).toHaveBeenCalledWith("carmen-manager-round-run", {
      body: { tenant_id: "t1", collector: "group_updates" },
    });
    expect(
      await screen.findByText(
        /נמצאו 3 ממצאים \(1 חדשים, 2 נסגרו\), 4 קריאות ל-AI/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/במצב צפייה לא נשלח כלום/)).toBeInTheDocument();
  });

  it("says when the run failed", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("403") });
    const user = userEvent.setup();
    render(withTestQuery(<RunChecksNow />));
    await user.click(screen.getByRole("button", { name: /קשר עם לקוחות/ }));
    expect(await screen.findByText("ההרצה נכשלה")).toBeInTheDocument();
  });
});
