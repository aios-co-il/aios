import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  patchLeadInListCaches,
  restoreLeadListCaches,
} from "./patchLeadInListCaches";

const tableKey = ["leads-table", "t1", 1];
const kanbanKey = ["leads-kanban", "t1"];

describe("patchLeadInListCaches", () => {
  it("patches the lead in table and Kanban caches and rolls back", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(tableKey, [
      { id: "l1", response_status: null },
      { id: "l2", response_status: null },
    ]);
    queryClient.setQueryData(kanbanKey, {
      new: { leads: [{ id: "l1", response_status: null }], totalCount: 1 },
    });

    const snapshot = patchLeadInListCaches(queryClient, "l1", {
      response_status: "in_progress",
    });

    expect(queryClient.getQueryData(tableKey)).toEqual([
      { id: "l1", response_status: "in_progress" },
      { id: "l2", response_status: null },
    ]);
    expect(queryClient.getQueryData(kanbanKey)).toEqual({
      new: {
        leads: [{ id: "l1", response_status: "in_progress" }],
        totalCount: 1,
      },
    });

    restoreLeadListCaches(queryClient, snapshot);
    expect(queryClient.getQueryData(tableKey)).toEqual([
      { id: "l1", response_status: null },
      { id: "l2", response_status: null },
    ]);
  });
});
