import assert from "node:assert/strict";
import test from "node:test";
import { extractCampaignShutdownJob } from "./client-campaign-shutdown.ts";

test("embedded shutdown job keeps its client and name scope", () => {
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
  assert.deepEqual(job, {
    client_id: "c1",
    client_name_search: null,
    scope: { mode: "name_includes", terms: ["webinar"] },
    auto_pause: false,
    notify_david: true,
  });
});

test("embedded job without scope covers all client campaigns", () => {
  const job = extractCampaignShutdownJob({
    result: { campaign_shutdown_job: { client_name_search: "Binat" } },
  });
  assert.deepEqual(job?.scope, { mode: "all_client_campaigns" });
  assert.equal(job?.client_name_search, "Binat");
});

test("a malformed embedded scope filters by name and matches nothing", () => {
  const job = extractCampaignShutdownJob({
    result: { campaign_shutdown_job: { client_id: "c1", scope: "all" } },
  });
  assert.deepEqual(job?.scope, { mode: "name_includes", terms: [] });
});

test("a non-object result falls back to the task brief", () => {
  assert.equal(
    extractCampaignShutdownJob({ title: "hello", result: "x" }),
    null,
  );
});
