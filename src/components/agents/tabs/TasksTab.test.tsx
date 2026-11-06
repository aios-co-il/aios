import { operationState } from "./agentOperationIds.fixtures";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { toast } from "sonner";
import { withTestQuery } from "@/test/withTestQuery";
import { TasksTab } from "./TasksTab";

describe("TasksTab reminder tenant readiness", () => {
  it.each([
    { tenantId: null, failure: null },
    { tenantId: "tenant-a", failure: null },
    { tenantId: "tenant-a", failure: new Error("Write rejected") },
  ])(
    "handles reminder tenant $tenantId with failure $failure",
    async ({ tenantId, failure }) => {
      operationState.failure = failure;
      operationState.tenantId = tenantId;
      const user = userEvent.setup();
      render(withTestQuery(<TasksTab agent={{ id: "agent-a" }} />));
      await user.click(screen.getByRole("button", { name: "בדיקה (2 ד׳)" }));
      if (!tenantId) {
        await waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith("לא נבחר ארגון (tenant)"),
        );
        expect(operationState.insert).not.toHaveBeenCalled();
        expect(operationState.auth).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
      } else if (failure) {
        await waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith("Write rejected"),
        );
        expect(operationState.insert).toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
      } else {
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(operationState.insert).toHaveBeenCalledWith(
          "agent_tasks",
          expect.objectContaining({
            tenant_id: tenantId,
            agent_id: "agent-a",
            created_by: "user-a",
            schedule_type: "once",
            status: "scheduled",
          }),
        );
      }
    },
  );
});
