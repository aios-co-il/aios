import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import type { Row } from "./fake-db-filter.ts";
import { CHAT_SCOPE_NOTES } from "./responses.ts";
import {
  isChatRowVisible,
  keepVisibleChatRows,
  readScopedChatRows,
} from "./rows.ts";
import {
  AG1,
  CA,
  CB,
  DANA,
  DAVID,
  GA,
  L1,
  L2,
  MANUS,
  ORG_LINE,
  SP,
  T,
  staff,
  world,
} from "./test-fixtures.ts";

Deno.test("isChatRowVisible", async (t) => {
  await t.step(
    "green_api needs an allowed connection and a linked thread",
    () => {
      const scope = staff();
      const row = (r: Row) => isChatRowVisible(r, scope);
      assertStrictEquals(
        row({
          provider: "green_api",
          connection_user_id: ORG_LINE,
          client_id: CA,
        }),
        true,
      );
      assertStrictEquals(
        row({
          provider: "green_api",
          connection_user_id: DAVID,
          client_id: CA,
        }),
        false,
        "David's private line stays hidden even for the campaigner's own client",
      );
      assertStrictEquals(
        row({ provider: "green_api", connection_user_id: null, client_id: CA }),
        false,
      );
      assertStrictEquals(
        row({ provider: "manus_wa", connection_user_id: MANUS, client_id: CB }),
        false,
        "another campaigner's client",
      );
      assertStrictEquals(
        row({ provider: "manus_wa", connection_user_id: MANUS, group_id: GA }),
        true,
      );
      assertStrictEquals(
        row({ provider: "green_api", connection_user_id: ORG_LINE }),
        false,
        "unlinked thread",
      );
      const none = staff({ mode: "none", reason: CHAT_SCOPE_NOTES.notStaff });
      assertStrictEquals(
        isChatRowVisible({ provider: "manus_wa" }, none),
        false,
      );
      assertStrictEquals(
        isChatRowVisible({ provider: "green_api" }, staff({ mode: "full" })),
        true,
      );
    },
  );

  await t.step(
    "own private chat with Carmen: manus only, same line, same phone",
    () => {
      const scope = staff({
        clientIds: [],
        linkedGroupIds: [],
        ownThread: { phoneTail: "501234567", connectionUserId: MANUS },
      });
      const own = {
        provider: "manus_wa",
        connection_user_id: MANUS,
        sender_phone: "972501234567",
      };
      assertStrictEquals(isChatRowVisible(own, scope), true);
      assertStrictEquals(
        isChatRowVisible({ ...own, sender_phone: "972509999999" }, scope),
        false,
      );
      assertStrictEquals(
        isChatRowVisible({ ...own, group_id: GA }, scope),
        false,
      );
      assertStrictEquals(
        isChatRowVisible(
          { ...own, provider: "green_api", connection_user_id: DANA },
          scope,
        ),
        false,
      );
    },
  );
});

Deno.test("keepVisibleChatRows", async (t) => {
  await t.step(
    "lead rows are checked against the lead's agency or salesperson",
    async () => {
      const { db } = world();
      const rows = [
        { id: "1", provider: "manus_wa", lead_id: L1 },
        { id: "2", provider: "manus_wa", lead_id: L2 },
      ];
      const byAgency = staff({
        clientIds: [],
        linkedGroupIds: [],
        leads: { all: false, agencyIds: [AG1], salesPersonId: null },
      });
      assertEquals(
        (await keepVisibleChatRows(db, rows, byAgency, [T])).map((r) => r.id),
        ["1"],
      );
      const bySales = staff({
        clientIds: [],
        linkedGroupIds: [],
        leads: { all: false, agencyIds: [], salesPersonId: SP },
      });
      assertEquals(
        (await keepVisibleChatRows(db, rows, bySales, [T])).map((r) => r.id),
        ["2"],
      );
    },
  );
});

Deno.test("readScopedChatRows", async (t) => {
  const chats = [
    { id: "1", tenant_id: T, provider: "manus_wa", client_id: CA },
    { id: "2", tenant_id: T, provider: "manus_wa", client_id: CB },
    { id: "3", tenant_id: T, provider: "green_api", client_id: CA },
  ];

  await t.step("returns only the rows the scope allows", async () => {
    const { db } = fakeDb({ chat_messages: chats });
    const rows = await readScopedChatRows(
      db,
      db.from("chat_messages").select("id").in("tenant_id", [T]),
      staff({ connectionUserIds: [] }),
      [T],
    );
    assertEquals(
      rows.map((r) => r.id),
      ["1"],
    );
  });

  await t.step("throws the query's error", async () => {
    const { db } = fakeDb({}, {}, { chat_messages: new Error("db down") });
    await assertRejects(
      () => readScopedChatRows(db, db.from("chat_messages"), staff(), [T]),
      Error,
      "db down",
    );
  });
});
