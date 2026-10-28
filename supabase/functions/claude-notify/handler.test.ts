import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import {
  BEARER,
  DAVID_USER,
  greenLine,
  greenStep,
  handler,
  manusLine,
  manusStep,
  notifyBody,
  PHONE,
  post,
  SERVICE_KEY,
  TENANT,
  tenantTables,
  withRole,
} from "./test-fixtures.ts";

Deno.test("createClaudeNotifyHandler", async (t) => {
  await t.step(
    "unauthenticated requests get 401 and nothing is sent",
    async () => {
      const { handle, fetch } = handler();
      assertStrictEquals((await handle(post(notifyBody))).status, 401);
      assertStrictEquals((await handle(post(notifyBody, "guess"))).status, 401);
      assertStrictEquals(fetch.calls.length, 0);
    },
  );

  await t.step(
    "bearer and service-role callers send through Carmen's Manus line",
    async () => {
      for (const [token, bearerSecret] of [
        [BEARER, BEARER],
        [SERVICE_KEY, null],
      ]) {
        const { handle, fetch, warnings } = handler({ bearerSecret });
        const res = await handle(post(notifyBody, token ?? undefined));
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

  await t.step(
    "a Green send is reported as green_fallback with a warning",
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

  await t.step(
    "reads carmen_role from the DB and never sends from a secondary line",
    async () => {
      // Carmen's line is pinned on the trigger; the owner's personal Manus
      // phone is older and marked secondary in settings.
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

  await t.step(
    "a step with no line uses the trigger pin, then the session's connection line",
    async () => {
      const integrations = [
        manusLine("manus-other", true, "other-user", {
          created_at: "2025-01-01",
        }),
        manusLine("manus-carmen", true, DAVID_USER, {
          created_at: "2026-01-01",
        }),
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
      assertStrictEquals(
        viaPin.fetch.calls[0].body.integrationId,
        "manus-other",
      );
    },
  );

  await t.step("returns the real send result instead of ok", async () => {
    const cases: [{ status: number; body: unknown }, string][] = [
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

  await t.step(
    "a failed DB read is a 500 with a generic error, not a refusal",
    async () => {
      for (const table of [
        "automation_flow_steps",
        "tenant_integrations",
        "carmen_whatsapp_sessions",
      ]) {
        const { handle, fetch, errors } = handler({
          failing: { [table]: "permission denied for table" },
        });
        const res = await handle(post(notifyBody, SERVICE_KEY));
        assertStrictEquals(res.status, 500, table);
        assertEquals(
          await res.json(),
          { ok: false, sent: false, status: "failed", error: "internal error" },
          table,
        );
        assertStrictEquals(fetch.calls.length, 0, table);
        assertMatch(String(errors[0][1]), /permission denied/, table);
      }
    },
  );

  await t.step(
    "automations and send steps are read for this tenant only",
    async () => {
      const { handle, db } = handler();
      await handle(post(notifyBody, SERVICE_KEY));
      const scoped = db.queries.filter(
        (q) =>
          q.table === "automations" ||
          (q.table === "automation_flow_steps" &&
            q.filters.some(([, col]) => col === "automation_id")),
      );
      assertStrictEquals(scoped.length, 2);
      for (const q of scoped) {
        assert(
          q.filters.some(
            ([op, col, val]) =>
              op === "eq" && col === "tenant_id" && val === TENANT,
          ),
          q.table,
        );
      }
    },
  );
});
