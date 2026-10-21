import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTagToLead,
  getExistingLead,
  type LeadDb,
  returningLeadStatusUpdate,
} from "./returning-lead.ts";

type Call = { table: string; op: string; args: unknown[] };

/** Fake client: each query resolves to the next queued result for its table. */
function fakeDb(results: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const db: LeadDb = {
    from(table: string) {
      const result = () => ({ data: results[table]?.shift() ?? null });
      const chain: Record<string, unknown> = {
        then: (resolve: (v: unknown) => void) => resolve(result()),
        maybeSingle: async () => result(),
        single: async () => result(),
      };
      for (const op of [
        "select",
        "eq",
        "in",
        "not",
        "order",
        "limit",
        "insert",
        "upsert",
      ]) {
        chain[op] = (...args: unknown[]) => {
          calls.push({ table, op, args });
          return chain;
        };
      }
      return chain;
    },
  };
  return { db, calls };
}

test("returns the exact-phone match without the fallback scan", async () => {
  const lead = { id: "1", phone: "0547970059", email: "a@mail.com" };
  const { db, calls } = fakeDb({ leads: [[lead]] });
  const found = await getExistingLead(db, "t1", {
    phone: "+972547970059",
    email: "a@mail.com",
  });
  assert.equal(found, lead);
  assert.equal(calls.filter((c) => c.op === "not").length, 0);
});

test("falls back to the recent-leads scan for other phone spellings", async () => {
  const lead = { id: "2", phone: "054-797-0059", email: null };
  const { db } = fakeDb({ leads: [[], [lead]] });
  const found = await getExistingLead(db, "t1", { phone: "0547970059" });
  assert.equal(found, lead);
});

test("a shared email with a different phone finds no lead", async () => {
  const other = { id: "3", phone: "972534327783", email: "aaaaa@gmail.com" };
  const { db } = fakeDb({ leads: [[], [other]] });
  const found = await getExistingLead(db, "t1", {
    phone: "+972547970059",
    email: "aaaaa@gmail.com",
  });
  assert.equal(found, null);
});

test("no phone skips the lookup entirely", async () => {
  const { db, calls } = fakeDb({});
  assert.equal(await getExistingLead(db, "t1", { email: "a@mail.com" }), null);
  assert.equal(calls.length, 0);
});

test("returning lead moves back to new", () => {
  assert.deepEqual(returningLeadStatusUpdate({ status: "contacted" }), {
    status: "new",
  });
});

test("a decided lead keeps its stage", () => {
  assert.deepEqual(returningLeadStatusUpdate({ status: "closed" }), {});
  assert.deepEqual(
    returningLeadStatusUpdate({ status: "custom_1", won_date: "2026-10-01" }),
    {},
  );
  assert.deepEqual(
    returningLeadStatusUpdate({ status: "new", client_id: "c1" }),
    {},
  );
});

test("tag: reuses an existing tag and upserts the link", async () => {
  const { db, calls } = fakeDb({ chat_tags: [{ id: "tag1" }] });
  await applyTagToLead(db, "t1", "lead1", " ליד חוזר ");
  assert.equal(calls.filter((c) => c.op === "insert").length, 0);
  const upsert = calls.find((c) => c.op === "upsert");
  assert.deepEqual(upsert?.args[0], {
    tenant_id: "t1",
    tag_id: "tag1",
    lead_id: "lead1",
    user_id: "00000000-0000-0000-0000-000000000000",
  });
  assert.deepEqual(upsert?.args[1], {
    onConflict: "tag_id,lead_id",
    ignoreDuplicates: true,
  });
});

test("tag: creates a missing tag before linking", async () => {
  const { db, calls } = fakeDb({ chat_tags: [null, { id: "tag2" }] });
  await applyTagToLead(db, "t1", "lead1", "ליד חוזר");
  const insert = calls.find((c) => c.op === "insert");
  assert.deepEqual(insert?.args[0], {
    tenant_id: "t1",
    name: "ליד חוזר",
    color: "#3b82f6",
  });
  assert.deepEqual(calls.find((c) => c.op === "upsert")?.args[0], {
    tenant_id: "t1",
    tag_id: "tag2",
    lead_id: "lead1",
    user_id: "00000000-0000-0000-0000-000000000000",
  });
});
