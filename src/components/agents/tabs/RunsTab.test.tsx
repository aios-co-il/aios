import { queryState } from "./agentQueryIds.fixtures";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { RunsTab } from "./RunsTab";

describe("RunsTab selected-run query", () => {
  it("shows scoped steps after selecting a real run", async () => {
    queryState.fetch.mockImplementation(async (input, init) => {
      const url = new URL(new Request(input, init).url);
      return Response.json(
        url.pathname.endsWith("/agent_runs")
          ? [
              {
                id: "run-a",
                status: "running",
                goal: "Run sample",
                started_at: "2026-01-01",
                current_step: 1,
                max_steps: 5,
                total_tokens_in: 0,
                total_tokens_out: 0,
              },
            ]
          : [
              {
                id: "step-a",
                step_index: 1,
                step_kind: "plan",
                thought: "Scoped run step",
              },
            ],
      );
    });
    const user = userEvent.setup();
    render(withTestQuery(<RunsTab agent={{ id: "agent-a" }} />));
    await user.click(await screen.findByRole("button", { name: /Run sample/ }));
    expect(await screen.findByText(/Scoped run step/)).toBeVisible();
    const request = queryState.requests.find((request) =>
      new URL(request.url).pathname.endsWith("/agent_action_log"),
    );
    if (!request) {
      throw new Error("Missing step request");
    }
    const url = new URL(request.url);
    expect(url.searchParams.get("run_id")).toBe("eq.run-a");
    expect(url.searchParams.get("order")).toBe("step_index.asc");
  });
});
