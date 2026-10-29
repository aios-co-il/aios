import { assertEquals } from "jsr:@std/assert@1";

import { buildSyncOutcome } from "./outcome.ts";
import { syncRunBody } from "./run-response.ts";

const AT = "2026-10-26T04:40:00.000Z";

Deno.test(
  "syncRunBody: a failed run answers 502 with success false and its error",
  () => {
    const failed = buildSyncOutcome({
      status: "failed",
      error: "campaign level fetch failed — stored rows kept",
      at: AT,
    });
    assertEquals(syncRunBody(failed, null, { by_level: { campaign: 0 } }), {
      status: 502,
      body: {
        success: false,
        error: "campaign level fetch failed — stored rows kept",
        records_synced: 0,
        by_level: { campaign: 0 },
        outcome: failed,
        last_sync_at: null,
      },
    });
  },
);

Deno.test(
  "syncRunBody: ok, partial and empty runs answer 200 with success true",
  () => {
    const ok = buildSyncOutcome({ status: "ok", rows: 12, at: AT });
    assertEquals(syncRunBody(ok, AT), {
      status: 200,
      body: {
        success: true,
        records_synced: 12,
        outcome: ok,
        last_sync_at: AT,
      },
    });
    for (const status of ["partial", "empty"] as const) {
      const outcome = buildSyncOutcome({
        status,
        error: "ad: timeout",
        at: AT,
      });
      const { body, status: code } = syncRunBody(outcome, null);
      assertEquals([code, body.success, "error" in body], [200, true, false]);
    }
  },
);
