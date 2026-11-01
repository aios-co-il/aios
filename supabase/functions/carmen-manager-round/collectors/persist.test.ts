import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../budget.ts";
import { deps } from "../tests/fakes.ts";
import { finding, TENANT, type World, world } from "../tests/fake-world.ts";
import { persistRun } from "./persist.ts";
import type { Collector, CollectorResult } from "./types.ts";

/** A contact collector that declares these kinds; persistRun never calls collect. */
function collector(kinds: Collector["kinds"]): Collector {
  return {
    id: "contact",
    kinds,
    detectorVersion: "2",
    schedule: { cron: "0 * * * *" },
    collect: () => Promise.reject(new Error("not called")),
  };
}

/** persistRun over `w` for this collector and its run's result. */
function persist(w: World, kinds: Collector["kinds"], result: CollectorResult) {
  return persistRun(
    deps(w),
    {
      tenantId: TENANT,
      roundId: "r1",
      settings: resolveManagerSettings(null),
      now: w.now,
      budget: RoundBudget.create(60_000, 10),
      state: w.state,
      due: [],
      clientIds: null,
      fixtures: null,
      dryRun: false,
    },
    collector(kinds),
    result,
    result.candidates,
  );
}

Deno.test("persistRun", async (t) => {
  await t.step(
    "closes the findings its run saw end, only of its own kinds",
    async () => {
      const w = world({
        findings: [
          finding({ fingerprint: "answered", kind: "no_contact" }),
          finding({ fingerprint: "other", kind: "data_gap" }),
        ],
      });
      const stored = await persist(w, ["no_contact"], {
        candidates: [],
        watermark: null,
        coverage: { complete: false, clientIds: null },
        resolved: [
          {
            kind: "no_contact",
            fingerprint: "answered",
            resolution: "answered",
            details: { response_minutes: 42 },
          },
          {
            kind: "data_gap",
            fingerprint: "other",
            resolution: "answered",
            details: {},
          },
        ],
      });
      assertEquals(stored.cleared, 1);
      assertEquals(
        w.findings.map((f) => [f.fingerprint, f.status]),
        [
          ["answered", "resolved"],
          ["other", "open"],
        ],
      );
    },
  );

  await t.step("clears only the kinds the run checked", async () => {
    const w = world();
    await persist(w, ["no_contact", "data_gap"], {
      candidates: [],
      watermark: null,
      coverage: {
        complete: true,
        clientIds: null,
        kinds: ["no_contact", "cost_spike"],
      },
    });
    assertEquals(
      w.marks.map((mark) => mark.kind),
      ["no_contact"],
    );
  });
});
