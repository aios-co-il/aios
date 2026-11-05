import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { Row } from "./fake-db-filter.ts";
import { matrixWorld } from "./matrix-fixtures.ts";
import { getChatHistory, getRecentInboundMessages } from "./readers.ts";
import { CHAT_SCOPE_NOTES } from "./responses.ts";
import type { ChatReadContext } from "./scoped-read.ts";
import {
  CA,
  CB,
  DANA,
  DAVID,
  MANUS,
  ORG_LINE,
  T,
  base,
  role,
  world,
} from "./test-fixtures.ts";

Deno.test("getChatHistory", async (t) => {
  await t.step(
    "the owner gets the contact's messages, oldest first, unchanged",
    async () => {
      const { db } = matrixWorld();
      const res = await getChatHistory(readAs(db, DAVID), {
        contact_type: "client",
        contact_id: CA,
      });
      assertEquals(Object.keys(res), ["count", "messages"]);
      assertStrictEquals(res.count, 2);
      assertEquals(res.messages, [
        oldFields("a-dm-on-david-green", "2026-10-26T08:01:00Z"),
        oldFields("a-dm-on-org-green", "2026-10-26T08:02:00Z"),
      ]);
    },
  );

  await t.step(
    "a campaigner reads only visible rows and is told the view is narrowed",
    async () => {
      const { db } = matrixWorld();
      const res = await getChatHistory(readAs(db, DANA), {
        contact_type: "client",
        contact_id: CA,
      });
      assertEquals(res.messages, [
        oldFields("a-dm-on-org-green", "2026-10-26T08:02:00Z"),
      ]);
      assertStrictEquals(res.access_scope, "staff");
      assertStrictEquals(res.access_note, CHAT_SCOPE_NOTES.staff);
    },
  );

  await t.step(
    "a contact outside a staff scope is refused before any chat query",
    async () => {
      const { db, queries } = matrixWorld();
      const res = await getChatHistory(readAs(db, DANA), {
        contact_type: "client",
        contact_id: CB,
      });
      assertStrictEquals(res.error, "access_denied");
      assertStrictEquals(res.note, CHAT_SCOPE_NOTES.clientOutOfScope);
      assertEquals(
        queries.filter((q) => q.table === "chat_messages"),
        [],
      );
    },
  );
});

Deno.test("getRecentInboundMessages", async (t) => {
  const now = new Date().toISOString();
  const inbound = [
    {
      id: "1",
      tenant_id: T,
      direction: "inbound",
      created_at: now,
      client_id: CA,
      lead_id: null,
      group_id: null,
      provider: "manus_wa",
      connection_user_id: MANUS,
      sender_name: "רון",
      sender_phone: "972500000001",
      message_text: "שלום",
      clients: { name: "לקוח א" },
      leads: null,
    },
  ];

  await t.step(
    "get_recent_inbound_messages keeps its old output shape",
    async () => {
      const { db } = world({
        chat_messages: inbound,
        user_roles: [role(DAVID, "owner")],
      });
      const res = await getRecentInboundMessages(readAs(db, DAVID), {});
      assertEquals(res, {
        count: 1,
        messages: [
          {
            id: "1",
            tenant_id: T,
            direction: "inbound",
            created_at: now,
            client_id: CA,
            lead_id: null,
            sender_name: "רון",
            sender_phone: "972500000001",
            message_text: "שלום",
            clients: { name: "לקוח א" },
            leads: null,
            contact_name: "לקוח א",
          },
        ],
      });
    },
  );

  await t.step("a run with no user reads nothing", async () => {
    const { db, queries } = world({ chat_messages: inbound });
    const res = await getRecentInboundMessages(readAs(db, null), {});
    assertStrictEquals(res.access_scope, "none");
    assertEquals(res.messages, []);
    assertEquals(
      queries.filter((q) => q.table === "chat_messages"),
      [],
    );
  });

  await t.step("a staff caller sees only lines they may read", async () => {
    const { db } = world({
      chat_messages: [
        {
          ...inbound[0],
          id: "org",
          provider: "green_api",
          connection_user_id: ORG_LINE,
        },
        {
          ...inbound[0],
          id: "david",
          provider: "green_api",
          connection_user_id: DAVID,
        },
      ],
      user_roles: [role(DANA, "campaigner")],
    });
    const res = await getRecentInboundMessages(readAs(db, DANA), {});
    assertEquals(idsOf(res.messages), ["org"]);
    assertStrictEquals(res.access_scope, "staff");
  });
});

/** A chat read in tenant T by this user, in the app (no WhatsApp turn). */
function readAs(supabase: ChatReadContext["supabase"], userId: string | null) {
  return {
    supabase,
    scopeInput: { ...base, userId, callerCampaignerId: null },
  };
}

/** A matrix row with only the fields get_chat_history always returned. */
function oldFields(id: string, created_at: string): Row {
  return {
    id,
    message_text: `תקציב ${id}`,
    direction: "inbound",
    sender_name: id,
    created_at,
  };
}

/** The ids of a reader's messages list. */
function idsOf(messages: unknown): unknown[] {
  return Array.isArray(messages) ? messages.map((m) => m.id) : [];
}
