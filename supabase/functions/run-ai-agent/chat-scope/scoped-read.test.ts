import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { applyChatScope, withChatScopeColumns } from "./filters.ts";
import {
  DANA_PHONE,
  MAYA_PHONE,
  matrixWorld,
  messages,
} from "./matrix-fixtures.ts";
import { readScopedChatRows } from "./rows.ts";
import { scopedChatRead } from "./scoped-read.ts";
import {
  AG_OWNER,
  CA,
  CB,
  DANA,
  DANA_CAMP,
  DAVID,
  MANUS,
  MAYA,
  MAYA_CAMP,
  RONIT,
  T,
  TEAM_MGR,
} from "./test-fixtures.ts";
import type { ChatScopeInput, ChatScopeRow } from "./types.ts";

type Caller = Omit<ChatScopeInput, "tenantId" | "accessibleTenantIds">;

// Each caller as run-ai-agent passes it: the verified user id and, on a
// WhatsApp turn, the sender's campaigner record and the chat. No role goes in.
const callers: Record<string, Caller> = {
  owner: { userId: DAVID, callerCampaignerId: null },
  danaInApp: { userId: DANA, callerCampaignerId: null },
  danaOnWhatsApp: {
    userId: DANA,
    callerCampaignerId: DANA_CAMP,
    waNotify: {
      chat_id: `${DANA_PHONE}@c.us`,
      is_group: false,
      connection_user_id: MANUS,
    },
  },
  ronit: { userId: RONIT, callerCampaignerId: null },
  agencyOwner: { userId: AG_OWNER, callerCampaignerId: null },
  teamManager: { userId: TEAM_MGR, callerCampaignerId: null },
  ownerElsewhereInApp: { userId: MAYA, callerCampaignerId: null },
  ownerElsewhereOnWhatsApp: {
    userId: MAYA,
    callerCampaignerId: MAYA_CAMP,
    waNotify: {
      chat_id: `${MAYA_PHONE}@c.us`,
      is_group: false,
      connection_user_id: MANUS,
    },
  },
  groupContact: {
    userId: null,
    callerCampaignerId: null,
    waNotify: {
      chat_id: "120363-a@g.us",
      is_group: true,
      connection_user_id: MANUS,
    },
  },
  unknownPrivateSender: {
    userId: null,
    callerCampaignerId: null,
    waNotify: { chat_id: "972507777777@c.us", connection_user_id: MANUS },
  },
};

const ALL_TENANT_ROWS = messages
  .filter((m) => m.tenant_id === T)
  .map((m) => String(m.id))
  .sort();

Deno.test("scopedChatRead: access matrix", async (t) => {
  await t.step("owner keeps today's tenant-wide access", async () => {
    const { ids } = await readChats(callers.owner, { keyword: "תקציב" });
    assertEquals(ids, ALL_TENANT_ROWS);
    const history = await readChats(callers.owner, {
      contact: { type: "client", id: CB },
    });
    assertEquals(history.ids, ["b-dm-on-org-green"]);
  });

  await t.step(
    "campaigner of client A asking about client B gets nothing of B",
    async () => {
      const history = await readChats(callers.danaInApp, {
        contact: { type: "client", id: CB },
      });
      assertStrictEquals(history.refused?.error, "access_denied");
      assertMatch(String(history.refused?.note), /לא משויך אליך/);

      // Widest possible read (keyword over every chat): only A's linked
      // threads, and A's DMs only from the org-wide line, not David's line.
      const all = await readChats(callers.danaInApp, { keyword: "תקציב" });
      assertEquals(all.ids, ["a-dm-on-org-green", "a-group-on-manus"]);
      assertEquals(all.pushedIds, all.ids, "the DB filter alone is exact");

      const own = await readChats(callers.danaInApp, {
        contact: { type: "client", id: CA },
      });
      assertEquals(own.ids, ["a-dm-on-org-green"]);

      const onWhatsApp = await readChats(callers.danaOnWhatsApp, {
        keyword: "תקציב",
      });
      assertEquals(onWhatsApp.ids, [
        "a-dm-on-org-green",
        "a-group-on-manus",
        "dana-chat-with-carmen",
      ]);

      const ronit = await readChats(callers.ronit, { keyword: "תקציב" });
      assertEquals(ronit.ids, ["b-dm-on-org-green", "b-group-on-manus"]);
    },
  );

  await t.step(
    "owner of another tenant, campaigner here, gets staff scope only",
    async () => {
      const inApp = await readChats(callers.ownerElsewhereInApp, {
        keyword: "תקציב",
      });
      assertStrictEquals(inApp.mode, "staff");
      assertEquals(inApp.ids, ["a-dm-on-org-green", "a-group-on-manus"]);
      assertEquals(inApp.pushedIds, inApp.ids);

      const askAboutB = await readChats(callers.ownerElsewhereInApp, {
        contact: { type: "client", id: CB },
      });
      assertStrictEquals(askAboutB.refused?.error, "access_denied");

      const onWhatsApp = await readChats(callers.ownerElsewhereOnWhatsApp, {
        keyword: "תקציב",
      });
      assertStrictEquals(onWhatsApp.mode, "staff");
      assertEquals(onWhatsApp.ids, ["a-dm-on-org-green", "a-group-on-manus"]);
    },
  );

  await t.step(
    "a client contact in a group reads only that group on Carmen's line",
    async () => {
      const all = await readChats(callers.groupContact, { keyword: "תקציב" });
      assertEquals(all.ids, ["a-group-on-manus"]);
      assertEquals(all.pushedIds, all.ids);
      const otherClient = await readChats(callers.groupContact, {
        contact: { type: "client", id: CB },
      });
      assertEquals(otherClient.ids, []);
    },
  );

  await t.step(
    "David's private DM thread is visible to nobody but the owner",
    async () => {
      const privateRows = [
        "david-private-dm",
        "david-family-group",
        "a-dm-on-david-green",
        "a-group-on-david-green",
        "david-chat-with-carmen",
      ];
      for (const [name, caller] of Object.entries(callers)) {
        if (name === "owner") {
          continue;
        }

        const res = await readChats(caller, { keyword: "תקציב" });
        const seen = [...(res.ids ?? []), ...(res.pushedIds ?? [])];
        for (const row of privateRows) {
          assert(!seen.includes(row), `${name} must not read ${row}`);
        }
      }
    },
  );

  await t.step(
    "managers see their linked threads on lines they may read",
    async () => {
      const agencyOwner = await readChats(callers.agencyOwner, {
        keyword: "תקציב",
      });
      assertEquals(agencyOwner.ids, [
        "a-dm-on-org-green",
        "a-group-on-manus",
        "b-dm-on-org-green",
        "b-group-on-manus",
        "lead-dm-on-org-green",
      ]);
      const teamManager = await readChats(callers.teamManager, {
        keyword: "תקציב",
      });
      assertEquals(teamManager.ids, agencyOwner.ids);
    },
  );

  await t.step(
    "unknown private senders and system runs read nothing",
    async () => {
      const stranger = await readChats(callers.unknownPrivateSender, {
        keyword: "תקציב",
      });
      assertStrictEquals(stranger.refused?.access_scope, "none");
      assertEquals(stranger.refused?.messages, []);
      const system = await readChats({
        userId: null,
        callerCampaignerId: null,
      });
      assertStrictEquals(system.refused?.access_scope, "none");
    },
  );
});

/**
 * The steps each chat reader takes: scopedChatRead, then refuse or read
 * through readScopedChatRows. pushedIds are the rows the DB filter alone
 * returns, before the row check.
 */
async function readChats(
  caller: Caller,
  {
    contact,
    keyword,
  }: { contact?: { type: string; id: string }; keyword?: string } = {},
): Promise<{
  refused?: Record<string, unknown>;
  mode?: string;
  ids?: string[];
  pushedIds?: string[];
}> {
  const { db } = matrixWorld();
  const { scope, refusal } = await scopedChatRead(
    {
      supabase: db,
      scopeInput: {
        tenantId: T,
        accessibleTenantIds: [T],
        today: "2026-10-26",
        ...caller,
      },
    },
    contact ?? null,
  );
  if (refusal) {
    return { refused: refusal };
  }

  /** A fresh chat_messages query, as the reader builds it. */
  const query = () => {
    let q = db
      .from("chat_messages")
      .select<string, ChatScopeRow & { id: string }>(
        withChatScopeColumns("id, message_text, created_at"),
      )
      .in("tenant_id", [T])
      .order("created_at", { ascending: false })
      .limit(100);
    if (contact) {
      q = q.eq(contact.type === "client" ? "client_id" : "lead_id", contact.id);
    }

    return keyword ? q.ilike("message_text", `%${keyword}%`) : q;
  };
  const { data: pushed } = await applyChatScope(query(), scope);
  const rows = await readScopedChatRows(db, query(), scope, [T]);
  return {
    mode: scope.mode,
    ids: rows.map((r) => String(r.id)).sort(),
    pushedIds: (pushed ?? []).map((r) => String(r.id)).sort(),
  };
}
