import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { withConsoleErrors } from "../../_shared/testing/console-errors.ts";
import { RoundBudget } from "../budget.ts";
import { deps } from "../tests/fakes.ts";
import { TENANT, type World, world } from "../tests/fake-world.ts";
import type { DueCollector } from "./registry.ts";
import { runCollectors } from "./run.ts";
import type { Collector, CollectorContext } from "./types.ts";

const slot = new Date("2026-11-01T08:00:00Z");

/** An hourly contact collector that collects with `collect`. */
function collector(collect: Collector["collect"]): Collector {
  return {
    id: "contact",
    kinds: ["no_contact"],
    detectorVersion: "2",
    schedule: { cron: "0 * * * *" },
    collect,
  };
}

/** A warning candidate for client c1 with this fingerprint. */
const candidate = (
  fingerprint: string,
  kind: "no_contact" | "data_gap" = "no_contact",
) => ({
  kind,
  fingerprint,
  severity: "warning" as const,
  client_id: "c1",
  agency_id: null,
  source_event_at: slot.toISOString(),
  summary_he: "לקוח א",
  evidence: {},
  owner_user_id: null,
});

/** runCollectors over `w` for these due collectors. */
function run(
  w: World,
  due: DueCollector[],
  fields: { dryRun?: boolean; budgetMs?: number } = {},
) {
  return runCollectors(deps(w), {
    tenantId: TENANT,
    roundId: "r1",
    settings: resolveManagerSettings(null),
    now: w.now,
    budget: RoundBudget.create(fields.budgetMs ?? 60_000, 10),
    state: w.state,
    due,
    clientIds: null,
    fixtures: null,
    dryRun: fields.dryRun ?? false,
  });
}

Deno.test("runCollectors", async (t) => {
  await t.step(
    "upserts its own kinds, clears what a complete run did not see, then saves the watermark",
    async () => {
      const w = world();
      const contexts: CollectorContext[] = [];
      const contact = collector((ctx) => {
        contexts.push(ctx);
        return Promise.resolve({
          candidates: [candidate("a"), candidate("b", "data_gap")],
          watermark: { cursor: 5 },
          coverage: { complete: true, clientIds: ["c1"] },
        });
      });
      const { reports } = await run(w, [{ collector: contact, slot }]);
      assertEquals(reports[0], {
        id: "contact",
        status: "ok",
        candidates: 1,
        inserted: 1,
        cleared: 0,
        dropped: {},
        llm: { calls: 0, costUsd: 0 },
      });
      assertEquals(
        w.findings.map((f) => f.fingerprint),
        ["a"],
      );
      assertEquals(w.marks, [
        {
          kind: "no_contact",
          seen: ["a"],
          clientIds: ["c1"],
          fingerprints: null,
          afterMisses: 2,
        },
      ]);
      assertEquals(w.state[0].watermark, { cursor: 5 });
      assertEquals(contexts[0]?.since.toISOString(), w.now.toISOString());
    },
  );

  await t.step(
    "passes the run mode to the collector and reports its note",
    async () => {
      const contexts: CollectorContext[] = [];
      const contact = collector((ctx) => {
        contexts.push(ctx);
        return Promise.resolve({
          candidates: [],
          watermark: null,
          coverage: { complete: false, clientIds: null },
          note: "lines_not_monitored:1",
        });
      });
      const { reports } = await run(world(), [{ collector: contact, slot }]);
      assertEquals(contexts[0]?.dryRun, false);
      assertEquals(reports[0].reason, "lines_not_monitored:1");
    },
  );

  await t.step(
    "counts and logs the candidates the database did not store",
    async () => {
      const w = world({
        refused: { far: "rejected_client", long: "invalid", old: "suppressed" },
      });
      const contact = collector(() =>
        Promise.resolve({
          candidates: ["a", "a", "far", "long", "old"].map((fp) =>
            candidate(fp),
          ),
          watermark: null,
          coverage: { complete: false, clientIds: null },
        }),
      );
      const { result, logged } = await withConsoleErrors(() =>
        run(w, [{ collector: contact, slot }]),
      );
      assertEquals(result.reports[0].inserted, 1);
      assertEquals(result.reports[0].dropped, {
        duplicate: 1,
        rejected_client: 1,
        invalid: 1,
        suppressed: 1,
      });
      assertStringIncludes(logged, '"fingerprint":"far"');
      assertStringIncludes(logged, '"fingerprint":"long"');
      assertEquals(logged.includes('"fingerprint":"old"'), false);
    },
  );

  await t.step("a claimed slot runs once", async () => {
    const w = world();
    const contact = collector(() =>
      Promise.resolve({
        candidates: [],
        watermark: null,
        coverage: { complete: false, clientIds: null },
      }),
    );
    await run(w, [{ collector: contact, slot }]);
    const again = await run(w, [{ collector: contact, slot }]);
    assertEquals(again.reports[0].reason, "slot_taken");
  });

  await t.step(
    "a failure keeps the old watermark and records the error",
    async () => {
      const w = world({
        state: [
          {
            collector: "contact",
            first_run_at: "2026-10-01T00:00:00Z",
            last_run_at: "2026-10-31T00:00:00Z",
            last_slot: null,
            watermark: { cursor: 1 },
          },
        ],
      });
      const broken = collector(() => Promise.reject(new Error("meta down")));
      const { reports } = await run(w, [{ collector: broken, slot: null }]);
      assertEquals(
        [reports[0].status, reports[0].reason, w.state[0].watermark],
        ["error", "meta down", { cursor: 1 }],
      );
    },
  );

  await t.step(
    "a dry run collects but writes nothing; no budget skips",
    async () => {
      const w = world();
      const contact = collector(() =>
        Promise.resolve({
          candidates: [candidate("a")],
          watermark: { x: 1 },
          coverage: { complete: true, clientIds: null },
        }),
      );
      const dry = await run(w, [{ collector: contact, slot }], {
        dryRun: true,
      });
      assertEquals(
        [
          dry.candidates.length,
          w.findings.length,
          w.state.length,
          w.slots.length,
        ],
        [1, 0, 0, 0],
      );
      const late = await run(w, [{ collector: contact, slot }], {
        budgetMs: 1_000,
      });
      assertEquals(late.reports[0].reason, "budget");
    },
  );
});
