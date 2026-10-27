import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { deps } from "../tests/fakes.ts";
import { finding, rules, TENANT, world } from "../tests/fake-world.ts";
import { writeTeamDrafts, writingKinds } from "./autowrite.ts";

const NOTIFY = "2026-10-01T00:00:00Z";
const draft = {
  source: "group_digest",
  update_type: "group_summary",
  source_ref: "g1:m9",
  content: "[כרמן · סיכום קבוצה] אישר תקציב",
};
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
    "writes each due draft once and closes its finding",
    async () => {
      const w = world({ findings: [stale()] });
      const report = await writeTeamDrafts(deps(w), run());
      assertEquals([report?.written, report?.failed], [1, 0]);
      assertEquals(
        w.cardEntries.map((e) => [e.source, e.sourceRef, e.countsAsContact]),
        [["group_digest", "g1:m9", false]],
      );
      assertEquals(w.findings[0].status, "resolved");
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
      assertEquals(w.findings[0].status, "open");
    },
  );
});
