import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  greenLine,
  greenStep,
  manusLine,
  manusStep,
  TENANT,
  withRole,
} from "./test-fixtures.ts";
import { selectNotifyTransport } from "./transport.ts";

/** One Carmen automation (auto-1), which is also the bridge. */
const oneAutomation = {
  tenantId: TENANT,
  bridgeAutomationId: "auto-1",
  activeAutomationIds: ["auto-1"],
};

Deno.test("selectNotifyTransport", async (t) => {
  await t.step(
    "Manus step wins even when the bridge automation's first step is Green",
    () => {
      const plan = selectNotifyTransport({
        ...oneAutomation,
        steps: [greenStep("auto-1"), manusStep("auto-1", "manus-1")],
        integrations: [manusLine("manus-1")],
      });
      assertStrictEquals(plan.transport, "manus");
      assertStrictEquals(plan.functionName, "send-manus-wa-message");
      assertStrictEquals(plan.integrationId, "manus-1");
      assertStrictEquals(plan.manusIntegrationActive, true);
    },
  );

  await t.step(
    "another active Carmen automation's Manus step on a primary line beats a Green bridge",
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

  await t.step(
    "Green is only a labelled fallback when no active Manus step exists",
    () => {
      const inactive = selectNotifyTransport({
        ...oneAutomation,
        steps: [manusStep("auto-1", "manus-1"), greenStep("auto-1")],
        integrations: [manusLine("manus-1", false), greenLine()],
      });
      assertStrictEquals(inactive.transport, "green_fallback");
      assertStrictEquals(inactive.functionName, "send-green-api-message");
      assertStrictEquals(inactive.integrationId, "green-1");
      assertStrictEquals(inactive.manusIntegrationActive, false);
      assertStrictEquals(inactive.reason, "manus_integration_inactive");

      const noManus = selectNotifyTransport({
        ...oneAutomation,
        steps: [greenStep("auto-1")],
        integrations: [greenLine()],
      });
      assertStrictEquals(noManus.transport, "green_fallback");
      assertStrictEquals(noManus.reason, "no_carmen_manus_step");
    },
  );

  await t.step(
    "a secondary Manus line never beats Carmen's primary Green line",
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

  await t.step(
    "a step with no line skips the owner's older secondary Manus line",
    () => {
      const plan = selectNotifyTransport({
        ...oneAutomation,
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

  await t.step(
    "a step with no line follows the Carmen trigger pin, then the session's line",
    () => {
      const lines = [
        manusLine("manus-old", true, "user-old", { created_at: "2025-01-01" }),
        manusLine("manus-carmen", true, "user-carmen", {
          created_at: "2026-01-01",
        }),
      ];
      const base = {
        ...oneAutomation,
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

  await t.step(
    "a step that names a secondary or 'none' line is skipped, never redirected",
    () => {
      for (const role of ["secondary", "none"]) {
        const plan = selectNotifyTransport({
          ...oneAutomation,
          steps: [manusStep("auto-1", "manus-owner")],
          integrations: [withRole(manusLine("manus-owner"), role)],
        });
        assertStrictEquals(plan.transport, "none", role);
        assertStrictEquals(plan.functionName, null, role);
        assertStrictEquals(plan.reason, "manus_line_not_primary", role);
      }
    },
  );

  await t.step(
    "Green is refused when it is not primary (tenant has an active Manus line)",
    () => {
      const plan = selectNotifyTransport({
        ...oneAutomation,
        steps: [greenStep("auto-1")],
        integrations: [greenLine(), manusLine("manus-1")],
      });
      assertStrictEquals(plan.transport, "none");
      assertStrictEquals(plan.reason, "green_line_not_primary");
      assertStrictEquals(plan.skipped[0].role, "secondary");
    },
  );

  await t.step(
    "step line fields are read in Carmen's reply order; 'manuswa' rows are not sendable",
    () => {
      const plan = selectNotifyTransport({
        ...oneAutomation,
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
        ...oneAutomation,
        steps: [manusStep("auto-1", null)],
        integrations: [
          { ...manusLine("manus-alias"), integration_type: "manuswa" },
        ],
      });
      assertStrictEquals(alias.transport, "none");
    },
  );

  await t.step(
    "an inactive non-bridge automation's Manus step is ignored",
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
});
