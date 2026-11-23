import { assertEquals } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { executeSeoActionTool } from "./execute.ts";
import {
  CLIENT_ID,
  TENANT,
  actionCtx,
  clientRow,
  fakeActionDb,
} from "./fake-db.test-fixture.ts";

const t = { tenant_id: TENANT };
const brand = { ...t, id: "brand-1", brand_name: "Avi", url: "example.co.il" };
const prompts = [1, 2, 3, 4].map((i) => ({
  ...t,
  id: `p${i}`,
  brand_id: "brand-1",
  is_active: i < 4,
}));

/** Runs run_ai_visibility_scan on a seed. */
async function scan(
  seed: Record<string, Array<Record<string, unknown>>>,
  options: Parameters<typeof actionCtx>[0] = {},
) {
  const db = fakeActionDb({ clients: [clientRow()], ...seed });
  const { ctx, invocations } = actionCtx(options);
  const result = await executeSeoActionTool(db, ctx, "run_ai_visibility_scan", {
    client_id: CLIENT_ID,
  });
  return { db, result, invocations };
}

Deno.test("a client no brand tracks cannot be scanned", async () => {
  const { result, db } = await scan({});
  assertEquals(at(result, "error"), "not_connected");
  assertEquals(db.writes, []);
});

Deno.test("a brand without active prompts cannot be scanned", async () => {
  const { result } = await scan({
    ai_detection_brands: [brand],
    ai_detection_prompts: [prompts[3]],
  });
  assertEquals(at(result, "error"), "no_prompts");
});

Deno.test(
  "the queued scan shows the OpenAI call range of its active prompts",
  async () => {
    const { result, invocations } = await scan({
      ai_detection_brands: [brand],
      ai_detection_prompts: prompts,
    });
    assertEquals(at(result, "pending_approval"), true);
    assertEquals(at(result, "cost", "calls"), { min: 9, max: 18 });
    assertEquals(invocations, []);
  },
);

Deno.test("a scan in the last hour is not repeated", async () => {
  const { result } = await scan({
    ai_detection_brands: [brand],
    ai_detection_prompts: prompts,
    ai_detection_results: [
      { ...t, brand_id: "brand-1", scanned_at: "2026-11-19T09:30:00Z" },
    ],
  });
  assertEquals(at(result, "error"), "scan_too_recent");
});

Deno.test(
  "the approved scan runs ai-detection-scan for the brand's tenant",
  async () => {
    const { result, invocations } = await scan(
      { ai_detection_brands: [brand], ai_detection_prompts: prompts },
      {
        approved: true,
        replies: {
          "ai-detection-scan": {
            ok: true,
            json: { success: true, score: 40, scanned: 9 },
          },
        },
      },
    );
    assertEquals(invocations, [
      {
        fn: "ai-detection-scan",
        body: { brand_id: "brand-1", tenant_id: TENANT },
      },
    ]);
    assertEquals([at(result, "success"), at(result, "score")], [true, 40]);
  },
);

Deno.test("a failed scan reports the error", async () => {
  const { result } = await scan(
    { ai_detection_brands: [brand], ai_detection_prompts: prompts },
    {
      approved: true,
      replies: {
        "ai-detection-scan": { ok: false, json: { error: "OpenAI 429" } },
      },
    },
  );
  assertEquals(at(result, "error"), "scan_failed");
});
