import { assertEquals } from "jsr:@std/assert@1";
import {
  callerPolicyFor,
  callerPolicyRow,
  DEFAULT_CALLER_POLICIES,
} from "./policy.ts";

Deno.test("with no row the defaults apply", () => {
  assertEquals(callerPolicyFor("client", []), DEFAULT_CALLER_POLICIES.client);
  assertEquals(callerPolicyFor("unknown", []).mayBookMeeting, true);
});

Deno.test("the org's row replaces the defaults for that kind only", () => {
  const rows = [
    {
      caller_kind: "client",
      instructions: "רק סטטוס",
      allowed_topics: ["סטטוס עבודה"],
      forbidden_topics: [],
      may_take_message: false,
      may_book_meeting: true,
    },
  ];
  assertEquals(callerPolicyFor("client", rows), {
    instructions: "רק סטטוס",
    allowedTopics: ["סטטוס עבודה"],
    forbiddenTopics: [],
    mayTakeMessage: false,
    mayBookMeeting: true,
  });
  assertEquals(
    callerPolicyFor("unknown", rows),
    DEFAULT_CALLER_POLICIES.unknown,
  );
});

Deno.test("a saved row drops blank topics and trims text", () => {
  const row = callerPolicyRow("t1", "unknown", {
    ...DEFAULT_CALLER_POLICIES.unknown,
    instructions: "  שלום  ",
    allowedTopics: [" שירות ", "", "  "],
  });
  assertEquals(row.instructions, "שלום");
  assertEquals(row.allowed_topics, ["שירות"]);
  assertEquals(row.caller_kind, "unknown");
});
