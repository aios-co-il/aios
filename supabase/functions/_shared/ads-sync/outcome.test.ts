import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { buildSyncOutcome, scheduledMarkerPatch } from "./outcome.ts";
import { TOKEN } from "./tests/token-errors.ts";

Deno.test(
  "scheduledMarkerPatch: markers advance only past a successful write",
  () => {
    const markers = {
      scheduled_history_from: "2026-06-28",
      scheduled_synced_through: "2026-10-26",
      scheduled_lookback_on: "2026-10-26",
    };
    assertEquals(scheduledMarkerPatch("failed", markers), {});
    assertEquals(scheduledMarkerPatch("empty", markers), {
      scheduled_history_from: "2026-06-28",
    });
    assertEquals(scheduledMarkerPatch("partial", markers), markers);
    assertEquals(
      scheduledMarkerPatch("ok", { scheduled_synced_through: "bad" }),
      {},
    );
  },
);

Deno.test("buildSyncOutcome: redacts before the 300-char cut", () => {
  // The cut lands inside the token: truncating first would keep its first half.
  const prefix = "x".repeat(250);
  const outcome = buildSyncOutcome({
    status: "failed",
    error: `${prefix} access_token=${TOKEN}&level=campaign`,
  });
  assertStrictEquals(outcome.error?.includes(TOKEN.slice(0, 20)), false);
  assertMatch(outcome.error || "", /access_token=\[redacted\]/);
});
