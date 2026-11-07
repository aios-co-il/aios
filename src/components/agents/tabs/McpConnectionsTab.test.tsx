import { queryState } from "./agentQueryIds.fixtures";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { McpConnectionsTab } from "./McpConnectionsTab";

describe("McpConnectionsTab tenant query", () => {
  it("shows connections fetched for the current tenant and agent", async () => {
    queryState.fetch.mockResolvedValue(
      Response.json([
        {
          id: "connection-a",
          name: "Tenant connection",
          url: "https://mcp.example.com",
          state: "ready",
        },
      ]),
    );
    render(withTestQuery(<McpConnectionsTab agent={{ id: "agent-a" }} />));
    expect(await screen.findByText("Tenant connection")).toBeVisible();
    const request = queryState.requests[0];
    const url = new URL(request.url);
    expect(url.pathname).toBe("/rest/v1/agent_mcp_connections");
    expect(url.searchParams.get("tenant_id")).toBe("eq.tenant-a");
    expect(url.searchParams.get("or")).toBe(
      "(agent_id.eq.agent-a,agent_id.is.null)",
    );
    expect(url.searchParams.get("order")).toBe("created_at.desc");
  });
});
