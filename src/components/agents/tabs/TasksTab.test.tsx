import { operationState } from "./agentOperationIds.fixtures";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { toast } from "sonner";
import { withTestQuery } from "@/test/withTestQuery";
import { TasksTab } from "./TasksTab";

describe("TasksTab reminder tenant readiness", () => {
  it("rejects a missing tenant before auth lookup or writing", async () => {
    operationState.tenantId = null;
    await scheduleReminder();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("לא נבחר ארגון (tenant)"),
    );
    expect(operationState.insert).not.toHaveBeenCalled();
    expect(operationState.auth).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("schedules the reminder with the current tenant and user", async () => {
    await scheduleReminder();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(operationState.insert).toHaveBeenCalledWith(
      "agent_tasks",
      expect.objectContaining({
        tenant_id: "tenant-a",
        agent_id: "agent-a",
        created_by: "user-a",
        schedule_type: "once",
        status: "scheduled",
      }),
    );
  });

  it("reports a backend rejection without success feedback", async () => {
    operationState.failure = new Error("Write rejected");
    await scheduleReminder();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Write rejected"),
    );
    expect(operationState.insert).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

/** Trigger reminder scheduling through the actual tab action. */
async function scheduleReminder() {
  const user = userEvent.setup();
  render(withTestQuery(<TasksTab agent={{ id: "agent-a" }} />));
  await user.click(screen.getByRole("button", { name: "בדיקה (2 ד׳)" }));
}
