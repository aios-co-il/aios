import { queryState } from "./agentQueryIds.fixtures";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { SupervisorTab } from "./SupervisorTab";

describe("SupervisorTab candidate query", () => {
  it("offers children fetched for the current tenant excluding the supervisor", async () => {
    queryState.fetch.mockImplementation(async (input, init) => {
      const url = new URL(new Request(input, init).url);
      return Response.json(
        url.pathname.endsWith("/ai_agents")
          ? [{ id: "child-a", name: "Candidate child", talent: null }]
          : [],
      );
    });
    const user = userEvent.setup();
    render(
      withTestQuery(
        <SupervisorTab agent={{ id: "agent-a", name: "Supervisor" }} />,
      ),
    );
    await user.click(screen.getByRole("combobox"));
    expect(
      await screen.findByRole("option", { name: "Candidate child" }),
    ).toBeVisible();
    const request = queryState.requests.find((request) =>
      new URL(request.url).pathname.endsWith("/ai_agents"),
    );
    if (!request) {
      throw new Error("Missing candidate request");
    }
    const url = new URL(request.url);
    expect(url.searchParams.get("tenant_id")).toBe("eq.tenant-a");
    expect(url.searchParams.get("id")).toBe("neq.agent-a");
    expect(url.searchParams.get("select")).toBe("id,name,talent");
  });
});
