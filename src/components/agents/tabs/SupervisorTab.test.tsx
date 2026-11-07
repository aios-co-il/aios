import { operationState } from "./agentOperationIds.fixtures";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { toast } from "sonner";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { SupervisorTab } from "./SupervisorTab";

describe("SupervisorTab child tenant readiness", () => {
  it("rejects a missing tenant and preserves the selected child", async () => {
    const { user, view } = await selectChild();
    operationState.tenantId = null;
    view.rerender(
      <SupervisorTab agent={{ id: "agent-a", name: "Supervisor" }} />,
    );
    await user.click(screen.getByRole("button", { name: "הוסף" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("לא נבחר ארגון (tenant)"),
    );
    expect(operationState.insert).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    operationState.tenantId = "tenant-a";
    view.rerender(
      <SupervisorTab agent={{ id: "agent-a", name: "Supervisor" }} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveTextContent("Child"),
    );
  });

  it("assigns the selected child within the current tenant", async () => {
    const { user } = await selectChild();
    await user.click(screen.getByRole("button", { name: "הוסף" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("נוסף"));
    expect(operationState.insert).toHaveBeenCalledWith("agent_supervisors", {
      tenant_id: "tenant-a",
      supervisor_agent_id: "agent-a",
      child_agent_id: "child-a",
      routing_hint: null,
    });
  });

  it("reports a backend rejection without success feedback", async () => {
    operationState.failure = new Error("Write rejected");
    const { user } = await selectChild();
    await user.click(screen.getByRole("button", { name: "הוסף" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Write rejected"),
    );
    expect(operationState.insert).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

/** Select a child in the real UI while keeping one cache across rerenders. */
async function selectChild() {
  operationState.rows.ai_agents = [{ id: "child-a", name: "Child" }];
  const user = userEvent.setup();
  const { wrapper } = createTestQueryHarness();
  const view = render(
    <SupervisorTab agent={{ id: "agent-a", name: "Supervisor" }} />,
    { wrapper },
  );
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: "Child" }));
  return { user, view };
}
