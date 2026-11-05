// autowrite.ts and reported contacts; beside autowrite.test.ts, which is at
// its max-lines limit.
import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { deps } from "../tests/fakes.ts";
import { finding, rules, TENANT, world } from "../tests/fake-world.ts";
import { writeTeamDrafts } from "./autowrite.ts";
import { draft, NOTIFY, reportedCall } from "./draft-fixtures.ts";

/** A team-mode run with card_write on. */
const teamRun = {
  tenantId: TENANT,
  settings: resolveManagerSettings(
    rules({
      mode: "team",
      notify_since: NOTIFY,
      kinds: {
        card_stale_group: { card_write: true, notify_since: NOTIFY },
      },
    }),
  ),
  floors: { card_stale_group: "2026-10-02T00:00:00Z" },
  dryRun: false,
  settingsChanged: () => Promise.resolve(false),
};

Deno.test("writeTeamDrafts and reported contacts", async (t) => {
  await t.step(
    "a draft holding a reported call waits for a person's approval",
    async () => {
      const summaryOnly = finding({
        kind: "card_stale_group",
        client_id: "c1",
        source_event_at: "2026-10-31T10:00:00Z",
        evidence: { card_draft: draft },
      });
      const called = {
        ...summaryOnly,
        id: "f-call",
        evidence: { card_draft: { ...draft, contact: reportedCall } },
      };
      const w = world({ findings: [called, summaryOnly] });
      const report = await writeTeamDrafts(deps(w), teamRun);
      assertEquals([report?.written, report?.failed], [1, 0]);
      assertEquals(report?.finding_ids, [summaryOnly.id]);
      assertEquals(
        w.cardEntries.map((e) => e.source),
        ["group_digest"],
      );
      assertEquals(w.findings[0].status, "open");
    },
  );

  await t.step(
    "drafts waiting for a person never crowd out one Carmen may write",
    async () => {
      const writable = finding({
        id: "f-writable",
        kind: "card_stale_group",
        client_id: "c1",
        source_event_at: "2026-10-31T10:00:00Z",
        evidence: { card_draft: draft },
      });
      const waiting = Array.from({ length: 60 }, (_, i) => ({
        ...writable,
        id: `f-call-${i}`,
        evidence: { card_draft: { ...draft, contact: reportedCall } },
      }));
      const w = world({ findings: [...waiting, writable] });
      const report = await writeTeamDrafts(deps(w), teamRun);
      assertEquals(report?.finding_ids, ["f-writable"]);
    },
  );
});
