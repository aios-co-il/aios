import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { SEND_KINDS } from "../client-card/send-kind.ts";
import { Constants } from "../database.types.ts";
import {
  CLIENT_RULES,
  isClientSide,
  isObservedRefusal,
  OBSERVED_REFUSALS,
  optInKindForAutomation,
  optInTarget,
} from "./rules.ts";
import { CLIENT_SEND_REFUSALS, RECIPIENT_KINDS } from "./types.ts";

const recipient = (kind: (typeof RECIPIENT_KINDS)[number]) => ({
  kind,
  clientIds: [],
  leadId: null,
  groupId: null,
  ambiguous: false,
});

Deno.test("every send kind has exactly one client rule", () => {
  // Deno CI runs --no-check, so the Record type alone does not catch a
  // kind added to SEND_KINDS without a rule.
  assertEquals(Object.keys(CLIENT_RULES).sort(), [...SEND_KINDS].sort());
});

Deno.test("observed refusals are refusals and name their issue", () => {
  for (const [reason, issue] of Object.entries(OBSERVED_REFUSALS)) {
    assertEquals(
      CLIENT_SEND_REFUSALS.some((known) => known === reason),
      true,
      reason,
    );
    assertMatch(issue ?? "", /AIO-\d+/, reason);
  }
  assertEquals(isObservedRefusal("unclassified_service_send"), true);
  assertEquals(isObservedRefusal("staff_only"), false);
  assertEquals(isObservedRefusal("guard_error"), false);
});

Deno.test("only client-side recipients meet the rules", () => {
  const sides = RECIPIENT_KINDS.filter((kind) => isClientSide(recipient(kind)));
  assertEquals(sides, ["client", "client_contact", "client_group"]);
});

Deno.test("an automation's trigger picks its card switch", () => {
  for (const trigger of [
    "lead_created",
    "lead_status_changed",
    "inbound_webhook_lead",
  ]) {
    assertEquals(optInKindForAutomation(trigger), "lead_alert", trigger);
  }
  for (const trigger of [
    "ad_account_blocked",
    "ad_account_billing_issue",
    "account_stopped_spending",
    "integration_disconnected",
  ]) {
    assertEquals(optInKindForAutomation(trigger), "campaign_alert", trigger);
  }
  assertEquals(optInKindForAutomation("task_overdue"), "automation");
  const kinds = new Set<string>(Constants.public.Enums.client_auto_send_kind);
  for (const trigger of Constants.public.Enums.automation_trigger) {
    assertEquals(kinds.has(optInKindForAutomation(trigger)), true, trigger);
  }
});

Deno.test("the recipient picks the switch's target", () => {
  assertEquals(
    optInTarget("whatsapp", recipient("client_group")),
    "whatsapp_group",
  );
  assertEquals(optInTarget("whatsapp", recipient("client")), "whatsapp_direct");
  assertEquals(
    optInTarget("whatsapp", recipient("client_contact")),
    "whatsapp_direct",
  );
  assertEquals(optInTarget("email", recipient("client")), "email");
  assertEquals(optInTarget("telegram", recipient("client")), null);
});
