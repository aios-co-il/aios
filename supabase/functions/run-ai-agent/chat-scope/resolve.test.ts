import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import { isGroupTurn, resolveChatScope } from "./resolve.ts";
import {
  CHAT_SCOPE_NOTES,
  chatScopeMeta,
  chatScopeRefusal,
} from "./responses.ts";
import { isChatRowVisible } from "./rows.ts";
import {
  CA,
  DANA,
  DANA_CAMP,
  DAVID,
  GA,
  MANUS,
  ORG_LINE,
  T2,
  base,
  role,
  world,
} from "./test-fixtures.ts";

Deno.test("isGroupTurn", async (t) => {
  await t.step("a @g.us chat id or is_group marks a group turn", () => {
    assertStrictEquals(isGroupTurn({ chat_id: "120363000@g.us" }), true);
    assertStrictEquals(isGroupTurn({ chat_id: "x", is_group: true }), true);
    assertStrictEquals(isGroupTurn({ chat_id: "972501234567@c.us" }), false);
    assertStrictEquals(isGroupTurn(null), false);
  });
});

Deno.test("resolveChatScope", async (t) => {
  await t.step("owner keeps today's access after one role lookup", async () => {
    const { db, queries, rpcCalls } = world({
      user_roles: [role(DAVID, "owner")],
    });
    const scope = await resolveChatScope(db, {
      ...base,
      userId: DAVID,
      callerCampaignerId: null,
      waNotify: { chat_id: "120363-a@g.us", is_group: true },
    });
    assertStrictEquals(scope.mode, "full");
    assertEquals(
      queries.map((q) => q.table),
      ["user_roles"],
    );
    assertStrictEquals(rpcCalls.length, 0);
    assertEquals(chatScopeMeta(scope), {});
    const globalAdmin = await resolveChatScope(
      world({ user_roles: [role(DAVID, "super_admin", null)] }).db,
      { ...base, userId: DAVID, callerCampaignerId: null },
    );
    assertStrictEquals(globalAdmin.mode, "full");
  });

  await t.step(
    "an owner of another tenant who is a campaigner here gets staff scope",
    async () => {
      const roles = [
        role(DANA, "owner", T2),
        role(DANA, "super_admin", T2),
        role(DANA, "campaigner"),
      ];
      const inApp = await resolveChatScope(world({ user_roles: roles }).db, {
        ...base,
        userId: DANA,
        callerCampaignerId: null,
      });
      assertStrictEquals(inApp.mode, "staff");
      assertEquals(inApp.clientIds, [CA]);
      assertEquals(inApp.connectionUserIds, [DANA, ORG_LINE]);
      assertStrictEquals(
        isChatRowVisible(
          { provider: "green_api", connection_user_id: DAVID },
          inApp,
        ),
        false,
      );

      // On WhatsApp: matched by phone to the campaigner record in this tenant.
      const onWhatsApp = await resolveChatScope(
        world({ user_roles: roles }).db,
        {
          ...base,
          userId: DANA,
          callerCampaignerId: DANA_CAMP,
          waNotify: { chat_id: "972501234567@c.us", connection_user_id: MANUS },
        },
      );
      assertStrictEquals(onWhatsApp.mode, "staff");
      assertEquals(onWhatsApp.clientIds, [CA]);

      // An agency owner elsewhere does not read every thread here.
      const agencyElsewhere = await resolveChatScope(
        world({
          user_roles: [
            role(DANA, "agency_owner", T2),
            role(DANA, "campaigner"),
          ],
        }).db,
        { ...base, userId: DANA, callerCampaignerId: null },
      );
      assertEquals(agencyElsewhere.clientIds, [CA]);
      assertStrictEquals(agencyElsewhere.leads.all, false);

      // No role here at all: nothing, unless a campaigner record matched here.
      const ownerElsewhere = { user_roles: [role(DANA, "owner", T2)] };
      const noRoleHere = await resolveChatScope(world(ownerElsewhere).db, {
        ...base,
        userId: DANA,
        callerCampaignerId: null,
      });
      assertStrictEquals(noRoleHere.mode, "none");
      const recordOnly = await resolveChatScope(world(ownerElsewhere).db, {
        ...base,
        userId: DANA,
        callerCampaignerId: DANA_CAMP,
      });
      assertStrictEquals(recordOnly.mode, "staff");
      assertEquals(recordOnly.clientIds, [CA]);
    },
  );

  await t.step("WhatsApp turns — group, own chat, unknown sender", async () => {
    const dana = { user_roles: [role(DANA, "campaigner")] };
    const group = await resolveChatScope(world().db, {
      ...base,
      userId: null,
      callerCampaignerId: null,
      waNotify: { chat_id: "120363-a@g.us", is_group: true },
    });
    assertStrictEquals(group.mode, "group");
    assertStrictEquals(group.groupId, GA);
    assertEquals(group.connectionUserIds, []);

    const missing = await resolveChatScope(world(dana).db, {
      ...base,
      userId: DANA,
      callerCampaignerId: DANA_CAMP,
      waNotify: { chat_id: "999@g.us", is_group: true },
    });
    assertStrictEquals(missing.mode, "none");
    assertStrictEquals(missing.reason, CHAT_SCOPE_NOTES.groupNotFound);

    const own = await resolveChatScope(world(dana).db, {
      ...base,
      userId: DANA,
      callerCampaignerId: DANA_CAMP,
      waNotify: { chat_id: "972501234567@c.us", connection_user_id: MANUS },
    });
    assertEquals(own.ownThread, {
      phoneTail: "501234567",
      connectionUserId: MANUS,
    });
    assertStrictEquals(
      chatScopeMeta(own).access_note,
      CHAT_SCOPE_NOTES.staffWithOwnChat,
    );

    const stranger = await resolveChatScope(world().db, {
      ...base,
      userId: null,
      callerCampaignerId: null,
      waNotify: { chat_id: "972507777777@c.us", connection_user_id: MANUS },
    });
    assertStrictEquals(stranger.mode, "none");
    assertEquals(chatScopeRefusal(stranger), {
      count: 0,
      messages: [],
      access_scope: "none",
      note: CHAT_SCOPE_NOTES.notStaff,
    });
    const system = await resolveChatScope(world().db, {
      ...base,
      userId: null,
      callerCampaignerId: null,
    });
    assertStrictEquals(system.mode, "none");
  });

  await t.step("a failing connection lookup hides green_api rows", async () => {
    const { db } = fakeDb(
      {
        user_roles: [role(DANA, "agency_owner")],
        profiles: [],
        client_team: [],
        clients: [],
      },
      {
        chat_allowed_connection_user_ids: () => {
          throw new Error("function does not exist");
        },
      },
    );
    const warn = console.warn;
    console.warn = () => {};
    try {
      const scope = await resolveChatScope(db, {
        ...base,
        userId: DANA,
        callerCampaignerId: null,
      });
      assertStrictEquals(scope.mode, "staff");
      assertEquals(scope.connectionUserIds, []);
      assertStrictEquals(
        isChatRowVisible(
          { provider: "green_api", connection_user_id: DANA, client_id: CA },
          scope,
        ),
        false,
      );
    } finally {
      console.warn = warn;
    }
  });

  await t.step("a failing group lookup rejects", async () => {
    const { db } = fakeDb({}, {}, { whatsapp_groups: new Error("db down") });
    await assertRejects(
      () =>
        resolveChatScope(db, {
          ...base,
          userId: null,
          callerCampaignerId: null,
          waNotify: { chat_id: "120363-a@g.us", is_group: true },
        }),
      Error,
      "db down",
    );
  });
});
