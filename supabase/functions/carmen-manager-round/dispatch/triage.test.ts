import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { FindingRow } from "../findings/types.ts";
import { delivery, finding } from "../tests/fake-world.ts";
import { triage, type TriageInput } from "./triage.ts";

const settings = resolveManagerSettings({
  manager: { mode: "team", notify_since: "2026-10-01T00:00:00Z" },
});

/** Triage of one row for `f`, as [cancelled, held, ready] counts. */
function split(
  f: FindingRow,
  slot: "now" | "list",
  fields: Partial<TriageInput> = {},
) {
  const row = delivery({ finding_id: f.id, slot });
  const result = triage([row], new Map([[f.id, f]]), {
    settings,
    now: new Date("2026-11-01T08:00:00Z"),
    floors: {},
    briefKeys: new Set(),
    ...fields,
  });
  return [result.cancelled.length, result.held.length, result.ready.length];
}

Deno.test("triage", async (t) => {
  await t.step(
    "a row about an event before its kind's floor is cancelled",
    () => {
      assertEquals(
        split(finding(), "now", {
          floors: { no_contact: "2026-11-01T07:30:00Z" },
        }),
        [1, 0, 0],
      );
    },
  );

  await t.step(
    "outside business hours only critical alerts leave; the morning list may go before 09:00",
    () => {
      // Sunday 21:00 and Monday 08:37 Israel time.
      const night = new Date("2026-11-01T19:00:00Z");
      const morning = new Date("2026-11-02T06:37:00Z");
      const alert = finding({
        evidence: { alert_type: "ad_account_disabled" },
      });
      assertEquals(split(finding(), "now", { now: night }), [0, 1, 0]);
      assertEquals(split(alert, "now", { now: night }), [0, 0, 1]);
      assertEquals(split(finding(), "list", { now: morning }), [0, 0, 1]);
      assertEquals(split(finding(), "now", { now: morning }), [0, 1, 0]);
    },
  );
});
