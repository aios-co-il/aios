import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { parseGaqlResults } from "./gaql-records.ts";

Deno.test("each level's row keeps its campaign's status", () => {
  const [campaign] = parseGaqlResults(
    [
      {
        results: [
          {
            segments: { date: "2026-10-30" },
            campaign: { id: "11", name: "Search", status: "PAUSED" },
            metrics: { costMicros: "2500000", conversionsValue: "10" },
          },
        ],
      },
    ],
    "campaign",
  );
  assertStrictEquals(campaign.campaign_status, "PAUSED");
  assertStrictEquals(campaign.cost, 2.5);
  assertStrictEquals(campaign.roas, 4);

  const [ad] = parseGaqlResults(
    [
      {
        results: [
          {
            segments: { date: "2026-10-30" },
            campaign: { id: "11", name: "Search", status: "REMOVED" },
            adGroup: { id: "21", name: "Group" },
            adGroupAd: { ad: { id: "31", name: "Ad" } },
          },
        ],
      },
    ],
    "ad",
  );
  assertEquals(
    [ad.entity_level, ad.campaign_status, ad.adset_id, ad.ad_id],
    ["ad", "REMOVED", "21", "31"],
  );
});

Deno.test("a row without a campaign status stores none", () => {
  const [record] = parseGaqlResults(
    [{ results: [{ campaign: { id: "11" } }] }],
    "campaign",
  );
  assertStrictEquals(record.campaign_status, undefined);
  assertStrictEquals(
    "campaign_status" in JSON.parse(JSON.stringify(record)),
    false,
  );
});

Deno.test("batches without results parse to no records", () => {
  assertEquals(parseGaqlResults([{}, { results: [] }], "adset"), []);
});
