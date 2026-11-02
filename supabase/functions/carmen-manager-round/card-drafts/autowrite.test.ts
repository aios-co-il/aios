import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { Collector } from "../collectors/types.ts";
import { deps } from "../tests/fakes.ts";
import {
  delivery,
  finding,
  rules,
  TENANT,
  world,
} from "../tests/fake-world.ts";
import { writeTeamDrafts, writingKinds } from "./autowrite.ts";
import {
  draft,
  draftCollector,
  NOTIFY,
  round,
  switchingToObserve,
  teamWorld,
} from "./draft-fixtures.ts";

const team = (cardWrite: boolean, mode = "team") =>
  resolveManagerSettings(
    rules({
      mode,
      notify_since: NOTIFY,
      kinds: {
        card_stale_group: { card_write: cardWrite, notify_since: NOTIFY },
      },
    }),
  );
const stale = (fields = {}) =>
  finding({
    kind: "card_stale_group",
    client_id: "c1",
    source_event_at: "2026-10-31T10:00:00Z",
    evidence: { card_draft: draft },
    ...fields,
  });
const floors = { card_stale_group: "2026-10-02T00:00:00Z" };
const run = (settings = team(true), dryRun = false) => ({
  tenantId: TENANT,
  settings,
  floors,
  dryRun,
  settingsChanged: () => Promise.resolve(false),
});

Deno.test("writingKinds", async (t) => {
  await t.step("only team mode with card_write on writes the card", () => {
    assertEquals(writingKinds(team(true)), ["card_stale_group"]);
    assertEquals(writingKinds(team(false)), []);
    assertEquals(writingKinds(team(true, "david_only")), []);
    assertEquals(writingKinds(team(true, "observe")), []);
  });
});

Deno.test("writeTeamDrafts", async (t) => {
  await t.step(
    "writes each due draft once, closes its finding and cancels its messages",
    async () => {
      const f = stale();
      const w = world({
        findings: [f],
        deliveries: [delivery({ finding_id: f.id })],
      });
      const report = await writeTeamDrafts(deps(w), run());
      assertEquals([report?.written, report?.failed], [1, 0]);
      assertEquals(
        w.cardEntries.map((e) => [e.source, e.sourceRef, e.countsAsContact]),
        [["group_digest", "g1:m9", false]],
      );
      assertEquals(w.findings[0].status, "resolved");
      assertEquals(w.deliveries[0].status, "cancelled");
    },
  );

  await t.step(
    "an event before notify_since or the collector's first run waits for a person",
    async () => {
      const w = world({
        findings: [
          stale({ source_event_at: "2026-09-30T10:00:00Z" }),
          stale({ source_event_at: "2026-10-01T12:00:00Z" }),
        ],
      });
      const report = await writeTeamDrafts(deps(w), run());
      assertEquals(report?.written, 0);
      assertEquals(w.cardEntries, []);
    },
  );

  await t.step(
    "findings without a draft or a client are left alone",
    async () => {
      const w = world({
        findings: [
          stale({ evidence: {} }),
          stale({ client_id: null }),
          stale({ kind: "no_contact" }),
        ],
      });
      assertEquals((await writeTeamDrafts(deps(w), run()))?.written, 0);
    },
  );

  await t.step("nothing to do outside team mode with card_write", async () => {
    const w = world({ findings: [stale()] });
    assertEquals(await writeTeamDrafts(deps(w), run(team(false))), null);
    assertEquals(w.findings[0].status, "open");
  });

  await t.step(
    "a dry run counts stored and new drafts and writes nothing",
    async () => {
      const w = world({ findings: [stale()] });
      const virtual = [{ ...stale(), id: "dry-run:0" }];
      const report = await writeTeamDrafts(deps(w), {
        ...run(team(true), true),
        virtual,
      });
      assertEquals([report?.planned, report?.written], [2, 0]);
      assertEquals(report?.finding_ids.includes("dry-run:0"), true);
      assertEquals(w.cardEntries, []);
    },
  );

  await t.step(
    "a refused write is counted and the finding stays open",
    async () => {
      const w = world({ findings: [stale()], failOn: "card" });
      const report = await writeTeamDrafts(deps(w), run());
      assertEquals([report?.written, report?.failed], [0, 1]);
      assertEquals(report?.error, "card write refused");
      assertEquals(w.findings[0].status, "open");
    },
  );

  await t.step(
    "a settings change between two writes leaves the rest for the next round",
    async () => {
      const w = world({
        findings: [
          stale(),
          stale({
            evidence: { card_draft: { ...draft, source_ref: "g2:m1" } },
          }),
        ],
      });
      let checks = 0;
      const report = await writeTeamDrafts(deps(w), {
        ...run(),
        settingsChanged: () => Promise.resolve(++checks > 1),
      });
      assertEquals([report?.written, report?.stopped], [1, true]);
      assertEquals(
        w.findings.map((f) => f.status),
        ["resolved", "open"],
      );
    },
  );

  await t.step(
    "a finding someone closed meanwhile is counted as already closed",
    async () => {
      const w = world({ findings: [stale()] });
      const fakes = deps(w);
      const report = await writeTeamDrafts(
        {
          ...fakes,
          cardDrafts: {
            ...fakes.cardDrafts,
            resolveWritten: () => Promise.resolve(false),
          },
        },
        run(),
      );
      assertEquals([report?.written, report?.already_closed], [1, 1]);
    },
  );
});

/** A collector that reports nothing, so only stored findings are in play. */
const quietCollector: Collector = {
  ...draftCollector,
  collect: () =>
    Promise.resolve({
      candidates: [],
      watermark: null,
      coverage: { complete: false, clientIds: null },
    }),
};

Deno.test("Carmen's own card writes in the round", async (t) => {
  await t.step(
    "team with card_write: the draft is on the card and nobody is asked",
    async () => {
      const w = teamWorld();
      const report = await round(w, true);
      assertEquals(report.card_writes?.written, 1);
      assertEquals(
        w.cardEntries.map((e) => e.sourceRef),
        ["g1:m9"],
      );
      assertEquals(
        w.findings.map((f) => f.status),
        ["resolved"],
      );
      assertEquals([w.decisions, w.deliveries], [[], []]);
      const stats = w.heartbeats[0].stats;
      assertEquals(
        stats && typeof stats === "object" && !Array.isArray(stats)
          ? stats.card_writes
          : null,
        { written: 1, failed: 0, already_closed: 0, error: null },
      );
    },
  );

  await t.step(
    "team without card_write: the campaigner is asked to approve",
    async () => {
      const w = teamWorld();
      const report = await round(w, false);
      assertEquals(report.card_writes, null);
      assertEquals(w.cardEntries, []);
      assertEquals(
        w.deliveries.map((d) => d.recipient_key),
        ["user:dana"],
      );
    },
  );

  await t.step(
    "a dry run counts the write and plans no message for it, new or stored",
    async () => {
      for (const [w, collector] of [
        [teamWorld(), draftCollector],
        [teamWorld({ findings: [stale()] }), quietCollector],
      ] as const) {
        const report = await round(w, true, true, collector);
        assertEquals(
          [report.card_writes?.planned, report.card_writes?.written],
          [1, 0],
        );
        assertEquals(
          [report.preview?.decisions, report.preview?.messages],
          [[], []],
        );
        assertEquals(w.cardEntries, []);
      }
    },
  );

  await t.step(
    "a switch to observe while the collectors run: nothing is written",
    async () => {
      const w = teamWorld();
      const report = await round(w, true, false, switchingToObserve(w));
      assertEquals(report.card_writes, null);
      assertEquals(w.cardEntries, []);
      assertEquals(w.deliveries, []);
    },
  );
});
