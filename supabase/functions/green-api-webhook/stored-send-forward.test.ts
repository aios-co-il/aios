import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { automationChatRow } from "../_shared/client-card/system-send.ts";
import { fakeChatMessages } from "./fake-chat-messages.ts";
import {
  claimStoredSendTeamForward,
  forwardStoredSend,
  type StoredSendForward,
} from "./stored-send-forward.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "11111111-1111-4111-8111-222222222222";
const OWNER = "44444444-4444-4444-8444-444444444444";
const GROUP = "66666666-6666-4666-8666-666666666666";

const ECHO_KEY = {
  tenantId: TENANT,
  connectionUserId: OWNER,
  idMessage: "BAE5F1",
};

const pendingRow = (groupId: string | null) => ({
  id: "msg-1",
  tenant_id: TENANT,
  connection_user_id: OWNER,
  group_id: groupId,
  message_text: "תזכורת לפגישה מחר",
  raw_provider_data: {
    idMessage: "BAE5F1",
    automation: true,
    team_forward: "pending",
  },
});

/** forwardStoredSend's context for one echo, recording each mirror it asks for. */
function echoContext(db: ReturnType<typeof fakeChatMessages>) {
  const mirrors: unknown[][] = [];
  const ctx: StoredSendForward = {
    supabaseClient: db,
    ...ECHO_KEY,
    webhookData: {
      senderData: { chatId: "120363@g.us", senderName: "דוד" },
      messageData: { typeMessage: "textMessage" },
    },
    connectionDisplayName: "AIOS",
    forwardToTeamChannels: (...args) => {
      mirrors.push(args);
      return Promise.resolve();
    },
  };
  return { ctx, mirrors };
}

Deno.test(
  "race order 1: the send is stored first; its echo mirrors it to team channels once",
  async () => {
    // recordAutomationClientSend's row, as automationChatRow builds it.
    const stored = {
      id: "msg-1",
      ...automationChatRow(
        {
          tenantId: TENANT,
          chatId: "120363@g.us",
          message: "שלום, הדוח החודשי מוכן",
          provider: "green_api",
          connectionUserId: OWNER,
          providerResponse: { idMessage: "BAE5F1" },
        },
        { clientId: null, groupId: GROUP },
      ),
    };
    const db = fakeChatMessages([stored]);
    assertEquals(await claimStoredSendTeamForward(db, ECHO_KEY), {
      id: "msg-1",
      groupId: GROUP,
      messageText: "שלום, הדוח החודשי מוכן",
    });
    // Marked done, the provider response and the stamp kept.
    assertEquals(db.rows[0].raw_provider_data, {
      idMessage: "BAE5F1",
      automation: true,
      team_forward: "done",
    });
    // A redelivered echo finds nothing left to mirror.
    assertStrictEquals(await claimStoredSendTeamForward(db, ECHO_KEY), null);
    assertStrictEquals(db.updates.length, 1);
  },
);

Deno.test(
  "two deliveries of one echo at once mirror it only once",
  async () => {
    const db = fakeChatMessages([pendingRow(null)]);
    const claims = await Promise.all([
      claimStoredSendTeamForward(db, ECHO_KEY),
      claimStoredSendTeamForward(db, ECHO_KEY),
    ]);
    assertStrictEquals(claims.filter(Boolean).length, 1);
    assertStrictEquals(claims.find(Boolean)?.groupId, null);
  },
);

Deno.test(
  "race order 2: the echo is stored first; the merged row owes no second mirror",
  async () => {
    // The webhook stored and mirrored the echo; merge_green_api_send_echo then
    // stamped the send's kind on that row instead of a second row (no
    // team_forward), so a later delivery of the echo mirrors nothing.
    const db = fakeChatMessages([
      {
        ...pendingRow(GROUP),
        id: "echo-1",
        send_kind: "automation",
        raw_provider_data: {
          typeWebhook: "outgoingAPIMessageReceived",
          idMessage: "BAE5F1",
          automation: true,
        },
      },
    ]);
    assertStrictEquals(await claimStoredSendTeamForward(db, ECHO_KEY), null);
    assertEquals(db.updates, []);
    // A send stored by send-green-api-message (a UI send, or Carmen's action
    // step) owes no mirror either, as before.
    const uiSend = fakeChatMessages([
      { ...pendingRow(null), raw_provider_data: { idMessage: "BAE5F1" } },
    ]);
    assertStrictEquals(
      await claimStoredSendTeamForward(uiSend, ECHO_KEY),
      null,
    );
  },
);

Deno.test(
  "the mirror claim is scoped to the echo's tenant and connection and never throws",
  async () => {
    for (const key of [
      { ...ECHO_KEY, tenantId: OTHER_TENANT },
      { ...ECHO_KEY, connectionUserId: "someone-else" },
      { ...ECHO_KEY, idMessage: "OTHER" },
      { ...ECHO_KEY, idMessage: "" },
      { ...ECHO_KEY, idMessage: undefined },
      { ...ECHO_KEY, connectionUserId: null },
    ]) {
      assertStrictEquals(
        await claimStoredSendTeamForward(
          fakeChatMessages([pendingRow(null)]),
          key,
        ),
        null,
        JSON.stringify(key),
      );
    }
    for (const opts of [
      { selectError: { code: "57014" } },
      { updateError: { code: "40001" } },
    ]) {
      const db = fakeChatMessages([pendingRow(null)], opts);
      assertStrictEquals(await claimStoredSendTeamForward(db, ECHO_KEY), null);
    }
    const throwing = {
      from: () => {
        throw new Error("boom");
      },
    };
    assertStrictEquals(
      await claimStoredSendTeamForward(throwing, ECHO_KEY),
      null,
    );
  },
);

Deno.test(
  "a claimed group send is mirrored to its group's team channels under the connection's name",
  async () => {
    const { ctx, mirrors } = echoContext(fakeChatMessages([pendingRow(GROUP)]));
    await forwardStoredSend(ctx);
    assertEquals(mirrors, [
      [
        ctx.supabaseClient,
        TENANT,
        OWNER,
        "120363@g.us",
        "AIOS",
        "תזכורת לפגישה מחר",
        { typeMessage: "textMessage" },
        GROUP,
      ],
    ]);
    // The same echo delivered again mirrors nothing more.
    await forwardStoredSend(ctx);
    assertStrictEquals(mirrors.length, 1);
  },
);

Deno.test(
  "a claimed private send is mirrored under the echo's sender name",
  async () => {
    const { ctx, mirrors } = echoContext(fakeChatMessages([pendingRow(null)]));
    await forwardStoredSend(ctx);
    assertStrictEquals(mirrors.length, 1);
    assertStrictEquals(mirrors[0][4], "דוד");
    assertStrictEquals(mirrors[0][7], null);
  },
);

Deno.test("an echo no stored send waits for mirrors nothing", async () => {
  const { ctx, mirrors } = echoContext(
    fakeChatMessages([
      { ...pendingRow(null), raw_provider_data: { idMessage: "BAE5F1" } },
    ]),
  );
  await forwardStoredSend(ctx);
  assertEquals(mirrors, []);
});
