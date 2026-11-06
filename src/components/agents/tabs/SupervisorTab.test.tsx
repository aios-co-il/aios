import { operationState } from "./agentOperationIds.fixtures";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { toast } from "sonner";
import { withTestQuery } from "@/test/withTestQuery";
import { SupervisorTab } from "./SupervisorTab";
import { cloneElement } from "react";

describe("SupervisorTab child tenant readiness", () => {
  it.each([
    { tenantId: null, failure: null },
    { tenantId: "tenant-a", failure: null },
    { tenantId: "tenant-a", failure: new Error("Write rejected") },
  ])(
    "handles selected child with tenant $tenantId and failure $failure",
    async ({ tenantId, failure }) => {
      operationState.failure = failure;
      operationState.rows.ai_agents = [{ id: "child-a", name: "Child" }];
      const user = userEvent.setup();
      const wrapped = withTestQuery(
        <SupervisorTab agent={{ id: "agent-a", name: "Supervisor" }} />,
      );
      const view = render(wrapped);
      await user.click(screen.getByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: "Child" }));
      operationState.tenantId = tenantId;
      view.rerender(
        cloneElement(
          wrapped,
          undefined,
          <SupervisorTab agent={{ id: "agent-a", name: "Supervisor" }} />,
        ),
      );
      await user.click(screen.getByRole("button", { name: "הוסף" }));
      if (!tenantId) {
        await waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith("לא נבחר ארגון (tenant)"),
        );
        expect(operationState.insert).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
      } else if (failure) {
        await waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith("Write rejected"),
        );
        expect(operationState.insert).toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
      } else {
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("נוסף"));
        expect(operationState.insert).toHaveBeenCalledWith(
          "agent_supervisors",
          {
            tenant_id: tenantId,
            supervisor_agent_id: "agent-a",
            child_agent_id: "child-a",
            routing_hint: null,
          },
        );
      }
    },
  );
});
