import { queryState } from "./agentQueryIds.fixtures";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { SupervisorTab } from "./SupervisorTab";

describe("SupervisorTab candidate query", () => {
  it.each([null, "tenant-a"])(
    "requires a tenant for explicit fetch (%s)",
    async (tenantId) => {
      queryState.tenantId = tenantId;
      const { queryClient, wrapper } = createTestQueryHarness();
      render(<SupervisorTab agent={{ id: "agent-a", name: "Supervisor" }} />, {
        wrapper,
      });
      const query = queryClient
        .getQueryCache()
        .find({ queryKey: ["ai-agents", tenantId] });
      if (!query) {
        throw new Error("Missing mounted query");
      }
      if (!tenantId) {
        await expect(query.fetch()).rejects.toThrow("Missing queryFn");
        expect(queryState.filter).not.toHaveBeenCalledWith(
          "ai_agents",
          "tenant_id",
          null,
          "eq",
        );
      } else {
        await waitFor(() => expect(query.state.status).toBe("success"));
        await query.fetch();
        expect(queryState.filter).toHaveBeenCalledWith(
          "ai_agents",
          "tenant_id",
          tenantId,
          "eq",
        );
        expect(queryState.exclude).toHaveBeenCalledWith(
          "ai_agents",
          "id",
          "agent-a",
        );
      }
    },
  );
});
