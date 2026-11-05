import { assertEquals } from "jsr:@std/assert@1";
import { authorizeClientSend } from "./authorize.ts";
import { carmenAnswersRequestInChat } from "./carmen-proof.ts";
import {
  CLIENT,
  guardDb,
  OTHER_CLIENT,
  OTHER_TENANT,
  refusalRows,
  resolved,
  TENANT,
} from "./fake-guard-db.ts";
import {
  accessFlagsFor,
  type GroupReplyLevel,
} from "../carmen/group-reply-level.ts";
import type { ClientSendRequest, SendRecipient } from "./types.ts";

const NOW = new Date("2026-11-05T10:00:00.000Z");
const GROUP_ROW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROUP_CHAT = "120363410431767319@g.us";
const STAFF_PHONE = "972545612156";
const CLIENT_PHONE = "972521112233";

/** Minutes before NOW, as the ISO timestamp chat_messages stores. */
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString();

/** A stored message of the tenant's client group. */
const groupMessage = (fields: Record<string, unknown>) => ({
  tenant_id: TENANT,
  group_id: GROUP_ROW,
  sender_phone: STAFF_PHONE,
  send_kind: null,
  created_at: minutesAgo(2),
  ...fields,
});

/** Carmen's reply into the client group, answering STAFF_PHONE. */
const carmenReply = (
  fields: Partial<ClientSendRequest> = {},
): ClientSendRequest => ({
  functionName: "send-manus-wa-message",
  tenantId: TENANT,
  channel: "whatsapp",
  address: GROUP_CHAT,
  groupId: GROUP_ROW,
  origin: "system",
  sendKind: "carmen",
  sendRef: STAFF_PHONE,
  subjectClientId: null,
  ...fields,
});

const staff = resolved("staff", [], { sender_staff: true });
const clientGroup = resolved("client_group", [CLIENT], {
  group_id: GROUP_ROW,
});

/** The client group as the guard resolved it. */
const theGroup: SendRecipient = {
  kind: "client_group",
  clientIds: [CLIENT],
  leadId: null,
  groupId: GROUP_ROW,
  ambiguous: false,
  senderStaff: false,
};

/** The group's carmen_client_group_access row at this level. */
const accessRow = (level: GroupReplyLevel) => ({
  tenant_id: TENANT,
  whatsapp_group_id: GROUP_ROW,
  ...accessFlagsFor(level),
});

/**
 * The proof over these stored messages, with STAFF_PHONE resolved as given
 * and the group's access rows.
 */
async function proves(
  request: ClientSendRequest,
  messages: Array<Record<string, unknown>>,
  author = staff,
  access: Array<Record<string, unknown>> = [],
) {
  const { db } = guardDb({
    recipients: { "972545612156": author },
    tables: { chat_messages: messages, carmen_client_group_access: access },
  });
  return await carmenAnswersRequestInChat(db, request, theGroup, NOW);
}

Deno.test("carmenAnswersRequestInChat", async (t) => {
  await t.step("staff wrote in this group moments ago", async () => {
    assertEquals(await proves(carmenReply(), [groupMessage({})]), true);
  });

  await t.step("no send_ref proves nothing", async () => {
    assertEquals(
      await proves(carmenReply({ sendRef: null }), [groupMessage({})]),
      false,
    );
  });

  await t.step("the staff message is older than the window", async () => {
    assertEquals(
      await proves(carmenReply(), [
        groupMessage({ created_at: minutesAgo(16) }),
      ]),
      false,
    );
  });

  await t.step("the message was in another group or tenant", async () => {
    assertEquals(
      await proves(carmenReply(), [
        groupMessage({ group_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
        groupMessage({ tenant_id: OTHER_TENANT }),
      ]),
      false,
    );
  });

  await t.step("a system send in the group is no request", async () => {
    assertEquals(
      await proves(carmenReply(), [groupMessage({ send_kind: "carmen" })]),
      false,
    );
  });

  await t.step("the phone in send_ref is not the tenant's staff", async () => {
    assertEquals(
      await proves(
        carmenReply(),
        [groupMessage({})],
        resolved("client", [CLIENT]),
      ),
      false,
    );
  });

  await t.step(
    "the group's reply level decides who Carmen answers",
    async () => {
      const asked = [groupMessage({})];
      const groupClient = resolved("client_contact", [CLIENT]);
      const otherClient = resolved("client_contact", [OTHER_CLIENT]);
      assertEquals(
        await proves(carmenReply(), asked, groupClient),
        false,
        "by default the group's client gets no answer",
      );
      assertEquals(
        await proves(carmenReply(), asked, groupClient, [accessRow("client")]),
        true,
      );
      assertEquals(
        await proves(carmenReply(), asked, otherClient, [accessRow("client")]),
        false,
        "another client's contact is not this group's client",
      );
      assertEquals(
        await proves(carmenReply(), asked, staff, [
          accessRow("automations_only"),
        ]),
        false,
        "at automations_only Carmen answers nobody",
      );
      assertEquals(
        await proves(carmenReply(), asked, staff, [accessRow("staff")]),
        true,
      );
    },
  );

  await t.step(
    "a private reply goes back to that same staff phone",
    async () => {
      const privateMessage = groupMessage({ group_id: null });
      assertEquals(
        await proves(carmenReply({ address: STAFF_PHONE, groupId: null }), [
          privateMessage,
        ]),
        true,
      );
      assertEquals(
        await proves(carmenReply({ address: CLIENT_PHONE, groupId: null }), [
          privateMessage,
        ]),
        false,
        "a staff message never proves a private send to someone else",
      );
    },
  );
});

Deno.test(
  "the guard refuses an unproven Carmen send to a client",
  async (t) => {
    /** The guard's decision and refusal rows over these messages. */
    async function decide(
      request: ClientSendRequest,
      messages: Array<Record<string, unknown>>,
    ) {
      const { db, writes } = guardDb({
        recipients: { [GROUP_CHAT]: clientGroup, "972545612156": staff },
        tables: { chat_messages: messages },
      });
      const decision = await authorizeClientSend(db, request);
      return { decision, refusals: refusalRows(writes) };
    }

    await t.step("enforced, not only logged", async () => {
      const { decision, refusals } = await decide(
        carmenReply({ sendRef: null }),
        [],
      );
      assertEquals(decision.allowed, false);
      assertEquals(
        decision.allowed ? null : decision.reason,
        "carmen_unverified",
      );
      assertEquals(refusals[0].enforced, true);
    });

    await t.step("staff asked in the group: the reply goes out", async () => {
      const { decision, refusals } = await decide(carmenReply(), [
        groupMessage({
          created_at: new Date(Date.now() - 60_000).toISOString(),
        }),
      ]);
      assertEquals(decision.allowed, true);
      assertEquals(refusals, []);
    });
  },
);
