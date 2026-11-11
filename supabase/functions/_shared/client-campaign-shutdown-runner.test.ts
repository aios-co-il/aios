import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { liveCampaignsFromGraph } from "./client-campaign-shutdown-runner.ts";

Deno.test("liveCampaignsFromGraph reads the campaign list", () => {
  assertEquals(
    liveCampaignsFromGraph({
      data: [
        { id: "1", name: "Spring", effective_status: "ACTIVE" },
        { id: 2, effective_status: "PAUSED" },
      ],
    }),
    [
      { campaign_id: "1", campaign_name: "Spring", effective_status: "ACTIVE" },
      { campaign_id: "2", campaign_name: "", effective_status: "PAUSED" },
    ],
  );
});

Deno.test(
  "liveCampaignsFromGraph skips malformed items instead of dropping the list",
  () => {
    assertEquals(
      liveCampaignsFromGraph({
        data: [
          null,
          "x",
          { name: "no id" },
          { id: "3", effective_status: "ACTIVE" },
        ],
      }),
      [{ campaign_id: "3", campaign_name: "", effective_status: "ACTIVE" }],
    );
  },
);

Deno.test(
  "liveCampaignsFromGraph returns null for errors and missing lists",
  () => {
    assertStrictEquals(
      liveCampaignsFromGraph({ error: { message: "bad" }, data: [] }),
      null,
    );
    assertStrictEquals(liveCampaignsFromGraph({}), null);
    assertStrictEquals(liveCampaignsFromGraph(null), null);
  },
);
