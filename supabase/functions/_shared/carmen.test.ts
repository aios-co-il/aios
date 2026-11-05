import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { handleCarmenMessage, type CarmenContext } from "./carmen.ts";
import { CLIENT_INTAKE_REPLY_HE } from "./carmen/client-intake.ts";
import {
  accessFlagsFor,
  type GroupReplyLevel,
} from "./carmen/group-reply-level.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const GROUP_CHAT = "120363111222333@g.us";
const STRANGER = "972501234567";
/** A 15-digit WhatsApp LID whose last nine digits look like an Israeli mobile. */
const LID = "224686986293269";

type Row = Record<string, unknown>;

/**
 * A Supabase stand-in for the handler: every query is thenable and resolves to the
 * rows of its table that match its .eq()/.in() filters; writes resolve empty.
 */
function fakeDb(
  tables: Record<string, Array<Row>>,
  rpcs: Record<string, (args: Row) => unknown> = {},
) {
  return {
    rpc(fn: string, args: Row) {
      const answer = { data: rpcs[fn]?.(args) ?? null, error: null };
      const single = () => {
        const data = answer.data;
        return Promise.resolve({
          data: Array.isArray(data) ? (data[0] ?? null) : data,
          error: null,
        });
      };
      return {
        single,
        then: (resolve: (value: unknown) => unknown) => resolve(answer),
      };
    },
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const rows = () =>
        (tables[table] || []).filter((row) => filters.every((f) => f(row)));
      const query: Record<string, unknown> = {
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        in: (column: string, values: Array<unknown>) => {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null }),
        single: () => Promise.resolve({ data: rows()[0] ?? null }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: rows(), error: null }),
      };
      for (const passThrough of [
        "select",
        "or",
        "ilike",
        "neq",
        "gte",
        "lte",
        "is",
        "not",
        "order",
        "limit",
        "update",
        "insert",
        "upsert",
      ]) {
        query[passThrough] = () => query;
      }
      return query;
    },
  };
}

/** A tenant whose Carmen automation has the given scope, and one registered group. */
function tenantDb(
  scope: Row,
  extra: Record<string, Array<Row>> = {},
  rpcs: Record<string, (args: Row) => unknown> = {},
) {
  return fakeDb(
    {
      automation_flow_steps: [
        {
          tenant_id: TENANT,
          step_type: "trigger",
          action_type: "carmen_whatsapp_session",
          automation_id: "auto-1",
          configuration: { agent_id: "agent-1", ...scope },
        },
        {
          tenant_id: TENANT,
          step_type: "action",
          action_type: "send_manus_message",
          automation_id: "auto-1",
          configuration: { integration_id: "integration-1" },
        },
      ],
      automations: [{ id: "auto-1", active: true, configuration: {} }],
      whatsapp_groups: [
        {
          id: "group-1",
          tenant_id: TENANT,
          group_chat_id: GROUP_CHAT,
          is_blocked: false,
        },
      ],
      ...extra,
    },
    rpcs,
  );
}

/** A request body the handler posted to a send function. */
type PostedSend = { fn: string; body: Record<string, unknown> };

/**
 * Runs `turn` with fetch answering every send function, and returns the
 * sends it posted: the only way out for a Carmen reply.
 */
async function capturingSends<T>(
  turn: () => Promise<T>,
): Promise<{ result: T; posted: Array<PostedSend> }> {
  const posted: Array<PostedSend> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    posted.push({
      fn: url.split("/functions/v1/")[1] ?? url,
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  try {
    return { result: await turn(), posted };
  } finally {
    globalThis.fetch = realFetch;
  }
}

function groupTurn(
  supabase: unknown,
  phoneNumber: string,
  sourceChannel: CarmenContext["sourceChannel"] = "own_instance",
) {
  const ctx: CarmenContext = {
    supabase,
    tenantId: TENANT,
    integrationId: "integration-1",
    connectionUserId: "user-1",
    phoneNumber,
    senderName: "Participant",
    messageText: "כרמן, מה המצב?",
    isIncoming: true,
    isManualOutgoing: false,
    isGroup: true,
    chatId: GROUP_CHAT,
    sourceChannel,
  };
  return { ctx };
}

Deno.test(
  "handleCarmenMessage in a group that was never opted in",
  async (t) => {
    await t.step("stays silent before the identity check", async () => {
      const { ctx } = groupTurn(
        tenantDb({ carmen_scope_mode: "all" }),
        STRANGER,
      );

      const { result, posted } = await capturingSends(() =>
        handleCarmenMessage(ctx),
      );

      assertEquals(result, {
        handled: false,
        reason: "group_requires_explicit_scope",
      });
      assertEquals(posted, []);
    });

    await t.step(
      "stays silent on the operator mirror in open-member-groups mode",
      async () => {
        const { ctx } = groupTurn(
          tenantDb({
            carmen_scope_mode: "all",
            carmen_open_member_groups: true,
          }),
          STRANGER,
          "operator_mirror",
        );

        const { result, posted } = await capturingSends(() =>
          handleCarmenMessage(ctx),
        );

        assertEquals(result, {
          handled: false,
          reason: "group_requires_explicit_scope",
        });
        assertEquals(posted, []);
      },
    );
  },
);

Deno.test(
  "handleCarmenMessage with a LID author in an opted-in group",
  async (t) => {
    await t.step(
      "does not match the LID's tail to an approved phone",
      async () => {
        const { ctx } = groupTurn(
          tenantDb(
            {
              carmen_scope_mode: "specific_group",
              carmen_allowed_group_ids: [GROUP_CHAT],
            },
            {
              carmen_whatsapp_identities: [
                {
                  tenant_id: TENANT,
                  phone: "972986293269",
                  status: "approved",
                  entity_type: "campaigner",
                },
              ],
            },
          ),
          LID,
        );

        const { result, posted } = await capturingSends(() =>
          handleCarmenMessage(ctx),
        );

        assertEquals(result, { handled: true, outcome: "active" });
        assertEquals(posted.length, 1);
        assertEquals(posted[0].fn, "send-manus-wa-message");
        assertStringIncludes(
          String(posted[0].body.message),
          "אני לא מזהה אותך",
        );
      },
    );
  },
);

Deno.test(
  "handleCarmenMessage sends a reply only through the guarded route",
  async (t) => {
    /** A LID author in an opted-in group, so Carmen answers with a refusal. */
    const optedInTurn = (extraSteps: Array<Row> = []) =>
      groupTurn(
        tenantDb(
          {
            carmen_scope_mode: "specific_group",
            carmen_allowed_group_ids: [GROUP_CHAT],
          },
          extraSteps.length ? { automation_flow_steps: extraSteps } : {},
        ),
        LID,
      );

    await t.step(
      "stamps the reply as Carmen's, with the author as its proof",
      async () => {
        const { posted } = await capturingSends(() =>
          handleCarmenMessage(optedInTurn().ctx),
        );
        assertEquals(posted[0].body.sendKind, "carmen");
        assertEquals(posted[0].body.sendRef, LID);
        assertEquals(posted[0].body.groupId, "group-1");
      },
    );

    await t.step(
      "sends nothing when the automation has no send step",
      async () => {
        const triggerOnly = {
          tenant_id: TENANT,
          step_type: "trigger",
          action_type: "carmen_whatsapp_session",
          automation_id: "auto-1",
          configuration: {
            agent_id: "agent-1",
            carmen_scope_mode: "specific_group",
            carmen_allowed_group_ids: [GROUP_CHAT],
          },
        };
        const { result, posted } = await capturingSends(() =>
          handleCarmenMessage(optedInTurn([triggerOnly]).ctx),
        );
        assertEquals(result, { handled: true, outcome: "active" });
        assertEquals(posted, [], "no direct-to-provider fallback");
      },
    );
  },
);

Deno.test("handleCarmenMessage follows the group's reply level", async (t) => {
  const CLIENT = "33333333-3333-4333-8333-333333333333";
  const CLIENT_PHONE = "972521112233";
  const optedIn = {
    carmen_scope_mode: "specific_group",
    carmen_allowed_group_ids: [GROUP_CHAT],
  };
  /** The group's access row at this level. */
  const access = (level: GroupReplyLevel) => ({
    carmen_client_group_access: [
      {
        tenant_id: TENANT,
        whatsapp_group_id: "group-1",
        client_id: CLIENT,
        ...accessFlagsFor(level),
      },
    ],
  });
  /** The group's client, recognised by the phone on the card. */
  const clientPhone = {
    resolve_send_recipient: () => [
      {
        recipient_kind: "client",
        client_ids: [CLIENT],
        lead_id: null,
        group_id: null,
        ambiguous: false,
        sender_staff: false,
      },
    ],
    whatsapp_group_client_ids: () => [CLIENT],
  };

  await t.step("automations only: Carmen answers nobody", async () => {
    const { ctx } = groupTurn(
      tenantDb(optedIn, access("automations_only")),
      LID,
    );
    const { result, posted } = await capturingSends(() =>
      handleCarmenMessage(ctx),
    );
    assertEquals(result, { handled: true, outcome: "active" });
    assertEquals(posted, []);
  });

  await t.step(
    "client: the group's client gets the fixed thank-you, as its proof",
    async () => {
      const { ctx } = groupTurn(
        tenantDb(optedIn, access("client"), clientPhone),
        CLIENT_PHONE,
      );
      const { result, posted } = await capturingSends(() =>
        handleCarmenMessage(ctx),
      );
      assertEquals(result, { handled: true, outcome: "active" });
      assertEquals(posted[0].body.message, CLIENT_INTAKE_REPLY_HE);
      assertEquals(posted[0].body.sendRef, CLIENT_PHONE);
      assertEquals(posted[0].body.groupId, "group-1");
    },
  );

  await t.step(
    "staff (the default): an approved client contact gets nothing",
    async () => {
      const { ctx } = groupTurn(
        tenantDb(
          optedIn,
          {
            whatsapp_groups: [
              {
                id: "group-1",
                tenant_id: TENANT,
                group_chat_id: GROUP_CHAT,
                is_blocked: false,
              },
            ],
            clients: [
              {
                id: CLIENT,
                tenant_id: TENANT,
                name: "Detailit",
                whatsapp_group_id: "group-1",
              },
            ],
            carmen_whatsapp_identities: [
              {
                tenant_id: TENANT,
                phone: CLIENT_PHONE,
                status: "approved",
                entity_type: "client_contact",
                client_id: CLIENT,
              },
            ],
          },
          clientPhone,
        ),
        CLIENT_PHONE,
      );
      const { result, posted } = await capturingSends(() =>
        handleCarmenMessage(ctx),
      );
      assertEquals(result, { handled: true, outcome: "active" });
      assertEquals(posted, []);
    },
  );
});
