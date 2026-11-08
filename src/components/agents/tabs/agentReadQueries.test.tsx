import { queryState } from "./agentQueryIds.fixtures";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import {
  useAgentRunSteps,
  useMcpConnections,
  useSupervisorCandidates,
} from "./agentReadQueries";

describe("agent reads without required IDs", () => {
  it.each([
    {
      name: "MCP connections",
      useRead: () => useMcpConnections("agent-a", null),
    },
    {
      name: "supervisor candidates",
      useRead: () => useSupervisorCandidates("agent-a", null),
    },
    { name: "run steps", useRead: () => useAgentRunSteps(null) },
  ])("rejects explicit $name refetch before HTTP", async ({ useRead }) => {
    const { wrapper } = createTestQueryHarness();
    const { result } = renderHook(() => ({ refetch: useRead().refetch }), {
      wrapper,
    });
    await act(async () => {
      const refreshed = await result.current.refetch();
      expect(refreshed.isError).toBe(true);
    });
    expect(queryState.requests).toEqual([]);
  });
});
