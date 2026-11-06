import { queryState } from "./agentQueryIds.fixtures";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { McpConnectionsTab } from "./McpConnectionsTab";

describe("McpConnectionsTab tenant query", () => {
  it.each([null, "tenant-a"])(
    "requires a tenant for explicit fetch (%s)",
    async (tenantId) => {
      queryState.tenantId = tenantId;
      const { queryClient, wrapper } = createTestQueryHarness();
      render(<McpConnectionsTab agent={{ id: "agent-a" }} />, { wrapper });
      const query = queryClient
        .getQueryCache()
        .find({ queryKey: ["mcp-connections", "agent-a", tenantId] });
      if (!query) {
        throw new Error("Missing mounted query");
      }
      if (!tenantId) {
        await expect(query.fetch()).rejects.toThrow("Missing queryFn");
        expect(queryState.filter).not.toHaveBeenCalled();
      } else {
        await waitFor(() => expect(query.state.status).toBe("success"));
        await query.fetch();
        expect(queryState.filter).toHaveBeenCalledWith(
          "agent_mcp_connections",
          "tenant_id",
          tenantId,
          "eq",
        );
        expect(queryState.scope).toHaveBeenCalledWith(
          "agent_mcp_connections",
          "agent_id.eq.agent-a,agent_id.is.null",
        );
      }
    },
  );
});
