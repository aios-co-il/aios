import {
  assertEquals,
  assertStringIncludes,
  assertRejects,
} from "jsr:@std/assert@1";
import {
  groupMessageInvokesCarmen,
  handleCarmenMessage,
  findCarmenSessionAutomation,
  runCarmenAI,
  type CarmenContext,
} from "./carmen.ts";
import { PermanentError } from "./carmen-config.ts";
import { serviceClient } from "./supabase-clients.ts";
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

/** An update the fake applied: its table, values and the ids it matched. */
type FakeUpdate = { table: string; values: Row; ids: Array<unknown> };

/**
 * A Supabase stand-in for the handler: every query is thenable and resolves to the
 * rows of its table that match its .eq()/.in() filters; writes resolve empty.
 */
function fakeDb(
  tables: Record<string, Array<Row>>,
  rpcs: Record<string, (args: Row) => unknown> = {},
  updates: Array<FakeUpdate> = [],
  errors: Record<string, { message: string }> = {},
  queries: Array<string> = [],
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
      queries.push(table);
      const filters: Array<(row: Row) => boolean> = [];
      let pendingUpdate: Row | null = null;
      const rows = () =>
        (tables[table] || []).filter((row) => filters.every((f) => f(row)));
      const settle = () => {
        if (errors[table]) {
          return { data: null, error: errors[table] };
        }
        if (pendingUpdate) {
          updates.push({
            table,
            values: pendingUpdate,
            ids: rows().map((row) => row.id),
          });
          pendingUpdate = null;
        }
        return { data: rows(), error: null };
      };
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
        insert: (values: Row) => {
          updates.push({ table, values, ids: [] });
          return query;
        },
        update: (values: Row) => {
          pendingUpdate = values;
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => resolve(settle()),
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
  updates: Array<FakeUpdate> = [],
  errors: Record<string, { message: string }> = {},
  queries: Array<string> = [],
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
    updates,
    errors,
    queries,
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

Deno.test(
  "handleCarmenMessage on a line with no Carmen automation",
  async (t) => {
    const DM = "972507677613@c.us";
    /** Active sessions of one DM: Carmen's own line, this line, a legacy one. */
    const sessions: Array<Row> = [
      { id: "on-carmen-line", integration_id: "integration-1" },
      { id: "on-this-line", integration_id: "mirror-line" },
      { id: "legacy", integration_id: null },
    ].map((session) => ({
      ...session,
      tenant_id: TENANT,
      status: "active",
      connection_user_id: "user-1",
      chat_id: DM,
    }));

    /** The DM reaching the mirror line, which no automation is pinned to. */
    async function mirrorTurn(integrationId: string | null) {
      const updates: Array<FakeUpdate> = [];
      const supabase = fakeDb(
        {
          automation_flow_steps: [
            {
              tenant_id: TENANT,
              step_type: "trigger",
              action_type: "carmen_whatsapp_session",
              automation_id: "auto-1",
              configuration: { carmen_integration_id: "integration-1" },
            },
          ],
          automations: [{ id: "auto-1", active: true, configuration: {} }],
          carmen_whatsapp_sessions: sessions,
        },
        {},
        updates,
      );
      const result = await handleCarmenMessage({
        supabase,
        tenantId: TENANT,
        integrationId: integrationId as string,
        connectionUserId: "user-1",
        phoneNumber: "972507677613",
        senderName: "David",
        messageText: "מה המצב?",
        isIncoming: true,
        isManualOutgoing: false,
        isGroup: false,
        chatId: DM,
        connectionRole: "secondary",
      });
      const ended = updates
        .filter((u) => u.values.status === "ended")
        .flatMap((u) => u.ids);
      return { result, ended };
    }

    await t.step("keeps the session Carmen's own line opened", async () => {
      const { result, ended } = await mirrorTurn("mirror-line");
      assertEquals(result, {
        handled: false,
        reason: "no_automation_for_integration",
      });
      assertEquals(ended, ["on-this-line", "legacy"]);
    });

    await t.step(
      "ends every session when the caller names no line",
      async () => {
        const { ended } = await mirrorTurn(null);
        assertEquals(ended, ["on-carmen-line", "on-this-line", "legacy"]);
      },
    );
  },
);

Deno.test(
  "handleCarmenMessage validates effective scope before any session query",
  async (t) => {
    for (const scope of ["invalid", {}, "private_only"]) {
      for (const withPolicy of [false, true]) {
        await t.step(
          `${JSON.stringify(scope)}, policy override: ${withPolicy}`,
          async () => {
            const queries: Array<string> = [];
            const updates: Array<FakeUpdate> = [];
            const policy = withPolicy
              ? [
                  {
                    tenant_id: TENANT,
                    agent_id: "agent-1",
                    private_phones: [{ phone: STRANGER }],
                  },
                ]
              : [];
            const db = tenantDb(
              { carmen_scope_mode: scope },
              {
                carmen_access_policies: policy,
              },
              {},
              updates,
              {},
              queries,
            );
            const { ctx } = groupTurn(db, STRANGER);
            ctx.isGroup = false;
            ctx.chatId = `${STRANGER}@c.us`;
            ctx.messageText = "מה המצב?";
            const { result, posted } = await capturingSends(() =>
              handleCarmenMessage(ctx),
            );
            const valid = withPolicy || scope === "private_only";
            assertEquals(
              result,
              valid
                ? { handled: false, reason: "no_keyword" }
                : { handled: false, reason: "invalid_scope_mode" },
            );
            assertEquals(queries.includes("carmen_whatsapp_sessions"), valid);
            assertEquals(updates, []);
            assertEquals(posted, []);
          },
        );
      }
    }
  },
);

Deno.test(
  "handleCarmenMessage stops after a failed session lookup",
  async (t) => {
    for (const hasAutomation of [true, false]) {
      await t.step(`automation available: ${hasAutomation}`, async () => {
        const queries: Array<string> = [];
        const updates: Array<FakeUpdate> = [];
        const db = tenantDb(
          { carmen_scope_mode: "private_only" },
          hasAutomation ? {} : { automation_flow_steps: [] },
          {},
          updates,
          { carmen_whatsapp_sessions: { message: "database unavailable" } },
          queries,
        );
        const { ctx } = groupTurn(db, STRANGER);
        ctx.isGroup = false;
        ctx.chatId = `${STRANGER}@c.us`;
        const { result, posted } = await capturingSends(() =>
          handleCarmenMessage(ctx),
        );
        assertEquals(
          result,
          hasAutomation
            ? { handled: true, outcome: "error" }
            : { handled: false, reason: "no_automation_for_integration" },
        );
        assertEquals(queries.at(-1), "carmen_whatsapp_sessions");
        assertEquals(updates, []);
        assertEquals(posted, []);
      });
    }
  },
);

Deno.test(
  "automation selection rejects malformed pins and retains valid base overrides",
  async (t) => {
    for (const pin of [
      42,
      {},
      true,
      false,
      0,
      [],
      "integration-1",
      "",
      null,
      undefined,
    ]) {
      await t.step(`pin: ${JSON.stringify(pin)}`, async () => {
        const db = tenantDb(
          { carmen_integration_id: pin, agent_id: 5 },
          {
            automations: [
              {
                id: "auto-1",
                active: true,
                configuration: { agent_id: "base-agent" },
              },
            ],
          },
        );
        const { ctx } = groupTurn(db, STRANGER);
        const automation = await findCarmenSessionAutomation(
          ctx.supabase,
          TENANT,
          "integration-1",
          {
            isGroup: false,
            phoneNumber: STRANGER,
          },
        );
        const valid = pin == null || typeof pin === "string";
        assertEquals(automation?.id ?? null, valid ? "auto-1" : null);
        if (valid) {
          assertEquals(automation?.configuration.agent_id, "base-agent");
        }
      });
    }
  },
);

Deno.test(
  "runCarmenAI does not retry 4xx and still retries transient failures",
  async (t) => {
    const originalFetch = globalThis.fetch;
    const oldUrl = Deno.env.get("SUPABASE_URL");
    const oldKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    Deno.env.set("SUPABASE_URL", "https://carmen.invalid");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only");
    try {
      for (const status of [400, 403, 429, 500]) {
        await t.step(`HTTP ${status}`, async () => {
          let attempts = 0;
          globalThis.fetch = () => {
            attempts++;
            return Promise.resolve(
              attempts === 1
                ? new Response("upstream detail", { status })
                : Response.json({ output: "recovered" }),
            );
          };

          /** Invoke the same agent request for each simulated HTTP response. */
          function run() {
            return runCarmenAI(serviceClient(), "agent-1", TENANT, "hello", []);
          }

          if (status < 500) {
            await assertRejects(
              run,
              PermanentError,
              `run-ai-agent ${status} — upstream detail`,
            );
            assertEquals(attempts, 1);
          } else {
            assertEquals(await run(), "recovered");
            assertEquals(attempts, 2);
          }
        });
      }
    } finally {
      globalThis.fetch = originalFetch;
      if (oldUrl === undefined) {
        Deno.env.delete("SUPABASE_URL");
      } else {
        Deno.env.set("SUPABASE_URL", oldUrl);
      }
      if (oldKey === undefined) {
        Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
      } else {
        Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", oldKey);
      }
    }
  },
);

Deno.test(
  "handleCarmenMessage answers a character's call word only on its owner's own line",
  async (t) => {
    const ownerPicksMiniMe = [
      { tenant_id: TENANT, user_id: "user-1", persona_key: "minime" },
    ];

    await t.step("the org's main Carmen line ignores it", async () => {
      const { ctx } = groupTurn(
        tenantDb(
          {
            carmen_scope_mode: "specific_group",
            carmen_allowed_group_ids: [GROUP_CHAT],
          },
          { carmen_persona_choices: ownerPicksMiniMe },
        ),
        LID,
      );
      const { result, posted } = await capturingSends(() =>
        handleCarmenMessage({ ...ctx, messageText: "מיני מי, מה המצב?" }),
      );
      assertEquals(result, { handled: false, reason: "group_not_addressed" });
      assertEquals(posted, []);
    });

    /** The owner typing "מיני מי, ..." in a private chat on their own (secondary) line. */
    const ownLineTurn = (choices: Array<Row>): CarmenContext => ({
      supabase: tenantDb(
        { carmen_integration_id: "integration-1" },
        { carmen_persona_choices: choices },
      ),
      tenantId: TENANT,
      integrationId: "integration-1",
      connectionUserId: "user-1",
      connectionRole: "secondary",
      phoneNumber: "972500000001",
      senderName: "Owner",
      messageText: "מיני מי, מה המצב?",
      isIncoming: false,
      isManualOutgoing: true,
      isGroup: false,
      chatId: "972500000001@c.us",
      sourceChannel: "own_instance",
    });

    await t.step(
      "the owner's own line wakes on the owner's call word",
      async () => {
        const { result } = await capturingSends(() =>
          handleCarmenMessage(ownLineTurn(ownerPicksMiniMe)),
        );
        assertEquals(result.handled, true);
      },
    );

    await t.step(
      "the owner's line runs Carmen as the owner's character",
      async () => {
        // The fake's insert returns the table's first row, so a closed session stands in for the new one.
        const supabase = tenantDb(
          { carmen_integration_id: "integration-1" },
          {
            carmen_persona_choices: ownerPicksMiniMe,
            carmen_whatsapp_sessions: [
              { id: "session-new", tenant_id: TENANT, status: "ended" },
            ],
          },
        );
        // The stubbed run-ai-agent answers "{}", so runCarmenAI throws after the request is sent.
        const { posted } = await capturingSends(() =>
          handleCarmenMessage({
            ...ownLineTurn(ownerPicksMiniMe),
            supabase,
          }).catch(() => null),
        );
        const run = posted.find((send) => send.fn === "run-ai-agent");
        assertEquals(run?.body.persona_user_id, "user-1");
      },
    );

    await t.step(
      "only the call word that called Carmen leaves the request",
      async () => {
        const supabase = tenantDb(
          { carmen_integration_id: "integration-1" },
          {
            carmen_persona_choices: ownerPicksMiniMe,
            carmen_whatsapp_sessions: [
              { id: "session-new", tenant_id: TENANT, status: "ended" },
            ],
          },
        );
        const { posted } = await capturingSends(() =>
          handleCarmenMessage({
            ...ownLineTurn(ownerPicksMiniMe),
            supabase,
            messageText: "מיני מי, תכתבי ברכה עבור מיני מי",
          }).catch(() => null),
        );
        const run = posted.find((send) => send.fn === "run-ai-agent");
        assertStringIncludes(String(run?.body.command_text), "עבור מיני מי");
      },
    );

    await t.step(
      "a call word matches only as a whole word on the owner's line",
      async () => {
        const turn = ownLineTurn(ownerPicksMiniMe);
        const { result } = await capturingSends(() =>
          handleCarmenMessage({ ...turn, messageText: "מיני מיםםם זה לא שם" }),
        );
        assertEquals(result, {
          handled: false,
          reason: "secondary_no_trigger",
        });
      },
    );

    await t.step(
      "a greeting saved as a call word never wakes the line",
      async () => {
        const pick = [
          { tenant_id: TENANT, user_id: "user-1", persona_key: "row-greeting" },
        ];
        const supabase = tenantDb(
          { carmen_integration_id: "integration-1" },
          {
            carmen_persona_choices: pick,
            carmen_personas: [
              {
                id: "row-greeting",
                tenant_id: TENANT,
                owner_user_id: "user-1",
                builtin_key: null,
                display_name: "שלי",
                call_words: ["היי"],
                intro_line: null,
                look: "orbs",
                mood: null,
                personality: null,
                soul: null,
                writing_style: null,
              },
            ],
          },
        );
        const { result } = await capturingSends(() =>
          handleCarmenMessage({
            ...ownLineTurn(pick),
            supabase,
            messageText: "היי, מה נשמע?",
          }),
        );
        assertEquals(result, {
          handled: false,
          reason: "secondary_no_trigger",
        });
      },
    );

    await t.step(
      "a colleague's pick does not wake the owner's line",
      async () => {
        const { result } = await capturingSends(() =>
          handleCarmenMessage(
            ownLineTurn([
              { tenant_id: TENANT, user_id: "user-2", persona_key: "minime" },
            ]),
          ),
        );
        assertEquals(result, {
          handled: false,
          reason: "secondary_no_trigger",
        });
      },
    );
  },
);

Deno.test(
  "groupMessageInvokesCarmen reads a call word as Carmen's name",
  async (t) => {
    await t.step("wakes on a direct address by the call word", () => {
      assertEquals(
        groupMessageInvokesCarmen("מיני מי, מה המצב?", ["מיני מי"]),
        true,
      );
      assertEquals(groupMessageInvokesCarmen("היי AIOS", ["aios"]), true);
    });

    await t.step(
      "stays silent on the call word without it being picked",
      () => {
        assertEquals(groupMessageInvokesCarmen("מיני מי, מה המצב?"), false);
      },
    );

    await t.step("stays silent when the group talks about it", () => {
      assertEquals(
        groupMessageInvokesCarmen("מיני מי שלחה את הדוח", ["מיני מי"]),
        false,
      );
    });

    await t.step(
      "reads a longer call word before a shorter one inside it",
      () => {
        assertEquals(
          groupMessageInvokesCarmen("AIOS Pro תבדקי את הדופק", [
            "aios",
            "aios pro",
          ]),
          true,
        );
      },
    );

    await t.step("matches a call word with symbols literally", () => {
      assertEquals(groupMessageInvokesCarmen("c++ תבדקי את זה", ["c++"]), true);
    });
  },
);
