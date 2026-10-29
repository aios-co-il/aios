import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  applyTagToLead,
  getExistingLead,
  type LeadLookup,
  type TagDb,
  returningLeadStatusUpdate,
} from "./returning-lead.ts";

type Call = { table: string; op: string; args: unknown[] };
type FakeLead = { id: string; phone: string | null; email: string | null };
type IdRow = { id: string };

/** Fake lead queries: each call resolves to the next queued result and is recorded. */
function fakeLeads(results: FakeLead[][]) {
  const calls: string[] = [];
  const next = (name: string) => {
    calls.push(name);
    return Promise.resolve({ data: results.shift() ?? null });
  };
  const leads: LeadLookup<FakeLead> = {
    byPhones: () => next("byPhones"),
    recentWithPhone: () => next("recentWithPhone"),
  };
  return { leads, calls };
}

interface FakeChain {
  select(...args: unknown[]): FakeChain;
  match(...args: unknown[]): FakeChain;
  insert(...args: unknown[]): FakeChain;
  upsert(...args: unknown[]): Promise<unknown>;
  maybeSingle(): Promise<{ data: IdRow | null }>;
  single(): Promise<{ data: IdRow | null }>;
}

/** Fake tag client: lookups resolve to the next queued chat_tags row. */
function fakeTagDb(tags: (IdRow | null)[]) {
  const calls: Call[] = [];
  const chainFor = (table: string): FakeChain => {
    const record =
      (op: string) =>
      (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
    const nextTag = async () => ({ data: tags.shift() ?? null });
    const chain: FakeChain = {
      select: record("select"),
      match: record("match"),
      insert: record("insert"),
      upsert: async (...args: unknown[]) => {
        calls.push({ table, op: "upsert", args });
      },
      maybeSingle: nextTag,
      single: nextTag,
    };
    return chain;
  };
  const db: TagDb = { from: (table: string) => chainFor(table) };
  return { db, calls };
}

Deno.test(
  "returns the exact-phone match without the fallback scan",
  async () => {
    const lead = { id: "1", phone: "0547970059", email: "a@mail.com" };
    const { leads, calls } = fakeLeads([[lead]]);
    const found = await getExistingLead(leads, "t1", {
      phone: "+972547970059",
      email: "a@mail.com",
    });
    assertStrictEquals(found, lead);
    assertEquals(calls, ["byPhones"]);
  },
);

Deno.test(
  "falls back to the recent-leads scan for other phone spellings",
  async () => {
    const lead = { id: "2", phone: "054-797-0059", email: null };
    const { leads } = fakeLeads([[], [lead]]);
    const found = await getExistingLead(leads, "t1", {
      phone: "0547970059",
    });
    assertStrictEquals(found, lead);
  },
);

Deno.test("a shared email with a different phone finds no lead", async () => {
  const other = { id: "3", phone: "972534327783", email: "aaaaa@gmail.com" };
  const { leads } = fakeLeads([[], [other]]);
  const found = await getExistingLead(leads, "t1", {
    phone: "+972547970059",
    email: "aaaaa@gmail.com",
  });
  assertStrictEquals(found, null);
});

Deno.test("no phone skips the lookup entirely", async () => {
  const { leads, calls } = fakeLeads([]);
  assertStrictEquals(
    await getExistingLead(leads, "t1", { email: "a@mail.com" }),
    null,
  );
  assertStrictEquals(calls.length, 0);
});

Deno.test("returning lead moves back to new", () => {
  assertEquals(returningLeadStatusUpdate({ status: "contacted" }), {
    status: "new",
  });
});

Deno.test("a decided lead keeps its stage", () => {
  assertEquals(returningLeadStatusUpdate({ status: "closed" }), {});
  assertEquals(
    returningLeadStatusUpdate({ status: "custom_1", won_date: "2026-10-01" }),
    {},
  );
  assertEquals(
    returningLeadStatusUpdate({ status: "new", client_id: "c1" }),
    {},
  );
});

Deno.test("tag: reuses an existing tag and upserts the link", async () => {
  const { db, calls } = fakeTagDb([{ id: "tag1" }]);
  await applyTagToLead(db, "t1", "lead1", " ליד חוזר ");
  assertEquals(calls.find((c) => c.op === "match")?.args[0], {
    tenant_id: "t1",
    name: "ליד חוזר",
  });
  assertStrictEquals(calls.filter((c) => c.op === "insert").length, 0);
  const upsert = calls.find((c) => c.op === "upsert");
  assertEquals(upsert?.args[0], {
    tenant_id: "t1",
    tag_id: "tag1",
    lead_id: "lead1",
    user_id: "00000000-0000-0000-0000-000000000000",
  });
  assertEquals(upsert?.args[1], {
    onConflict: "tag_id,lead_id",
    ignoreDuplicates: true,
  });
});

Deno.test("tag: creates a missing tag before linking", async () => {
  const { db, calls } = fakeTagDb([null, { id: "tag2" }]);
  await applyTagToLead(db, "t1", "lead1", "ליד חוזר");
  const insert = calls.find((c) => c.op === "insert");
  assertEquals(insert?.args[0], {
    tenant_id: "t1",
    name: "ליד חוזר",
    color: "#3b82f6",
  });
  assertEquals(calls.find((c) => c.op === "upsert")?.args[0], {
    tenant_id: "t1",
    tag_id: "tag2",
    lead_id: "lead1",
    user_id: "00000000-0000-0000-0000-000000000000",
  });
});
