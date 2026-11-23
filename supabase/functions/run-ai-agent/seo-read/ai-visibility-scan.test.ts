import { assertEquals } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { latestScan } from "./ai-visibility-scan.ts";
import { TENANT, fakeSeoDb } from "./fake-db.test-fixture.ts";
import type { SeoClient } from "./context.ts";

const client: SeoClient = {
  id: "client-1",
  name: "שיפוצי אבי",
  tenantId: TENANT,
  domain: "example.co.il",
  gscSiteUrl: null,
};

/** `count` answers of one scan, every third one mentioning the brand. */
function answers(scanId: string | null, scannedAt: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${scanId ?? scannedAt}-${String(i).padStart(5, "0")}`,
    tenant_id: TENANT,
    brand_id: "brand-1",
    prompt_id: `p${i % 7}`,
    platform: i % 2 ? "chatgpt" : "gemini",
    is_mentioned: i % 3 === 0,
    citations: [],
    scan_id: scanId,
    scanned_at: scannedAt,
  }));
}

Deno.test(
  "the newest scan is read whole, past the first page and past older scans",
  async () => {
    const competitors = Array.from({ length: 1500 }, (_, i) => ({
      id: `c-${String(i).padStart(5, "0")}`,
      tenant_id: TENANT,
      brand_id: "brand-1",
      scan_id: "scan-new",
      competitor_name: "קבלן בע״מ",
      is_mentioned: i < 300,
    }));
    const db = fakeSeoDb({
      ai_detection_results: [
        ...answers("scan-old", "2026-11-18T05:00:00Z", 50),
        ...answers("scan-new", "2026-11-19T05:00:00Z", 1200),
      ],
      ai_detection_competitor_results: competitors,
    });
    const scan = await latestScan(db, client, "brand-1", 5);
    assertEquals(at(scan, "answers"), 1200);
    assertEquals(at(scan, "partial"), false);
    assertEquals(at(scan, "competitors"), [
      { competitor: "קבלן בע״מ", mention_rate_pct: 20 },
    ]);
  },
);

Deno.test(
  "an older scan without scan_id is the newest answer's UTC day",
  async () => {
    const db = fakeSeoDb({
      ai_detection_results: [
        ...answers(null, "2026-11-17T23:00:00Z", 4),
        ...answers(null, "2026-11-18T05:00:00Z", 3),
      ],
    });
    const scan = await latestScan(db, client, "brand-1", 5);
    assertEquals(at(scan, "answers"), 3);
    assertEquals(at(scan, "competitors"), []);
  },
);
