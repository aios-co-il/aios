import { assertEquals } from "jsr:@std/assert@1";
import { CLIENT, entry } from "./group-fixtures.ts";
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

  await t.step(
    "approving another draft's reported call does not clear this one",
    () => {
      const kept = keptDrafts(
        [draft("2026-11-09T10:00:00Z", "2026-11-09T12:00:00Z")],
        [
          entry(
            "2026-11-10T08:00:00Z",
            "[כרמן · מקבוצת הוואטסאפ] שיחה עם הלקוח",
            "carmen_confirmed",
            "group_contact:120363000000000001@g.us:wa-1",
          ),
          entry(
            "2026-11-10T08:00:00Z",
            "[כרמן · סיכום קבוצה] x",
            "group_digest",
          ),
        ],
        now,
      );
      assertEquals(kept.length, 1);
    },
  );

  await t.step(
    "a draft whose entry is already on the card lets it clear",
    () => {
      const summary = {
        source: "group_digest",
        update_type: "group_summary",
        source_ref: "g1:m9",
        content: "[כרמן · סיכום קבוצה] x",
      };
      const approved = draft("2026-11-09T10:00:00Z", "2026-11-09T12:00:00Z");
      approved.candidate.evidence = {
        ...approved.candidate.evidence,
        card_draft: summary,
      };
      const onCard = entry(
        "2026-11-10T08:00:00Z",
        summary.content,
        "group_digest",
        "g1:m9",
      );
      assertEquals(keptDrafts([approved], [onCard], now), []);
      const elsewhere = { ...onCard, source_ref: "g1:m3" };
      assertEquals(keptDrafts([approved], [elsewhere], now).length, 1);
    },
  );

  await t.step(
    "a draft holding a call stays until its contact is on the card too",
    () => {
      const ref = "group_contact:120363000000000001@g.us:wa-2";
      const summary = {
        source: "group_digest",
        update_type: "group_summary",
        source_ref: "g1:m9",
        content: "[כרמן · סיכום קבוצה] x",
        contact: {
          update_type: "call",
          source_ref: ref,
          content: "[כרמן · מקבוצת הוואטסאפ] שיחה עם הלקוח",
          participant_user_id: null,
          reported_at: "2026-11-09T11:00:00Z",
        },
      };
      const withCall = draft("2026-11-09T10:00:00Z", "2026-11-09T12:00:00Z");
      withCall.candidate.evidence = {
        ...withCall.candidate.evidence,
        card_draft: summary,
      };
      const summaryOnCard = entry(
        "2026-11-10T08:00:00Z",
        summary.content,
        "group_digest",
        "g1:m9",
      );
      // The summary was written, the call write failed: the retry still finds it.
      assertEquals(keptDrafts([withCall], [summaryOnCard], now).length, 1);
      const callOnCard = entry(
        "2026-11-10T08:00:01Z",
        summary.contact.content,
        "carmen_confirmed",
        ref,
      );
      assertEquals(
        keptDrafts([withCall], [summaryOnCard, callOnCard], now),
        [],
      );
    },
  );

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
