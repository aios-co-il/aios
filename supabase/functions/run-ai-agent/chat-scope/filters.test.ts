import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import { evalFilter, parseOrFilter } from "./fake-db-filter.ts";
import {
  applyChatScope,
  chatScopeFilters,
  withChatScopeColumns,
} from "./filters.ts";
import { CHAT_SCOPE_NOTES } from "./responses.ts";
import { isChatRowVisible } from "./rows.ts";
import {
  AG1,
  CA,
  CB,
  DANA,
  DAVID,
  GA,
  GB,
  MANUS,
  ORG_LINE,
  staff,
} from "./test-fixtures.ts";

Deno.test("withChatScopeColumns", async (t) => {
  await t.step("adds missing columns once and ignores embeds", () => {
    assertStrictEquals(
      withChatScopeColumns("id, message_text, created_at"),
      "id, message_text, created_at, client_id, lead_id, group_id, provider, connection_user_id, sender_phone",
    );
    assertStrictEquals(
      withChatScopeColumns(
        "message_text, sender_phone, group_id, provider, clients(name, client_id)",
      ),
      "message_text, sender_phone, group_id, provider, clients(name, client_id), client_id, lead_id, connection_user_id",
    );
  });
});

Deno.test("chatScopeFilters", async (t) => {
  await t.step("full adds nothing, none matches nothing", () => {
    assertEquals(chatScopeFilters({ ...staff(), mode: "full" }), []);
    assertEquals(
      chatScopeFilters({
        ...staff(),
        mode: "none",
        reason: CHAT_SCOPE_NOTES.notStaff,
      }),
      [{ op: "is", column: "id", value: null }],
    );
    assertEquals(
      chatScopeFilters(staff({ clientIds: [], linkedGroupIds: [] })),
      [{ op: "is", column: "id", value: null }],
    );
  });

  await t.step("a group turn reads only that group", () => {
    const group = staff({ mode: "group", groupId: GA });
    assertEquals(chatScopeFilters({ ...group, connectionUserIds: [] }), [
      { op: "eq", column: "group_id", value: GA },
      { op: "neq", column: "provider", value: "green_api" },
    ]);
    assertEquals(chatScopeFilters(group), [
      { op: "eq", column: "group_id", value: GA },
      {
        op: "or",
        value: `provider.neq.green_api,connection_user_id.in.(${DANA},${ORG_LINE})`,
      },
    ]);
  });

  await t.step("the staff or() string parses and matches the row rule", () => {
    const scope = staff({
      leads: { all: false, agencyIds: [AG1], salesPersonId: null },
      ownThread: { phoneTail: "501234567", connectionUserId: MANUS },
    });
    const [only] = chatScopeFilters(scope);
    assertStrictEquals(only.op, "or");
    const tree = parseOrFilter(only.op === "or" ? only.value : "");
    const rows = [
      { provider: "green_api", connection_user_id: ORG_LINE, client_id: CA },
      { provider: "green_api", connection_user_id: DAVID, client_id: CA },
      { provider: "manus_wa", connection_user_id: MANUS, client_id: CB },
      { provider: "manus_wa", connection_user_id: MANUS, group_id: GA },
      { provider: "green_api", connection_user_id: DAVID },
      {
        provider: "manus_wa",
        connection_user_id: MANUS,
        sender_phone: "972501234567",
      },
      {
        provider: "manus_wa",
        connection_user_id: MANUS,
        sender_phone: "972508888888",
      },
    ];
    for (const r of rows) {
      assertStrictEquals(
        evalFilter(r, tree),
        isChatRowVisible(r, scope),
        JSON.stringify(r),
      );
    }
  });

  await t.step("long id lists fall back to a coarse filter", () => {
    const many = Array.from(
      { length: 200 },
      (_, i) => `c0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const [only] = chatScopeFilters(staff({ clientIds: many }));
    assertMatch(only.op === "or" ? only.value : "", /client_id\.not\.is\.null/);
  });
});

Deno.test("applyChatScope", async (t) => {
  await t.step("chains the filters on a query", async () => {
    const { db, queries } = fakeDb({
      chat_messages: [
        {
          id: "1",
          provider: "manus_wa",
          group_id: GA,
          connection_user_id: MANUS,
        },
        {
          id: "2",
          provider: "green_api",
          group_id: GA,
          connection_user_id: DAVID,
        },
        { id: "3", provider: "manus_wa", group_id: GB },
      ],
    });
    const scope = staff({ mode: "group", groupId: GA, connectionUserIds: [] });
    const { data } = await applyChatScope(
      db.from("chat_messages").select("id"),
      scope,
    );
    assertEquals(
      (data ?? []).map((r) => r.id),
      ["1"],
    );
    assertEquals(queries[0].calls, ["eq:group_id", "neq:provider"]);
  });
});
