import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import { sendTargetFor } from "./send-target.ts";
import { CA, CB, L1, L2, T, T2 } from "./test-fixtures.ts";

const contacts = {
  clients: [
    {
      id: CA,
      tenant_id: T,
      phone: "972500000001",
      name: "א",
      contact_name: "",
    },
    { id: CB, tenant_id: T2, phone: "972500000002", name: "ב" },
  ],
  leads: [
    { id: L1, tenant_id: T, phone: "972500000003", company_name: "ליד" },
    { id: L2, tenant_id: T2, phone: "972500000004", company_name: "אחר" },
  ],
};

Deno.test("sendTargetFor", async (t) => {
  await t.step("finds a client or lead in the caller's tenants", async () => {
    const { db } = fakeDb(contacts);
    assertEquals(await sendTargetFor(db, "client", CA, [T]), {
      phone: "972500000001",
      contactName: "א",
    });
    assertEquals(await sendTargetFor(db, "lead", L1, [T]), {
      phone: "972500000003",
      contactName: "ליד",
    });
  });

  await t.step("finds nothing in another tenant", async () => {
    const { db } = fakeDb(contacts);
    const none = { phone: null, contactName: null };
    assertEquals(await sendTargetFor(db, "client", CB, [T]), none);
    assertEquals(await sendTargetFor(db, "lead", L2, [T]), none);
  });

  await t.step("a malformed id finds nothing without a query", async () => {
    const { db, queries } = fakeDb(contacts);
    assertStrictEquals(
      (await sendTargetFor(db, "lead", "not-a-uuid", [T])).phone,
      null,
    );
    assertStrictEquals(queries.length, 0);
  });

  await t.step("a failing lookup rejects", async () => {
    const { db } = fakeDb({}, {}, { clients: new Error("db down") });
    await assertRejects(
      () => sendTargetFor(db, "client", CA, [T]),
      Error,
      "db down",
    );
  });
});
