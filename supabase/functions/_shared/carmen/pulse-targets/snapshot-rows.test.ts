import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import type { TargetInput } from "./parse-target-input.ts";
import {
  campaignProblem,
  campaignReadTables,
  matchCampaign,
} from "./snapshot-rows.ts";

const input: TargetInput = {
  clientId: "client-1",
  platform: "meta",
  goal: "leads",
  kind: "cpl",
  value: 60,
  campaignId: "c1",
};

const row = {
  campaign_id: "c1",
  campaign_name: "Leads",
  table_id: "t1",
  platform: "meta",
  goal: "leads",
  target_value: 55,
  target_source: "approved",
  target_scope: "platform",
  read_table_ids: ["t1", "t2"],
};

Deno.test(
  "the requested campaign is found on its platform in the pulse",
  () => {
    assertEquals(matchCampaign([{ ...row, platform: "google" }, row], input), {
      campaignId: "c1",
      campaignName: "Leads",
      tableId: "t1",
      goal: "leads",
      targetSource: "approved",
      targetValue: 55,
      targetKind: null,
      targetScope: "platform",
      readTableIds: ["t1", "t2"],
    });
    assertStrictEquals(
      matchCampaign([row], { ...input, campaignId: null }),
      null,
    );
    assertStrictEquals(
      matchCampaign([{ ...row, campaign_id: 9 }], input),
      null,
    );
  },
);

Deno.test("an older snapshot without read tables checks every table", () => {
  const tables = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];
  const campaign = matchCampaign([row], input);
  if (!campaign) {
    throw new Error("campaign not matched");
  }
  assertEquals(campaignReadTables(tables, campaign), [
    { id: "t1" },
    { id: "t2" },
  ]);
  assertEquals(
    campaignReadTables(tables, { ...campaign, readTableIds: null }),
    tables,
  );
});

Deno.test("a campaign target needs the campaign measured on this goal", () => {
  assertStrictEquals(
    campaignProblem(input, null)?.error,
    "campaign_not_in_pulse",
  );
  const campaign = matchCampaign([{ ...row, goal: "engagement" }], input);
  assertStrictEquals(
    campaignProblem(input, campaign)?.message.startsWith(
      "הדופק מודד את הקמפיין כאינגייג׳מנט, לא כלידים.",
    ),
    true,
  );
  assertStrictEquals(
    campaignProblem({ ...input, campaignId: null }, null),
    null,
  );
});
