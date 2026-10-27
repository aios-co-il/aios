import {
  assertEquals,
  assertFalse,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { CLIENT, fakeDeps, refreshOf, TENANT, USER } from "./fake-deps.ts";
import { pulseRefreshCallerRefusal } from "./input.ts";
import { runCampaignPulseRefresh } from "./run.ts";

/** How many deps ran; a refused input must leave this at 0. */
const callCount = (calls: ReturnType<typeof fakeDeps>["calls"]) =>
  calls.assert.length +
  calls.claim.length +
  calls.invoke.length +
  calls.loadPulse;

Deno.test("checkRefreshInput", async (t) => {
  await t.step(
    "a client the caller may not see is refused before anything runs",
    async () => {
      const { deps, calls } = fakeDeps({
        assertClientVisible: async () => {
          throw new Error("הלקוח לא משויך אליך");
        },
      });
      const result = await runCampaignPulseRefresh(
        { tenantId: TENANT, clientId: CLIENT },
        deps,
      );
      assertEquals(result, {
        error: "client_not_accessible",
        message: "הלקוח לא משויך אליך",
      });
      assertStrictEquals(calls.claim.length, 0);
      assertStrictEquals(calls.invoke.length, 0);
      assertStrictEquals(calls.loadPulse, 0);
    },
  );

  await t.step(
    "a visible client is checked first and the refresh still covers only the caller's tenant",
    async () => {
      const { deps, calls } = fakeDeps();
      const result = await runCampaignPulseRefresh(
        { tenantId: TENANT, clientId: CLIENT },
        deps,
      );
      assertEquals(calls.assert, [CLIENT]);
      assertEquals(calls.order, ["assert", "claim", "invoke", "loadPulse"]);
      assertStrictEquals(calls.invoke[0].tenant_id, TENANT);
      assertStrictEquals(refreshOf(result).status, "refreshed");
    },
  );

  await t.step("bad input never reaches the snapshot", async () => {
    const { deps, calls } = fakeDeps();
    assertStrictEquals(
      (await runCampaignPulseRefresh({ tenantId: "system" }, deps)).error,
      "tenant_required",
    );
    assertStrictEquals(
      (
        await runCampaignPulseRefresh(
          { tenantId: TENANT, clientId: "אלפא" },
          deps,
        )
      ).error,
      "invalid_client_id",
    );
    assertStrictEquals(
      calls.invoke.length + calls.claim.length + calls.loadPulse,
      0,
    );
  });
});

Deno.test("pulseRefreshCallerRefusal", async (t) => {
  await t.step(
    "an unidentified WhatsApp sender cannot refresh the tenant's pulse",
    async () => {
      const { deps, calls } = fakeDeps();
      // A client contact in a client group: no campaigner, no user.
      const result = await runCampaignPulseRefresh(
        { tenantId: TENANT, surface: "whatsapp" },
        deps,
      );
      assertStrictEquals(result.error, "caller_not_identified");
      assertMatch(String(result.message), /אנשי צוות/);
      assertFalse("whatsapp_digest" in result, "a refusal carries no pulse");
      assertStrictEquals(callCount(calls), 0);
      for (const surface of ["whatsapp", "task"]) {
        for (const caller of [
          { callerCampaignerId: "c-1" },
          { callerUserId: USER },
        ]) {
          assertStrictEquals(
            pulseRefreshCallerRefusal({ surface, ...caller }),
            null,
            surface,
          );
        }
      }
      // Signed-in surfaces and service callers resolve the caller themselves.
      for (const surface of ["internal_chat", "aios", "agent_direct", null]) {
        assertStrictEquals(pulseRefreshCallerRefusal({ surface }), null);
      }
      const campaigner = await runCampaignPulseRefresh(
        { tenantId: TENANT, surface: "whatsapp", callerCampaignerId: "c-1" },
        deps,
      );
      assertStrictEquals(refreshOf(campaigner).status, "refreshed");
    },
  );

  await t.step(
    "a task with no staff creator cannot refresh the tenant's pulse",
    async () => {
      // A WhatsApp group contact asked Carmen to schedule "דופק עדכני":
      // create_agent_task stores created_by=null, so run-agent-task runs the
      // task as user "system" on surface "task", with no campaigner.
      const { deps, calls } = fakeDeps();
      const result = await runCampaignPulseRefresh(
        { tenantId: TENANT, surface: "task", callerUserId: null },
        deps,
      );
      assertStrictEquals(result.error, "caller_not_identified");
      assertFalse("whatsapp_digest" in result, "a refusal carries no pulse");
      assertStrictEquals(callCount(calls), 0);
      // A task a staff member created runs as that user and still refreshes.
      const staffTask = await runCampaignPulseRefresh(
        { tenantId: TENANT, surface: "task", callerUserId: USER },
        deps,
      );
      assertStrictEquals(refreshOf(staffTask).status, "refreshed");
    },
  );
});
