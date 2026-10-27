import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../budget.ts";
import { deps } from "../tests/fakes.ts";
import { finding, TENANT, type World, world } from "../tests/fake-world.ts";
import type { DueCollector } from "./registry.ts";
import { runCollectors } from "./run.ts";
import type { Collector, CollectorContext } from "./types.ts";

const slot = new Date("2026-11-01T08:00:00Z");

function collector(collect: Collector["collect"]): Collector {
  return {
    id: "contact",
    kinds: ["no_contact"],
    detectorVersion: "2",
    schedule: { cron: "0 * * * *" },
    collect,
  };
}

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
    "closes the findings its run saw end, only of its own kinds",
    async () => {
      const w = world({
        findings: [
          finding({ fingerprint: "answered" }),
          finding({ fingerprint: "other", kind: "data_gap" }),
        ],
      });
      const contexts: CollectorContext[] = [];
      const contact = collector((ctx) => {
        contexts.push(ctx);
        return Promise.resolve({
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
      });
      const { reports } = await run(w, [{ collector: contact, slot }]);
      assertEquals(reports[0].cleared, 1);
      assertEquals(
        w.findings.map((f) => [f.fingerprint, f.status]),
        [
          ["answered", "resolved"],
          ["other", "open"],
        ],
      );
      assertEquals(contexts[0]?.dryRun, false);
    },
  );

  await t.step(
    "clears only the kinds the run checked and reports its note",
    async () => {
      const w = world();
      const both: Collector = {
        ...collector(() =>
          Promise.resolve({
            candidates: [],
            watermark: null,
            coverage: {
              complete: true,
              clientIds: null,
              kinds: ["no_contact", "cost_spike"],
            },
            note: "lines_not_monitored:1",
          }),
        ),
        kinds: ["no_contact", "data_gap"],
      };
      const { reports } = await run(w, [{ collector: both, slot }]);
      assertEquals(
        w.marks.map((mark) => mark.kind),
        ["no_contact"],
      );
      assertEquals(reports[0].reason, "lines_not_monitored:1");
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
