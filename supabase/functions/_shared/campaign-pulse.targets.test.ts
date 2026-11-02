import { assert, assertStrictEquals } from "jsr:@std/assert@1";

import { buildPulseCategoryDigestLines } from "./campaign-pulse.ts";
import {
  LEAD,
  campaignDays,
  leadsTable,
  onlyRow,
} from "./pulse/test-fixtures.ts";

Deno.test(
  "a target-less exception with alerts off stays yellow in the WhatsApp digest",
  () => {
    const row = onlyRow(
      campaignDays({
        tableId: "t1",
        campaignId: "c1",
        name: "Leads",
        extra: LEAD,
        baseline: { spend: 100, leads: 2 },
        current: { spend: 150, leads: 2 },
      }),
      [leadsTable("t1", "a")],
      null,
    );
    const lines = buildPulseCategoryDigestLines([
      { client_name: "a", campaign_breakdown: [row] },
    ]);
    assertStrictEquals(lines[1], "לידים: 🔴 0 · 🟡 1 · 🟢 0 (קמפיין אחד)");
    assert(!lines.some((line) => line.includes("חריגות מאומתות")));
  },
);
