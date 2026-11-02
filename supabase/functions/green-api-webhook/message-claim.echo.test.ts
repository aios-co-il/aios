// green-api-webhook's idMessage claim together with #961's mirror of a stored
// send, for an API echo (outgoingAPIMessageReceived).
import { assert, assertEquals } from "jsr:@std/assert@1";

import { fakeChatMessages } from "./fake-chat-messages.ts";
import { fakeClaimTables } from "./fake-claim-tables.ts";
import {
  claimWebhookMessage,
  MESSAGE_CLAIM_PROVIDER,
} from "./message-claim.ts";
import { forwardStoredSend } from "./stored-send-forward.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OWNER = "44444444-4444-4444-8444-444444444444";
const GROUP = "66666666-6666-4666-8666-666666666666";
const ID = "BAE5F1";
const KEY = { tenantId: TENANT, connectionUserId: OWNER, idMessage: ID };

/** KEY's claim, unfinished and past its lease. */
const staleClaim = () => ({
  provider: MESSAGE_CLAIM_PROVIDER,
  tenant_id: TENANT,
  external_message_id: `${OWNER}:${ID}`,
  processed_at: new Date(Date.now() - 10 * 60_000).toISOString(),
});

/** A Green API send stored before its echo, owing its team-channel mirror (#961). */
const pendingSend = (teamForward: "pending" | "done") => ({
  id: "msg-1",
  tenant_id: TENANT,
  connection_user_id: OWNER,
  group_id: GROUP,
  message_text: "תזכורת לפגישה מחר",
  raw_provider_data: {
    idMessage: ID,
    automation: true,
    team_forward: teamForward,
  },
});

/**
 * green-api-webhook's start for one delivery of an API echo, in index.ts's
 * order: the idMessage claim, then the stored-send lookup, whose hit mirrors a
 * pending send and completes the claim. The fake returns whole rows, so the
 * team_forward alias is read from raw_provider_data.
 */
function echoDeliveries(seed: {
  chats: Record<string, unknown>[];
  claims?: Record<string, unknown>[];
}) {
  const chats = fakeChatMessages(seed.chats);
  const claims = fakeClaimTables({ claims: seed.claims });
  const db = {
    from: (table: string) =>
      table === "chat_messages" ? chats.from(table) : claims.from(table),
  };
  const mirrors: unknown[][] = [];
  const deliver = async (): Promise<"duplicate" | "stored" | "new"> => {
    const claim = await claimWebhookMessage(KEY, db);
    if (claim.duplicate) {
      return "duplicate";
    }
    const { data: dupMsg } = await db
      .from("chat_messages")
      .select("id, team_forward:raw_provider_data->>team_forward")
      .eq("tenant_id", TENANT)
      .eq("connection_user_id", OWNER)
      .eq("raw_provider_data->>idMessage", ID)
      .limit(1)
      .maybeSingle();
    if (!dupMsg) {
      await claim.complete();
      return "new";
    }
    if (dupMsg.raw_provider_data.team_forward === "pending") {
      await forwardStoredSend({
        supabaseClient: db,
        ...KEY,
        webhookData: {
          senderData: { chatId: "120363@g.us", senderName: "דוד" },
          messageData: { typeMessage: "textMessage" },
        },
        connectionDisplayName: "AIOS",
        forwardToTeamChannels: (...args) => {
          mirrors.push(args);
          return Promise.resolve();
        },
      });
    }
    await claim.complete();
    return "stored";
  };
  return { deliver, mirrors, chats, claims };
}

Deno.test("message claim with #961's API echo mirror", async (t) => {
  await t.step(
    "the echo of a stored send mirrors it once; its redelivery is dropped at the claim",
    async () => {
      const run = echoDeliveries({ chats: [pendingSend("pending")] });
      assertEquals(await run.deliver(), "stored");
      assertEquals(run.mirrors.length, 1);
      assert(run.claims.claims[0].completed_at, "the echo completes its claim");
      assertEquals(await run.deliver(), "duplicate");
      assertEquals(run.mirrors.length, 1);
      assertEquals(run.chats.rows[0].raw_provider_data, {
        idMessage: ID,
        automation: true,
        team_forward: "done",
      });
    },
  );

  await t.step("two concurrent echo deliveries mirror once", async () => {
    const run = echoDeliveries({ chats: [pendingSend("pending")] });
    const outcomes = await Promise.all([run.deliver(), run.deliver()]);
    assertEquals(outcomes.sort(), ["duplicate", "stored"]);
    assertEquals(run.mirrors.length, 1);
  });

  await t.step(
    "an echo whose delivery failed is mirrored by the retry",
    async () => {
      const run = echoDeliveries({ chats: [pendingSend("pending")] });
      await (await claimWebhookMessage(KEY, run.claims)).release();
      assertEquals(await run.deliver(), "stored");
      assertEquals(run.mirrors.length, 1);
    },
  );

  await t.step(
    "a retry that takes over a stale claim after the mirror ran mirrors nothing",
    async () => {
      const run = echoDeliveries({
        chats: [pendingSend("done")],
        claims: [staleClaim()],
      });
      assertEquals(await run.deliver(), "stored");
      assertEquals(run.mirrors.length, 0);
      assert(run.claims.claims[0].completed_at);
    },
  );

  await t.step(
    "an echo that arrives before its send is stored is claimed and stored",
    async () => {
      const run = echoDeliveries({ chats: [] });
      assertEquals(await run.deliver(), "new");
      assertEquals(await run.deliver(), "duplicate");
      assertEquals(run.mirrors.length, 0);
    },
  );
});
