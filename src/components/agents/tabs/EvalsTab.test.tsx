import { operationState } from "./agentOperationIds.fixtures";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { toast } from "sonner";
import { withTestQuery } from "@/test/withTestQuery";
import { EvalsTab } from "./EvalsTab";

describe("EvalsTab tenant readiness", () => {
  it.each([
    { tenantId: null, failure: null },
    { tenantId: "tenant-a", failure: null },
    { tenantId: "tenant-a", failure: new Error("Write rejected") },
  ])(
    "handles tenant $tenantId with failure $failure",
    async ({ tenantId, failure }) => {
      operationState.failure = failure;
      operationState.tenantId = tenantId;
      const user = userEvent.setup();
      render(withTestQuery(<EvalsTab agent={{ id: "agent-a" }} />));
      await user.click(screen.getByRole("button", { name: "Eval חדש" }));
      await user.type(
        screen.getByPlaceholderText("לדוגמה: זיהוי לקוחות בסיכון"),
        "Quality",
      );
      await user.click(
        screen.getByRole("button", { name: "צור" }),
      );
      if (!tenantId) {
        await waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith("לא נבחר ארגון (tenant)"),
        );
        expect(operationState.insert).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(toast.success).not.toHaveBeenCalled();
      } else if (failure) {
        await waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith("Write rejected"),
        );
        expect(operationState.insert).toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
      } else {
        await waitFor(() =>
          expect(toast.success).toHaveBeenCalledWith("Eval נוצר"),
        );
        expect(operationState.insert).toHaveBeenCalledWith("agent_evals", {
          tenant_id: tenantId,
          agent_id: "agent-a",
          name: "Quality",
          dataset: [{ input: "מה הסטטוס של לקוח X?", expected: "…" }],
        });
      }
    },
  );
});
