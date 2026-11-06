import { queryState } from "./agentQueryIds.fixtures";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { RunsTab } from "./RunsTab";

describe("RunsTab selected-run query", () => {
  it("rejects explicit fetch before any run is selected", async () => {
    const { queryClient, wrapper } = createTestQueryHarness();
    render(<RunsTab agent={{ id: "agent-a" }} />, { wrapper });
    const query = queryClient
      .getQueryCache()
      .find({ queryKey: ["agent-run-steps", null] });
    if (!query) {
      throw new Error("Missing mounted query");
    }
    await expect(query.fetch()).rejects.toThrow("Missing queryFn");
    expect(queryState.filter).not.toHaveBeenCalledWith(
      "agent_action_log",
      "run_id",
      null,
      "eq",
    );
  });

  it("requests scoped steps after selecting a real run", async () => {
    queryState.rows.agent_runs = [
      {
        id: "run-a",
        status: "running",
        goal: "Run sample",
        started_at: "2026-01-01",
      },
    ];
    const user = userEvent.setup();
    const { queryClient, wrapper } = createTestQueryHarness();
    render(<RunsTab agent={{ id: "agent-a" }} />, { wrapper });
    await user.click(await screen.findByRole("button", { name: /Run sample/ }));
    await waitFor(() =>
      expect(queryState.filter).toHaveBeenCalledWith(
        "agent_action_log",
        "run_id",
        "run-a",
        "eq",
      ),
    );
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: ["agent-run-steps", "run-a"] }),
    ).toBeDefined();
  });
});
