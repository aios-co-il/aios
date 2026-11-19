import { assertEquals } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { executeSeoReadTool } from "./execute.ts";
import {
  CLIENT_ID,
  OTHER_TENANT,
  TENANT,
  clientRow,
  fakeSeoDb,
  seoCtx,
} from "./fake-db.test-fixture.ts";

const t = { tenant_id: TENANT };
/** One AI answer of a scan of brand-1. */
function result(
  prompt_id: string,
  platform: string,
  is_mentioned: boolean,
  scan_id: string,
  citations: Array<string> = [],
) {
  return {
    ...t,
    brand_id: "brand-1",
    prompt_id,
    platform,
    is_mentioned,
    scan_id,
    citations,
    scanned_at:
      scan_id === "scan-2" ? "2026-11-18T05:00:00Z" : "2026-11-11T05:00:00Z",
  };
}
const seed = {
  ai_detection_brands: [
    { ...t, id: "brand-0", brand_name: "מותג אחר", url: "https://other.co.il" },
    {
      ...t,
      id: "brand-1",
      brand_name: "Avi Renovations",
      url: "example.co.il",
      competitor_names: ["קבלן בע״מ"],
    },
    {
      tenant_id: OTHER_TENANT,
      id: "brand-x",
      brand_name: "שיפוצי אבי",
      url: "example.co.il",
    },
  ],
  ai_detection_scores: [
    {
      ...t,
      brand_id: "brand-1",
      week_start: "2026-11-09",
      score: 40,
      chatgpt_score: 50,
      gemini_score: 30,
      perplexity_score: 40,
      total_prompts: 10,
      mentioned_prompts: 4,
    },
    {
      ...t,
      brand_id: "brand-1",
      week_start: "2026-11-16",
      score: 25,
      chatgpt_score: 30,
      gemini_score: 20,
      perplexity_score: 25,
      total_prompts: 10,
      mentioned_prompts: 2,
    },
  ],
  ai_detection_results: [
    result("p1", "chatgpt", true, "scan-2", [
      "https://www.example.co.il/a",
      "https://zap.co.il/x",
    ]),
    result("p2", "chatgpt", false, "scan-2", ["https://zap.co.il/y"]),
    result("p2", "gemini", false, "scan-2"),
    result("p3", "gemini", true, "scan-1"),
  ],
  ai_detection_prompts: [
    {
      ...t,
      id: "p2",
      prompt: "מי הקבלן הכי טוב בתל אביב?",
      category: "המלצות",
    },
  ],
  ai_detection_competitor_results: [
    {
      ...t,
      brand_id: "brand-1",
      scan_id: "scan-2",
      competitor_name: "קבלן בע״מ",
      is_mentioned: true,
    },
    {
      ...t,
      brand_id: "brand-1",
      scan_id: "scan-2",
      competitor_name: "קבלן בע״מ",
      is_mentioned: false,
    },
  ],
};

/** Runs get_ai_visibility on a seed. */
async function run(
  tables: Record<string, Array<Record<string, unknown>>>,
  client = clientRow(),
) {
  const db = fakeSeoDb({ clients: [client], ...tables });
  return await executeSeoReadTool(db, seoCtx(), "get_ai_visibility", {
    client_id: CLIENT_ID,
  });
}

Deno.test("a client no brand tracks is not connected", async () => {
  const answer = await run({
    ai_detection_brands: seed.ai_detection_brands.slice(0, 1),
  });
  assertEquals(
    [at(answer, "status"), at(answer, "connected")],
    ["not_connected", false],
  );
});

Deno.test(
  "the brand on the client's domain gives scores, trend and the latest scan",
  async () => {
    const answer = await run(seed);
    assertEquals(at(answer, "brand"), "Avi Renovations");
    assertEquals(at(answer, "latest_week", "score"), 25);
    assertEquals(at(answer, "score_change"), -15);
    const scan = at(answer, "latest_scan");
    assertEquals(at(scan, "answers"), 3);
    assertEquals(at(scan, "mention_rate_pct_by_platform"), {
      chatgpt: 50,
      gemini: 0,
    });
    assertEquals(at(scan, "missed_prompts"), [
      { prompt: "מי הקבלן הכי טוב בתל אביב?", category: "המלצות" },
    ]);
    assertEquals(at(scan, "top_cited_sources", "0"), {
      domain: "zap.co.il",
      citations: 2,
    });
    assertEquals(at(scan, "competitors"), [
      { competitor: "קבלן בע״מ", mention_rate_pct: 50 },
    ]);
  },
);

Deno.test(
  "a brand with the client's name matches when no domain does",
  async () => {
    const answer = await run(
      {
        ai_detection_brands: [
          { ...t, id: "brand-1", brand_name: " שיפוצי  אבי ", url: null },
        ],
      },
      clientRow({ website: null }),
    );
    assertEquals(
      [at(answer, "status"), at(answer, "brand")],
      ["no_data", " שיפוצי  אבי "],
    );
  },
);
