import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { ClientCardEntryInput } from "../client-card/entry-types.ts";
import type { CardDraft } from "./card-draft.ts";
import {
  type CardDraftWritePorts,
  writeCardDraft,
} from "./card-draft-write.ts";

const draft: CardDraft = {
  source: "group_digest",
  update_type: "group_summary",
  source_ref: "g1:m9",
  content: "[כרמן · סיכום קבוצה] אישר תקציב",
};
const finding = { id: "f1", short_code: 3, client_id: "c1" };

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
