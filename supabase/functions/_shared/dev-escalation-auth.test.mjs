import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  AUTHORIZED_DEV_REQUESTERS,
  BUGFIX_DEV_REQUESTERS,
  DEV_ESCALATION_BUGFIX_ONLY_REFUSAL_HE,
  DEV_ESCALATION_REFUSAL_HE,
  buildDevEscalationPromptRule,
  getDevEscalationTier,
  isAuthorizedDevRequester,
  isBugfixEscalationSkill,
  isDevEscalationSkill,
  isDevEscalationTool,
  isDevEscalationToolAllowed,
  normalizePhoneSuffix,
  resolveDevTaskActorUserId,
} from "./dev-escalation-auth.mjs";

const DAVID_CAMPAIGNER = AUTHORIZED_DEV_REQUESTERS.campaigner_ids[0];
const DAVID_USER = AUTHORIZED_DEV_REQUESTERS.user_ids[0];
const ANA_CAMPAIGNER = BUGFIX_DEV_REQUESTERS.campaigner_ids[0];
const ANA_USER = BUGFIX_DEV_REQUESTERS.user_ids[0];

Deno.test("normalizePhoneSuffix handles IL formats", () => {
  assertStrictEquals(normalizePhoneSuffix("0507677613"), "507677613");
  assertStrictEquals(normalizePhoneSuffix("972507677613"), "507677613");
  assertStrictEquals(normalizePhoneSuffix("+972-50-767-7613"), "507677613");
  assertStrictEquals(normalizePhoneSuffix("972545612156"), "545612156");
  assertStrictEquals(normalizePhoneSuffix("123"), null);
});

Deno.test("David gets full tier; Ana gets bugfix tier", () => {
  assertStrictEquals(
    getDevEscalationTier({ campaignerId: DAVID_CAMPAIGNER }),
    "full",
  );
  assertStrictEquals(getDevEscalationTier({ userId: DAVID_USER }), "full");
  assertStrictEquals(getDevEscalationTier({ phone: "972507677613" }), "full");

  assertStrictEquals(
    getDevEscalationTier({ campaignerId: ANA_CAMPAIGNER }),
    "bugfix",
  );
  assertStrictEquals(getDevEscalationTier({ userId: ANA_USER }), "bugfix");
  assertStrictEquals(getDevEscalationTier({ phone: "972545612156" }), "bugfix");

  assertStrictEquals(getDevEscalationTier({}), null);
  assertStrictEquals(
    getDevEscalationTier({
      campaignerId: "00000000-0000-0000-0000-000000000001",
    }),
    null,
  );
  assertStrictEquals(getDevEscalationTier({ phone: "0501111111" }), null);
  assertStrictEquals(getDevEscalationTier({ role: "super_admin" }), null);
});

Deno.test("isAuthorizedDevRequester true for David and Ana only", () => {
  assertStrictEquals(
    isAuthorizedDevRequester({ campaignerId: DAVID_CAMPAIGNER }),
    true,
  );
  assertStrictEquals(
    isAuthorizedDevRequester({ campaignerId: ANA_CAMPAIGNER }),
    true,
  );
  assertStrictEquals(isAuthorizedDevRequester({ phone: "0501111111" }), false);
});

Deno.test("tool allowlist by tier", () => {
  assertStrictEquals(
    isDevEscalationToolAllowed("mcp_Cursor__request_dev_task", "full"),
    true,
  );
  assertStrictEquals(
    isDevEscalationToolAllowed("mcp_Claude__ask_claude", "full"),
    true,
  );
  assertStrictEquals(
    isDevEscalationToolAllowed("mcp_Grok__ask_grok", "full"),
    true,
  );
  assertStrictEquals(
    isDevEscalationToolAllowed("delegate_to_github_agent", "full"),
    true,
  );

  assertStrictEquals(
    isDevEscalationToolAllowed("mcp_Cursor__request_dev_task", "bugfix"),
    true,
  );
  assertStrictEquals(
    isDevEscalationToolAllowed("mcp_Cursor__ask_cursor", "bugfix"),
    false,
  );
  assertStrictEquals(
    isDevEscalationToolAllowed("mcp_Claude__ask_claude", "bugfix"),
    false,
  );
  assertStrictEquals(
    isDevEscalationToolAllowed("mcp_Grok__ask_grok", "bugfix"),
    false,
  );
  assertStrictEquals(
    isDevEscalationToolAllowed("mcp_Grok__request_dev_task", "bugfix"),
    false,
  );
  assertStrictEquals(
    isDevEscalationToolAllowed("delegate_to_github_agent", "bugfix"),
    false,
  );
  assertStrictEquals(
    isDevEscalationToolAllowed("list_clients", "bugfix"),
    false,
  );
  assertStrictEquals(
    isDevEscalationToolAllowed("mcp_Cursor__request_dev_task", null),
    false,
  );
});

Deno.test("isDevEscalationTool covers MCP + github agent", () => {
  assertStrictEquals(isDevEscalationTool("mcp_Cursor__request_dev_task"), true);
  assertStrictEquals(isDevEscalationTool("mcp_Claude__ask_claude"), true);
  assertStrictEquals(isDevEscalationTool("mcp_Manus__request_dev_task"), true);
  assertStrictEquals(isDevEscalationTool("mcp_Grok__ask_grok"), true);
  assertStrictEquals(isDevEscalationTool("mcp_Grok__request_dev_task"), true);
  assertStrictEquals(isDevEscalationTool("delegate_to_github_agent"), true);
  assertStrictEquals(isDevEscalationTool("request_dev_task"), true);
  assertStrictEquals(isDevEscalationTool("ask_grok"), true);
  assertStrictEquals(isDevEscalationTool("assign_task_to_cursor"), true);
  assertStrictEquals(
    isDevEscalationToolAllowed("assign_task_to_cursor", "bugfix"),
    false,
  );

  assertStrictEquals(isDevEscalationTool("list_clients"), false);
  assertStrictEquals(isDevEscalationTool("toggle_facebook_campaign"), false);
});

Deno.test("isDevEscalationSkill matches escalation skins", () => {
  assertStrictEquals(isDevEscalationSkill("cursor_escalation"), true);
  assertStrictEquals(isDevEscalationSkill("claude_escalation"), true);
  assertStrictEquals(isDevEscalationSkill("grok_escalation"), true);
  assertStrictEquals(isDevEscalationSkill("facebook-campaign-analysis"), false);
  assertStrictEquals(
    isBugfixEscalationSkill("bugfix_escalation_to_cursor"),
    true,
  );
});

Deno.test(
  "resolveDevTaskActorUserId falls back to allowlisted user on WhatsApp phone",
  async () => {
    const id = await resolveDevTaskActorUserId(null, {
      tenantId: null,
      userId: null,
      campaignerId: null,
      phone: "972507677613",
      devEscalationTier: "full",
    });
    assertStrictEquals(id, DAVID_USER);
  },
);

Deno.test("prompt rules differ by tier", () => {
  assertMatch(buildDevEscalationPromptRule("full"), /דיוויד/);
  assertMatch(buildDevEscalationPromptRule("bugfix"), /אנה/);
  assertMatch(buildDevEscalationPromptRule("bugfix"), /create_dev_task/);
  assertMatch(buildDevEscalationPromptRule("bugfix"), /בהודעה הבאה/);
  assertMatch(buildDevEscalationPromptRule(null), /חסום/);
  assertMatch(DEV_ESCALATION_REFUSAL_HE, /דיוויד/);
  assertMatch(DEV_ESCALATION_BUGFIX_ONLY_REFUSAL_HE, /באג/);
});
