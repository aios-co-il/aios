import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { prepareToolDispatch } from "./tool-dispatch.ts";
import {
  DEV_ESCALATION_BUGFIX_ONLY_REFUSAL_HE,
  DEV_ESCALATION_REFUSAL_HE,
} from "../_shared/dev-escalation-auth.ts";
import type { ToolCaller, ToolDispatchDependencies } from "./tool-context.ts";

const USER = "22222222-2222-4222-8222-222222222222";

Deno.test(
  "dispatcher refuses escalation before reading tenant scope",
  async () => {
    for (const tier of [null, "bugfix"] as const) {
      const calls: Array<string> = [];
      const result = await prepareToolDispatch(
        "delegate_to_github_agent",
        { tenantId: "t1", userId: "system" },
        {
          loadTier: (caller) => {
            calls.push("tier");
            assertEquals(caller, {
              tenantId: "t1",
              agentId: null,
              userId: null,
              campaignerId: null,
              phone: null,
            });
            return Promise.resolve(tier);
          },
          accessibleTenants: () => {
            calls.push("tenants");
            return Promise.resolve(["t1"]);
          },
        },
      );
      assertEquals(result, {
        refusal: {
          error: "dev_escalation_forbidden",
          message:
            tier === "bugfix"
              ? DEV_ESCALATION_BUGFIX_ONLY_REFUSAL_HE
              : DEV_ESCALATION_REFUSAL_HE,
        },
      });
      assertEquals(calls, ["tier"]);
    }
  },
);

Deno.test(
  "dispatcher preserves caller binding, scope flags, and lookup order",
  async () => {
    const calls: Array<string> = [];
    const caller: ToolCaller = {
      tenantId: "t1",
      userId: USER,
      agentId: "a1",
      callerCampaignerId: "c1",
      callerPhone: "+972500000000",
      callerRole: "team_manager",
      callerManagedAgencyIds: ["agency1"],
    };
    const result = await prepareToolDispatch("list_clients", caller, {
      loadTier: (bound) => {
        calls.push("tier");
        assertEquals(bound, {
          tenantId: "t1",
          agentId: "a1",
          userId: USER,
          campaignerId: "c1",
          phone: "+972500000000",
        });
        return Promise.resolve("full");
      },
      accessibleTenants: (tenant) => {
        calls.push("tenants");
        assertEquals(tenant, "t1");
        return Promise.resolve(["t1", "shared"]);
      },
    });
    assert("scope" in result);
    assertEquals(calls, ["tier", "tenants"]);
    assertEquals(result.scope, {
      actorUserId: USER,
      devEscalationTier: "full",
      accessibleTenantIds: ["t1", "shared"],
      isManagerRole: false,
      isTeamManager: true,
      managedAgencyIds: ["agency1"],
      bypassCampaignerScope: true,
      canManageAutomations: true,
      callerScope: {
        callerCampaignerId: "c1",
        isManagerRole: false,
        isTeamManager: true,
        managedAgencyIds: ["agency1"],
        accessibleTenantIds: ["t1", "shared"],
      },
    });
  },
);

Deno.test(
  "dispatcher retains role behavior for ordinary tools without escalation",
  async () => {
    for (const role of ["owner", "team_manager", "campaigner", null]) {
      const result = await prepareToolDispatch(
        "list_clients",
        { tenantId: "t1", userId: null, callerRole: role },
        dependencies(),
      );
      assert("scope" in result);
      assertEquals(result.scope.bypassCampaignerScope, role === "owner");
      assertEquals(
        result.scope.canManageAutomations,
        role === "owner" || role === "team_manager",
      );
      assertEquals(result.scope.managedAgencyIds, []);
    }
  },
);

Deno.test(
  "dispatcher propagates lookup failures before any execution",
  async () => {
    const deps = dependencies();
    deps.loadTier = () => Promise.reject(new Error("tier failed"));
    deps.accessibleTenants = () => {
      throw new Error("tenant lookup must not run");
    };
    await assertRejects(
      () =>
        prepareToolDispatch(
          "list_clients",
          { tenantId: "t1", userId: USER },
          deps,
        ),
      Error,
      "tier failed",
    );
  },
);

/** Provides inert lookup dependencies for scope-only tests. */
function dependencies(): ToolDispatchDependencies {
  return {
    loadTier: () => Promise.resolve(null),
    accessibleTenants: () => Promise.resolve(["t1"]),
  };
}
