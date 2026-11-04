import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { handleCarmenMessage, type CarmenContext } from "./carmen.ts";

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
function fakeDb(tables: Record<string, Array<Row>>) {
  return {
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
function tenantDb(scope: Row, extra: Record<string, Array<Row>> = {}) {
  return fakeDb({
    automation_flow_steps: [
      {
        tenant_id: TENANT,
        step_type: "trigger",
        action_type: "carmen_whatsapp_session",
        automation_id: "auto-1",
        configuration: { agent_id: "agent-1", ...scope },
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
  });
}

function groupTurn(
  supabase: unknown,
  phoneNumber: string,
  sourceChannel: CarmenContext["sourceChannel"] = "own_instance",
) {
  const sent: Array<string> = [];
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
    sendMessage: (_chatId, message) => {
      sent.push(message);
      return Promise.resolve(true);
    },
  };
  return { ctx, sent };
}

Deno.test(
  "handleCarmenMessage in a group that was never opted in",
  async (t) => {
    await t.step("stays silent before the identity check", async () => {
      const { ctx, sent } = groupTurn(
        tenantDb({ carmen_scope_mode: "all" }),
        STRANGER,
      );

      const result = await handleCarmenMessage(ctx);

      assertEquals(result, {
        handled: false,
        reason: "group_requires_explicit_scope",
      });
      assertEquals(sent, []);
    });

    await t.step(
      "stays silent on the operator mirror in open-member-groups mode",
      async () => {
        const { ctx, sent } = groupTurn(
          tenantDb({
            carmen_scope_mode: "all",
            carmen_open_member_groups: true,
          }),
          STRANGER,
          "operator_mirror",
        );

        const result = await handleCarmenMessage(ctx);

        assertEquals(result, {
          handled: false,
          reason: "group_requires_explicit_scope",
        });
        assertEquals(sent, []);
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
        const { ctx, sent } = groupTurn(
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

        const result = await handleCarmenMessage(ctx);

        assertEquals(result, { handled: true, outcome: "active" });
        assertEquals(sent.length, 1);
        assertStringIncludes(sent[0], "אני לא מזהה אותך");
      },
    );
  },
);
