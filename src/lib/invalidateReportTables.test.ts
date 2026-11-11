import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  dashboardTablesQueryKey,
  invalidateReportTables,
} from "./invalidateReportTables";

describe("invalidateReportTables", () => {
  it("marks the report page's and the dashboards' tables stale", async () => {
    const queryClient = new QueryClient();
    const reportKey = ["crm-tables", "tenant-1", "eco"];
    const dashboardKey = dashboardTablesQueryKey("client-1");
    const otherTenantKey = ["crm-tables", "tenant-2"];
    for (const key of [reportKey, dashboardKey, otherTenantKey]) {
      queryClient.setQueryData(key, [{ id: "t1" }]);
    }

    await invalidateReportTables(queryClient, "tenant-1");

    expect(isInvalidated(queryClient, reportKey)).toBe(true);
    expect(isInvalidated(queryClient, dashboardKey)).toBe(true);
    expect(isInvalidated(queryClient, otherTenantKey)).toBe(false);
  });
});

/** Whether the cached query under `key` is marked stale. */
function isInvalidated(
  queryClient: QueryClient,
  key: ReadonlyArray<unknown>,
): boolean | undefined {
  return queryClient.getQueryState(key)?.isInvalidated;
}
