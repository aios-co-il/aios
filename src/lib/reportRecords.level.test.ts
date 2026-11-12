import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { reportRecordsQuery } from "./reportRecords.ts";

describe("reportRecordsQuery level", () => {
  it("asks for campaign rows under a cache entry of their own", async () => {
    const paths: Array<string> = [];
    const client = {
      functions: {
        invoke: async (path: string) => {
          paths.push(path);
          return {
            data: [{ id: String(paths.length), data: {} }],
            error: null,
          };
        },
      },
    };
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    try {
      const all = reportRecordsQuery(client, "table-a", "last_365_days");
      const campaign = reportRecordsQuery(
        client,
        "table-a",
        "last_365_days",
        null,
        null,
        "campaign",
      );
      expect(all.queryKey).toStrictEqual([
        "crm-records",
        "table-a",
        "last_365_days",
        null,
        null,
      ]);
      expect(campaign.queryKey).toStrictEqual([...all.queryKey, "campaign"]);
      const [allRows, campaignRows] = await Promise.all([
        cache.fetchQuery(all),
        cache.fetchQuery(campaign),
      ]);
      expect(allRows).not.toStrictEqual(campaignRows);
      expect(paths.map((path) => path.includes("level=campaign"))).toEqual([
        false,
        true,
      ]);
    } finally {
      cache.clear();
    }
  });
});
