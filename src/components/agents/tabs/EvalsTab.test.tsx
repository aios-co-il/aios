import { operationState } from "./agentOperationIds.fixtures";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { toast } from "sonner";
import { withTestQuery } from "@/test/withTestQuery";
import { EvalsTab } from "./EvalsTab";

describe("EvalsTab tenant readiness", () => {
  it("rejects a missing tenant before parsing the dataset", async () => {
    operationState.tenantId = null;
    const user = await openEvalForm();
    await user.clear(screen.getByDisplayValue(/מה הסטטוס של לקוח X/));
    await user.click(screen.getByRole("button", { name: "צור" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("לא נבחר ארגון (tenant)"),
    );
    expect(operationState.insert).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("creates an eval with the selected tenant and dataset", async () => {
    const user = await openEvalForm();
    await user.click(screen.getByRole("button", { name: "צור" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Eval נוצר"),
    );
    expect(operationState.insert).toHaveBeenCalledWith("agent_evals", {
      tenant_id: "tenant-a",
      agent_id: "agent-a",
      name: "Quality",
      dataset: [{ input: "מה הסטטוס של לקוח X?", expected: "…" }],
    });
  });

  it("reports a backend rejection without success feedback", async () => {
    operationState.failure = new Error("Write rejected");
    const user = await openEvalForm();
    await user.click(screen.getByRole("button", { name: "צור" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Write rejected"),
    );
    expect(operationState.insert).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each([
    { value: "", message: "JSON לא תקין" },
    { value: "{}", message: "ה-dataset חייב להיות מערך" },
  ])(
    "rejects invalid dataset '$value' before writing",
    async ({ value, message }) => {
      const user = await openEvalForm();
      await user.clear(screen.getByDisplayValue(/מה הסטטוס של לקוח X/));
      await user.paste(value);
      await user.click(screen.getByRole("button", { name: "צור" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
      expect(operationState.insert).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    },
  );
});

/** Open the real eval editor with a named eval ready to submit. */
async function openEvalForm() {
  const user = userEvent.setup();
  render(withTestQuery(<EvalsTab agent={{ id: "agent-a" }} />));
  await user.click(screen.getByRole("button", { name: "Eval חדש" }));
  await user.type(
    screen.getByPlaceholderText("לדוגמה: זיהוי לקוחות בסיכון"),
    "Quality",
  );
  return user;
}
