import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { ClientCardEntryInput } from "../client-card/entry-types.ts";
import type { CardDraft } from "./card-draft.ts";
import {
  type CardDraftWritePorts,
  writeCardDraft,
} from "./card-draft-write.ts";
import { FINDING_LIVE_STATUSES } from "./kinds.ts";
import { quotedList } from "./migration-lists.ts";

const draft: CardDraft = {
  source: "group_digest",
  update_type: "group_summary",
  source_ref: "g1:m9",
  content: "[כרמן · סיכום קבוצה] אישר תקציב",
};
const finding = { id: "f1", short_code: 3, client_id: "c1" };
const reported: CardDraft = {
  ...draft,
  contact: {
    update_type: "call",
    source_ref: "group_contact:g1:m2",
    content: "[כרמן · מקבוצת הוואטסאפ] שיחת טלפון עם הלקוח",
    participant_user_id: null,
    reported_at: "2026-11-01T10:00:00Z",
  },
};

/** Ports over an in-memory card: entries dedupe on source_ref. */
function ports(failResolve = false) {
  const entries: ClientCardEntryInput[] = [];
  const resolved: { id: string; actor: string | null }[] = [];
  const fake: CardDraftWritePorts = {
    writeEntry(input) {
      const known = entries.find((e) => e.sourceRef === input.sourceRef);
      if (!known) {
        entries.push(input);
      }
      return Promise.resolve({
        entryId: `e:${input.sourceRef}`,
        inserted: !known,
        userId: "camp",
        attribution: "campaigner",
      });
    },
    resolveWritten(_tenant, findingId, _entry, actor) {
      if (failResolve) {
        return Promise.reject(new Error("db down"));
      }
      const first = !resolved.some((r) => r.id === findingId);
      resolved.push({ id: findingId, actor });
      return Promise.resolve(first);
    },
  };
  return { fake, entries, resolved };
}

Deno.test("writeCardDraft", async (t) => {
  await t.step(
    "writes the entry, then closes the finding as the approver's",
    async () => {
      const { fake, entries, resolved } = ports();
      const written = await writeCardDraft(fake, {
        tenantId: "t1",
        finding,
        draft,
        approvedBy: "u1",
      });
      assertEquals(written, {
        entryId: "e:g1:m9",
        inserted: true,
        attributedUserId: "camp",
        contactEntryId: null,
        resolved: true,
      });
      assertEquals(entries.length, 1);
      assertEquals(resolved, [{ id: "f1", actor: "u1" }]);
    },
  );

  await t.step(
    "a repeat returns the same entry and reports the finding already closed",
    async () => {
      const { fake, entries } = ports();
      const write = { tenantId: "t1", finding, draft, approvedBy: null };
      await writeCardDraft(fake, write);
      const again = await writeCardDraft(fake, write);
      assertEquals(
        [again.inserted, again.resolved, entries.length],
        [false, false, 1],
      );
    },
  );

  await t.step(
    "an approval also writes the reported contact, once per message",
    async () => {
      const { fake, entries } = ports();
      const first = await writeCardDraft(fake, {
        tenantId: "t1",
        finding,
        draft: reported,
        approvedBy: "u1",
      });
      // A later window's finding reports the same message again.
      await writeCardDraft(fake, {
        tenantId: "t1",
        finding: { ...finding, id: "f2" },
        draft: { ...reported, source_ref: "g1:m12" },
        approvedBy: "u1",
      });
      assertEquals(first.contactEntryId, "e:group_contact:g1:m2");
      assertEquals(
        entries.map((e) => [
          e.source,
          e.sourceRef,
          e.countsAsContact,
          e.attributedUserId,
        ]),
        [
          ["group_digest", "g1:m9", false, null],
          ["carmen_confirmed", "group_contact:g1:m2", true, "camp"],
          ["group_digest", "g1:m12", false, null],
        ],
      );
    },
  );

  await t.step(
    "Carmen alone never writes a draft holding a reported contact",
    async () => {
      const { fake, entries, resolved } = ports();
      await assertRejects(() =>
        writeCardDraft(fake, {
          tenantId: "t1",
          finding,
          draft: reported,
          approvedBy: null,
        }),
      );
      assertEquals([entries.length, resolved.length], [0, 0]);
    },
  );

  await t.step(
    "a failed close is raised after the entry is safely on the card",
    async () => {
      const { fake, entries } = ports(true);
      await assertRejects(() =>
        writeCardDraft(fake, {
          tenantId: "t1",
          finding,
          draft,
          approvedBy: null,
        }),
      );
      assertEquals(entries.length, 1);
    },
  );
});

Deno.test("carmen_finding_resolve_card_written", async (t) => {
  const sql = await Deno.readTextFile(
    new URL(
      "../../../migrations/20261101103000_carmen_group_updates.sql",
      import.meta.url,
    ),
  );

  await t.step("closes a finding only while it is live", () => {
    assertEquals(quotedList(sql, "SET status = 'resolved'", "f.status IN ("), [
      ...FINDING_LIVE_STATUSES,
    ]);
  });
});
