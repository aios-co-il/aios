import { assertEquals } from "jsr:@std/assert@1";
import { CLIENT, entry } from "../../tests/group-fixtures.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { keptDrafts, type LiveDraft, loadLiveDrafts } from "./live-drafts.ts";

const now = new Date("2026-11-10T17:30:00Z");
const draft = (from: string, to: string): LiveDraft => ({
  candidate: {
    kind: "card_stale_group",
    fingerprint: `fp:${to}`,
    severity: "info",
    client_id: CLIENT,
    agency_id: null,
    source_event_at: from,
    summary_he: "x",
    evidence: { window: { from, to } },
    owner_user_id: null,
  },
  from,
  to,
});

Deno.test("keptDrafts", async (t) => {
  await t.step("a recent draft with no update since is reported again", () => {
    const kept = keptDrafts(
      [draft("2026-11-09T10:00:00Z", "2026-11-09T12:00:00Z")],
      [],
      now,
    );
    assertEquals(
      kept.map((c) => c.fingerprint),
      ["fp:2026-11-09T12:00:00Z"],
    );
  });

  await t.step("a person's entry after its first message lets it clear", () => {
    const kept = keptDrafts(
      [draft("2026-11-09T10:00:00Z", "2026-11-09T12:00:00Z")],
      [entry("2026-11-10T08:00:00Z", "עדכנתי")],
      now,
    );
    assertEquals(kept, []);
  });

  await t.step("a draft older than the lookback lets it clear", () => {
    assertEquals(
      keptDrafts(
        [draft("2026-11-01T10:00:00Z", "2026-11-02T12:00:00Z")],
        [],
        now,
      ),
      [],
    );
  });
});

Deno.test("loadLiveDrafts", async (t) => {
  await t.step(
    "reads only this tenant's live drafts of the collector",
    async () => {
      const row = {
        kind: "card_stale_group",
        fingerprint: "fp",
        severity: "info",
        client_id: CLIENT,
        agency_id: null,
        source_event_at: "2026-11-09T10:00:00Z",
        summary_he: "x",
        evidence: {
          window: { from: "2026-11-09T10:00:00Z", to: "2026-11-09T12:00:00Z" },
        },
        owner_user_id: null,
      };
      const { db, calls } = recordingClient(() => [
        row,
        { ...row, evidence: {} },
      ]);
      const drafts = await loadLiveDrafts(db, {
        tenantId: "t1",
        collectorId: "group_updates",
        clientIds: null,
      });
      assertEquals(drafts.length, 1);
      assertEquals(drafts[0].from, "2026-11-09T10:00:00Z");
      const query = calls[0].query;
      assertEquals(calls[0].path, "carmen_findings");
      assertEquals(
        [query.get("tenant_id"), query.get("kind"), query.get("collector")],
        ["eq.t1", "eq.card_stale_group", "eq.group_updates"],
      );
    },
  );
});
