import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  buildCampaignShutdownJobFromBrief,
  inferShutdownScopeFromText,
  selectCampaignsForShutdown,
} from "./client-campaign-shutdown.ts";

const SAMPLE = [
  {
    campaign_id: "1",
    campaign_name: "WEBINAR | Sep launch",
    effective_status: "PAUSED",
  },
  {
    campaign_id: "2",
    campaign_name: "DMM_CHALLANGE | 22.9",
    effective_status: "ACTIVE",
  },
  {
    campaign_id: "3",
    campaign_name: "Brand always-on",
    effective_status: "PAUSED",
  },
  {
    campaign_id: "4",
    campaign_name: "Old archived",
    effective_status: "ARCHIVED",
  },
];

Deno.test(
  "general Binat shutdown uses all_client_campaigns and includes DMM_CHALLANGE",
  () => {
    const scope = inferShutdownScopeFromText(
      "כל ערב 20:30 לכבות ולבדוק קמפיינים של בינת",
    );
    assertStrictEquals(scope.mode, "all_client_campaigns");
    const { checked } = selectCampaignsForShutdown(SAMPLE, scope);
    const names = checked.map((c) => c.campaign_name);
    assert(names.includes("DMM_CHALLANGE | 22.9"));
    assert(names.includes("WEBINAR | Sep launch"));
    assert(!names.includes("Old archived"));
  },
);

Deno.test("explicit webinar-only brief narrows scope", () => {
  const scope = inferShutdownScopeFromText("רק קמפייני webinar של בינת");
  assertStrictEquals(scope.mode, "name_includes");
  const { checked, skipped_out_of_scope } = selectCampaignsForShutdown(
    SAMPLE,
    scope,
  );
  assertEquals(
    checked.map((c) => c.campaign_name),
    ["WEBINAR | Sep launch"],
  );
  assert(
    skipped_out_of_scope.some((c) => c.campaign_name.includes("DMM_CHALLANGE")),
  );
});

Deno.test(
  "buildCampaignShutdownJobFromBrief defaults notify + broad scope",
  () => {
    const job = buildCampaignShutdownJobFromBrief(
      "כיבוי קמפיינים 20:30",
      "בדיקה וכיבוי קמפיינים של Binat",
    );
    assert(job);
    assertStrictEquals(job.scope.mode, "all_client_campaigns");
    assertStrictEquals(job.notify_david, true);
    assertStrictEquals(job.client_name_search, "Binat");
  },
);
