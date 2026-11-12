import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applyLeadTagChange, restoreLeadTagCaches } from "./leadTagCache";

const visibleKey = ["leads-tags-visible", "t1", ["l1", "l2"]];
const tableKey = ["leads-tags-table", "t1", ["l1"]];

function seededClient() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(visibleKey, { l1: ["a"], l2: ["b"] });
  queryClient.setQueryData(tableKey, { l1: ["a"] });
  queryClient.setQueryData(["lead-tags", "l1"], ["a"]);
  return queryClient;
}

describe("applyLeadTagChange", () => {
  it("adds the tag to the bulk maps the Kanban and table render", () => {
    const queryClient = seededClient();

    applyLeadTagChange(queryClient, {
      tenantId: "t1",
      leadId: "l1",
      tagId: "c",
      assign: true,
    });

    expect(queryClient.getQueryData(visibleKey)).toEqual({
      l1: ["a", "c"],
      l2: ["b"],
    });
    expect(queryClient.getQueryData(tableKey)).toEqual({ l1: ["a", "c"] });
    expect(queryClient.getQueryData(["lead-tags", "l1"])).toEqual(["a", "c"]);
  });

  it("removes the tag and restores every cache on rollback", () => {
    const queryClient = seededClient();

    const snapshot = applyLeadTagChange(queryClient, {
      tenantId: "t1",
      leadId: "l1",
      tagId: "a",
      assign: false,
    });
    expect(queryClient.getQueryData(tableKey)).toEqual({ l1: [] });

    restoreLeadTagCaches(queryClient, snapshot);
    expect(queryClient.getQueryData(visibleKey)).toEqual({
      l1: ["a"],
      l2: ["b"],
    });
    expect(queryClient.getQueryData(tableKey)).toEqual({ l1: ["a"] });
    expect(queryClient.getQueryData(["lead-tags", "l1"])).toEqual(["a"]);
  });
});
