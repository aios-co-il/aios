import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { extractCampaignShutdownJob } from "./client-campaign-shutdown.ts";

Deno.test("embedded shutdown job keeps its client and name scope", () => {
  const job = extractCampaignShutdownJob({
    title: "x",
    result: {
      campaign_shutdown_job: {
        client_id: "c1",
        scope: { mode: "name_includes", terms: ["webinar"] },
        auto_pause: false,
      },
    },
  });
  assertEquals(job, {
    client_id: "c1",
    client_name_search: null,
    scope: { mode: "name_includes", terms: ["webinar"] },
    auto_pause: false,
    notify_david: true,
  });
});

Deno.test("embedded job without scope covers all client campaigns", () => {
  const job = extractCampaignShutdownJob({
    result: { campaign_shutdown_job: { client_name_search: "Binat" } },
  });
  assertEquals(job?.scope, { mode: "all_client_campaigns" });
  assertStrictEquals(job?.client_name_search, "Binat");
});

Deno.test(
  "a malformed embedded scope filters by name and matches nothing",
  () => {
    const job = extractCampaignShutdownJob({
      result: { campaign_shutdown_job: { client_id: "c1", scope: "all" } },
    });
    assertEquals(job?.scope, { mode: "name_includes", terms: [] });
  },
);

Deno.test("a non-object result falls back to the task brief", () => {
  assertStrictEquals(
    extractCampaignShutdownJob({ title: "hello", result: "x" }),
    null,
  );
});
