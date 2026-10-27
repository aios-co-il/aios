import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFile } from "node:fs/promises";

import {
  authorizeNotifyRequest,
  createClaudeNotifyHandler,
} from "./claude-notify-core.ts";
import { selectNotifyTransport } from "./claude-notify-transport.ts";
import { fakeFetch, fakeSupabase } from "./testing/fake-supabase.mjs";

const TENANT = "11111111-1111-4111-8111-111111111111";
const DAVID_USER = "22222222-2222-4222-8222-222222222222";
const SERVICE_KEY = "service-role-key-of-this-project";
const BEARER = "claude-mcp-bearer";
const PHONE = "972501234567";

// ── Auth matrix ──────────────────────────────────────────────────────────────

Deno.test(
  "auth: no bearer with CLAUDE_MCP_BEARER unset is refused (fails closed)",
  () => {
    assertEquals(
      authorizeNotifyRequest({
        authorization: null,
        serviceRoleKey: SERVICE_KEY,
      }),
      { ok: false },
    );
    assertEquals(
      authorizeNotifyRequest({
        authorization: "Bearer anything",
        bearerSecret: "",
        serviceRoleKey: SERVICE_KEY,
      }),
      { ok: false },
    );
  },
);

Deno.test(
  "auth: CLAUDE_MCP_BEARER and this project's service-role key are both accepted",
  () => {
    assertEquals(
      authorizeNotifyRequest({
        authorization: `Bearer ${BEARER}`,
        bearerSecret: BEARER,
        serviceRoleKey: SERVICE_KEY,
      }),
      { ok: true, via: "bearer" },
    );
    for (const bearerSecret of [BEARER, null, ""]) {
      assertEquals(
        authorizeNotifyRequest({
          authorization: `Bearer ${SERVICE_KEY}`,
          bearerSecret,
          serviceRoleKey: SERVICE_KEY,
        }),
        { ok: true, via: "service_role" },
      );
    }
  },
);

Deno.test("auth: a wrong token or an empty service key never matches", () => {
  assertStrictEquals(
    authorizeNotifyRequest({
      authorization: "Bearer other",
      bearerSecret: BEARER,
      serviceRoleKey: SERVICE_KEY,
    }).ok,
    false,
  );
  assertStrictEquals(
    authorizeNotifyRequest({
      authorization: "Bearer ",
      bearerSecret: "",
      serviceRoleKey: "",
    }).ok,
    false,
  );
});

// ── Transport selection ──────────────────────────────────────────────────────

const greenStep = (
  automation_id,
  created_at = "2026-01-01",
  green_api_integration_id = "green-1",
) => ({
  automation_id,
  action_type: "send_green_api_message",
  configuration: { green_api_integration_id },
  created_at,
});
const manusStep = (
  automation_id,
  integration_id,
  created_at = "2026-02-01",
) => ({
  automation_id,
  action_type: "send_manus_message",
  configuration: integration_id ? { integration_id } : {},
  created_at,
});
const manusLine = (id, is_active = true, user_id = null, extra = {}) => ({
  id,
  tenant_id: TENANT,
  user_id,
  integration_type: "manus_wa",
  is_active,
  created_at: "2026-01-01",
  settings: { instance_id: `inst-${id}` },
  ...extra,
});
const greenLine = (id = "green-1", extra = {}) => ({
  id,
  tenant_id: TENANT,
  user_id: null,
  integration_type: "green_api",
  is_active: true,
  created_at: "2025-06-01",
  settings: { instance_id: `inst-${id}` },
  ...extra,
});
const withRole = (row, carmen_role) => ({
  ...row,
  settings: { ...(row.settings || {}), carmen_role },
});

Deno.test(
  "transport: Manus step wins even when the bridge automation's first step is Green",
  () => {
    const plan = selectNotifyTransport({
      tenantId: TENANT,
      bridgeAutomationId: "auto-1",
      activeAutomationIds: ["auto-1"],
      steps: [greenStep("auto-1"), manusStep("auto-1", "manus-1")],
      integrations: [manusLine("manus-1")],
    });
    assertStrictEquals(plan.transport, "manus");
    assertStrictEquals(plan.functionName, "send-manus-wa-message");
    assertStrictEquals(plan.integrationId, "manus-1");
    assertStrictEquals(plan.manusIntegrationActive, true);
  },
);

Deno.test(
  "transport: another active Carmen automation's Manus step on a primary line beats a Green bridge",
  () => {
    const plan = selectNotifyTransport({
      tenantId: TENANT,
      bridgeAutomationId: "auto-green",
      activeAutomationIds: ["auto-green", "auto-manus"],
      steps: [greenStep("auto-green"), manusStep("auto-manus", null)],
      integrations: [greenLine(), manusLine("manus-1")],
    });
    assertStrictEquals(plan.transport, "manus");
    assertStrictEquals(plan.automationId, "auto-manus");
    // No line on the step, no trigger pin, no session line → the tenant's
    // primary Manus line (a Manus row with no carmen_role is primary).
    assertStrictEquals(plan.integrationId, "manus-1");
    assertStrictEquals(plan.integrationRole, "primary");
  },
);

Deno.test(
  "transport: Green is only a labelled fallback when no active Manus step exists",
  () => {
    const inactive = selectNotifyTransport({
      tenantId: TENANT,
      bridgeAutomationId: "auto-1",
      activeAutomationIds: ["auto-1"],
      steps: [manusStep("auto-1", "manus-1"), greenStep("auto-1")],
      integrations: [manusLine("manus-1", false), greenLine()],
    });
    assertStrictEquals(inactive.transport, "green_fallback");
    assertStrictEquals(inactive.functionName, "send-green-api-message");
    assertStrictEquals(inactive.integrationId, "green-1");
    assertStrictEquals(inactive.manusIntegrationActive, false);
    assertStrictEquals(inactive.reason, "manus_integration_inactive");

    const noManus = selectNotifyTransport({
      tenantId: TENANT,
      bridgeAutomationId: "auto-1",
      activeAutomationIds: ["auto-1"],
      steps: [greenStep("auto-1")],
      integrations: [greenLine()],
    });
    assertStrictEquals(noManus.transport, "green_fallback");
    assertStrictEquals(noManus.reason, "no_carmen_manus_step");
  },
);

// ── Connection roles: a secondary line never sends system notifications ────

Deno.test(
  "transport: a secondary Manus line never beats Carmen's primary Green line",
  () => {
    // Bridge automation on Carmen's Green line (marked primary) plus a second
    // active Carmen automation on the owner's personal Manus phone (secondary).
    for (const personalStep of [
      manusStep("auto-personal", "manus-owner"),
      // Same automation pinned through its Carmen trigger instead of the step.
      manusStep("auto-personal", null),
    ]) {
      const plan = selectNotifyTransport({
        tenantId: TENANT,
        bridgeAutomationId: "auto-bridge",
        activeAutomationIds: ["auto-bridge", "auto-personal"],
        steps: [
          greenStep("auto-bridge", "2026-01-01", "green-carmen"),
          personalStep,
        ],
        integrations: [
          withRole(greenLine("green-carmen"), "primary"),
          withRole(manusLine("manus-owner"), "secondary"),
        ],
        triggerPins: { "auto-personal": "manus-owner" },
      });
      assertStrictEquals(plan.transport, "green_fallback");
      assertStrictEquals(plan.integrationId, "green-carmen");
      assertStrictEquals(plan.integrationRole, "primary");
      assertStrictEquals(plan.reason, "manus_line_not_primary");
      assertEquals(plan.skipped, [
        {
          automationId: "auto-personal",
          integrationId: "manus-owner",
          role: "secondary",
          reason: "not_primary",
        },
      ]);
    }
  },
);

Deno.test(
  "transport: a step with no line skips the owner's older secondary Manus line",
  () => {
    const plan = selectNotifyTransport({
      tenantId: TENANT,
      bridgeAutomationId: "auto-1",
      activeAutomationIds: ["auto-1"],
      steps: [
        {
          ...manusStep("auto-1", null),
          configuration: { green_api_integration_id: "" },
        },
      ],
      integrations: [
        withRole(
          manusLine("manus-owner", true, null, { created_at: "2025-01-01" }),
          "secondary",
        ),
        manusLine("manus-carmen", true, null, { created_at: "2026-01-01" }),
      ],
    });
    assertStrictEquals(plan.transport, "manus");
    assertStrictEquals(plan.integrationId, "manus-carmen");
    assertStrictEquals(plan.integrationRole, "primary");
  },
);

Deno.test(
  "transport: a step with no line follows the Carmen trigger pin, then the session's line",
  () => {
    const lines = [
      manusLine("manus-old", true, "user-old", { created_at: "2025-01-01" }),
      manusLine("manus-carmen", true, "user-carmen", {
        created_at: "2026-01-01",
      }),
    ];
    const base = {
      tenantId: TENANT,
      bridgeAutomationId: "auto-1",
      activeAutomationIds: ["auto-1"],
      steps: [manusStep("auto-1", null)],
      integrations: lines,
    };
    assertStrictEquals(
      selectNotifyTransport({
        ...base,
        triggerPins: { "auto-1": "manus-carmen" },
        connectionUserIds: { "auto-1": "user-old" },
      }).integrationId,
      "manus-carmen",
    );
    assertStrictEquals(
      selectNotifyTransport({
        ...base,
        connectionUserIds: { "auto-1": "user-carmen" },
      }).integrationId,
      "manus-carmen",
    );
    // A pin to a secondary line is skipped in favour of a primary one.
    const pinnedSecondary = selectNotifyTransport({
      ...base,
      integrations: [withRole(lines[0], "secondary"), lines[1]],
      triggerPins: { "auto-1": "manus-old" },
      connectionUserIds: { "auto-1": "user-old" },
    });
    assertStrictEquals(pinnedSecondary.integrationId, "manus-carmen");
  },
);

Deno.test(
  "transport: a step that names a secondary or 'none' line is skipped, never redirected",
  () => {
    for (const role of ["secondary", "none"]) {
      const plan = selectNotifyTransport({
        tenantId: TENANT,
        bridgeAutomationId: "auto-1",
        activeAutomationIds: ["auto-1"],
        steps: [manusStep("auto-1", "manus-owner")],
        integrations: [withRole(manusLine("manus-owner"), role)],
      });
      assertStrictEquals(plan.transport, "none", role);
      assertStrictEquals(plan.functionName, null, role);
      assertStrictEquals(plan.reason, "manus_line_not_primary", role);
    }
  },
);

Deno.test(
  "transport: Green is refused when it is not primary (tenant has an active Manus line)",
  () => {
    const plan = selectNotifyTransport({
      tenantId: TENANT,
      bridgeAutomationId: "auto-1",
      activeAutomationIds: ["auto-1"],
      steps: [greenStep("auto-1")],
      integrations: [greenLine(), manusLine("manus-1")],
    });
    assertStrictEquals(plan.transport, "none");
    assertStrictEquals(plan.reason, "green_line_not_primary");
    assertStrictEquals(plan.skipped[0].role, "secondary");
  },
);

Deno.test(
  "transport: step line fields are read in Carmen's reply order; 'manuswa' rows are not sendable",
  () => {
    const plan = selectNotifyTransport({
      tenantId: TENANT,
      bridgeAutomationId: "auto-1",
      activeAutomationIds: ["auto-1"],
      steps: [
        {
          ...manusStep("auto-1", null),
          configuration: {
            green_api_integration_id: "manus-carmen",
            integration_id: "manus-other",
          },
        },
      ],
      integrations: [manusLine("manus-carmen"), manusLine("manus-other")],
    });
    assertStrictEquals(plan.integrationId, "manus-carmen");

    const alias = selectNotifyTransport({
      tenantId: TENANT,
      bridgeAutomationId: "auto-1",
      activeAutomationIds: ["auto-1"],
      steps: [manusStep("auto-1", null)],
      integrations: [
        { ...manusLine("manus-alias"), integration_type: "manuswa" },
      ],
    });
    assertStrictEquals(alias.transport, "none");
  },
);

Deno.test(
  "transport: an inactive non-bridge automation's Manus step is ignored",
  () => {
    const plan = selectNotifyTransport({
      tenantId: TENANT,
      bridgeAutomationId: null,
      activeAutomationIds: [],
      steps: [manusStep("auto-off", "manus-1")],
      integrations: [manusLine("manus-1")],
    });
    assertStrictEquals(plan.transport, "none");
    assertStrictEquals(plan.functionName, null);
  },
);

// ── Handler ──────────────────────────────────────────────────────────────────

function tenantTables({
  steps,
  integrations,
  sessions,
  trigger = {},
  reportRecipients,
  campaigners = [],
} = {}) {
  return {
    tenant_heartbeat_settings: [
      { tenant_id: TENANT, campaign_pulse_enabled: true },
    ],
    carmen_report_recipients: reportRecipients ?? [
      {
        tenant_id: TENANT,
        user_id: null,
        phone: `+${PHONE}`,
        label: "David",
        created_at: "2026-10-27T08:00:00Z",
      },
    ],
    carmen_whatsapp_sessions: sessions ?? [
      {
        tenant_id: TENANT,
        chat_id: `${PHONE}@c.us`,
        phone: PHONE,
        sender_name: "David",
        connection_user_id: DAVID_USER,
        automation_id: "auto-1",
        last_message_at: "2026-10-25T08:00:00Z",
      },
    ],
    campaigners,
    automation_flow_steps: [
      {
        tenant_id: TENANT,
        automation_id: "auto-1",
        step_type: "trigger",
        action_type: "carmen_whatsapp_session",
        configuration: trigger,
      },
      ...(steps ?? [manusStep("auto-1", "manus-1")]).map((s) => ({
        ...s,
        step_type: "action",
      })),
    ],
    automations: [{ id: "auto-1", active: true }],
    tenant_integrations: integrations ?? [manusLine("manus-1")],
  };
}

function handler({
  tables = tenantTables(),
  responses,
  bearerSecret = null,
  rpc = {},
} = {}) {
  const fetch = fakeFetch(responses);
  const warnings = [];
  const handle = createClaudeNotifyHandler({
    supabaseUrl: "https://this-project.supabase.co",
    serviceRoleKey: SERVICE_KEY,
    bearerSecret,
    createSupabase: () => fakeSupabase(tables, { rpc }),
    fetchImpl: fetch.impl,
    logger: { warn: (...a) => warnings.push(a), error: () => {} },
  });
  return { handle, fetch, warnings };
}

function post(body, token) {
  return new Request("https://x/functions/v1/claude-notify", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

const notifyBody = { tenant_id: TENANT, message: "שלום" };

Deno.test(
  "handler: unauthenticated requests get 401 and nothing is sent",
  async () => {
    const { handle, fetch } = handler();
    assertStrictEquals((await handle(post(notifyBody))).status, 401);
    assertStrictEquals((await handle(post(notifyBody, "guess"))).status, 401);
    assertStrictEquals(fetch.calls.length, 0);
  },
);

Deno.test(
  "handler: bearer and service-role callers send through Carmen's Manus line",
  async () => {
    for (const [token, bearerSecret] of [
      [BEARER, BEARER],
      [SERVICE_KEY, null],
    ]) {
      const { handle, fetch, warnings } = handler({ bearerSecret });
      const res = await handle(post(notifyBody, token));
      assertStrictEquals(res.status, 200);
      const out = await res.json();
      assertStrictEquals(out.sent, true);
      assertStrictEquals(out.status, "sent");
      assertStrictEquals(out.transport, "manus");
      assertStrictEquals(out.error, null);
      assertStrictEquals(fetch.calls.length, 1);
      assertMatch(
        fetch.calls[0].url,
        /\/functions\/v1\/send-manus-wa-message$/,
      );
      assertEquals(fetch.calls[0].body, {
        tenantId: TENANT,
        senderUserId: DAVID_USER,
        phoneNumber: PHONE,
        message: "שלום",
        integrationId: "manus-1",
      });
      assertStrictEquals(warnings.length, 0);
    }
  },
);

Deno.test(
  "handler: with an empty report list the notify keeps the staff session, not the owner",
  async () => {
    const { handle, fetch } = handler({
      tables: tenantTables({
        reportRecipients: [],
        campaigners: [
          {
            tenant_id: TENANT,
            full_name: "David",
            phone: PHONE,
            role: "מנהל צוות",
            active: true,
          },
        ],
      }),
      rpc: {
        carmen_report_staff: () => [
          {
            user_id: "33333333-3333-4333-8333-333333333333",
            full_name: "Owner",
            phone: "0509999999",
            is_owner: true,
          },
        ],
      },
    });
    const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
    assertStrictEquals(out.sent, true);
    assertStrictEquals(out.source, "tenant_staff_session");
    assertStrictEquals(fetch.calls[0].body.phoneNumber, PHONE);
  },
);

Deno.test(
  "handler: a Green send is reported as green_fallback with a warning",
  async () => {
    const { handle, fetch, warnings } = handler({
      tables: tenantTables({
        steps: [greenStep("auto-1")],
        integrations: [greenLine()],
      }),
    });
    const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
    assertStrictEquals(out.transport, "green_fallback");
    assertStrictEquals(out.sent, true);
    assertMatch(fetch.calls[0].url, /send-green-api-message$/);
    assertStrictEquals(fetch.calls[0].body.integrationId, "green-1");
    assertStrictEquals(warnings.length, 1);
    assertMatch(String(warnings[0][0]), /green_fallback/);
  },
);

Deno.test(
  "handler: reads carmen_role from the DB and never sends from a secondary line",
  async () => {
    // Carmen's line is pinned on the trigger; the owner's personal Manus phone
    // is older and marked secondary in settings.
    const integrations = [
      withRole(
        manusLine("manus-owner", true, "owner-user", {
          created_at: "2025-01-01",
        }),
        "secondary",
      ),
      manusLine("manus-carmen", true, "carmen-user", {
        created_at: "2026-01-01",
      }),
    ];
    const { handle, fetch } = handler({
      tables: tenantTables({
        steps: [manusStep("auto-1", null)],
        integrations,
      }),
    });
    const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
    assertStrictEquals(out.sent, true);
    assertStrictEquals(out.integration_id, "manus-carmen");
    assertStrictEquals(fetch.calls[0].body.integrationId, "manus-carmen");

    // Only the secondary line: refused, nothing sent.
    const onlySecondary = handler({
      tables: tenantTables({
        steps: [manusStep("auto-1", null)],
        integrations: [integrations[0]],
      }),
    });
    const refused = await (
      await onlySecondary.handle(post(notifyBody, SERVICE_KEY))
    ).json();
    assertStrictEquals(refused.sent, false);
    assertStrictEquals(refused.status, "no_transport");
    assertStrictEquals(refused.transport, "none");
    assertStrictEquals(onlySecondary.fetch.calls.length, 0);
  },
);

Deno.test(
  "handler: a step with no line uses the trigger pin, then the session's connection line",
  async () => {
    const integrations = [
      manusLine("manus-other", true, "other-user", {
        created_at: "2025-01-01",
      }),
      manusLine("manus-carmen", true, DAVID_USER, { created_at: "2026-01-01" }),
    ];
    // The session's connection user (DAVID_USER) owns manus-carmen.
    const viaSession = handler({
      tables: tenantTables({
        steps: [manusStep("auto-1", null)],
        integrations,
      }),
    });
    await viaSession.handle(post(notifyBody, SERVICE_KEY));
    assertStrictEquals(
      viaSession.fetch.calls[0].body.integrationId,
      "manus-carmen",
    );

    // The trigger pin wins over the session's line.
    const viaPin = handler({
      tables: tenantTables({
        steps: [manusStep("auto-1", null)],
        integrations,
        trigger: { carmen_integration_id: "manus-other" },
      }),
    });
    await viaPin.handle(post(notifyBody, SERVICE_KEY));
    assertStrictEquals(viaPin.fetch.calls[0].body.integrationId, "manus-other");
  },
);

Deno.test("handler: returns the real send result instead of ok", async () => {
  const cases = [
    [{ status: 500, body: { error: "Manus WA error [500]" } }, "failed"],
    [
      { status: 202, body: { success: false, delivered: "unknown" } },
      "delivery_unknown",
    ],
    [
      {
        status: 403,
        body: {
          error: "blocked_by_staging_safe_mode",
          reason: "empty_allowlist",
        },
      },
      "blocked_staging",
    ],
  ];
  for (const [response, status] of cases) {
    const { handle } = handler({ responses: [response] });
    const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
    assertStrictEquals(out.sent, false, status);
    assertStrictEquals(out.ok, false, status);
    assertStrictEquals(out.status, status);
    assert(out.error, status);
  }
});

Deno.test(
  "handler: ping reports the step and line role per tenant and sends nothing",
  async () => {
    const { handle, fetch } = handler({
      tables: tenantTables({
        steps: [greenStep("auto-1"), manusStep("auto-1", "manus-1")],
        integrations: [manusLine("manus-1", false), greenLine()],
      }),
    });
    const res = await handle(post({ ping: true }, SERVICE_KEY));
    const out = await res.json();
    assertStrictEquals(res.status, 200);
    assertStrictEquals(out.ping, true);
    assertStrictEquals(out.sent, false);
    assertEquals(out.tenants, [
      {
        tenant_id: TENANT,
        transport: "green_fallback",
        step_type: "send_green_api_message",
        automation_id: "auto-1",
        integration_id: "green-1",
        integration_role: "primary",
        integration_primary: true,
        manus_integration_active: false,
        active_manus_integrations: 0,
        primary_manus_integrations: 0,
        skipped_lines: [
          {
            automation_id: "auto-1",
            integration_id: "manus-1",
            role: "primary",
            reason: "inactive",
          },
        ],
        recipient_source: "report_recipient",
        sender_resolved: true,
        reason: "manus_integration_inactive",
      },
    ]);
    assertStrictEquals(fetch.calls.length, 0);
    assertStrictEquals((await handle(post({ ping: true }))).status, 401);
  },
);

Deno.test(
  "handler: ping shows a secondary-only tenant as refused, with the skipped line's role",
  async () => {
    const { handle, fetch } = handler({
      tables: tenantTables({
        steps: [manusStep("auto-1", "manus-owner")],
        integrations: [withRole(manusLine("manus-owner"), "secondary")],
      }),
    });
    const out = await (
      await handle(post({ ping: true, tenant_id: TENANT }, SERVICE_KEY))
    ).json();
    const [tenant] = out.tenants;
    assertStrictEquals(tenant.transport, "none");
    assertStrictEquals(tenant.integration_role, null);
    assertStrictEquals(tenant.integration_primary, false);
    assertStrictEquals(tenant.active_manus_integrations, 1);
    assertStrictEquals(tenant.primary_manus_integrations, 0);
    assertEquals(tenant.skipped_lines, [
      {
        automation_id: "auto-1",
        integration_id: "manus-owner",
        role: "secondary",
        reason: "not_primary",
      },
    ]);
    assertStrictEquals(tenant.reason, "manus_line_not_primary");
    assertStrictEquals(fetch.calls.length, 0);
  },
);

Deno.test(
  "claude-notify edge function only wires env into the shared handler",
  async () => {
    const source = await readFile(
      new URL("../claude-notify/index.ts", import.meta.url),
      "utf8",
    );
    assertMatch(source, /createClaudeNotifyHandler/);
    assertMatch(source, /CLAUDE_MCP_BEARER/);
    assertNotMatch(source, /functions\/v1\//);
  },
);
