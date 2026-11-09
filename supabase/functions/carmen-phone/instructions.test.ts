import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { DEFAULT_CALLER_POLICIES } from "../_shared/carmen/caller-policy/policy.ts";
import type { PhoneCaller } from "./caller.ts";
import { callSetup } from "./instructions.ts";

const brief = {
  agencies: [{ name: "דורון אקו", shared: false, clients: ["אקו", "M&M"] }],
  otherClients: [],
  team: [{ name: "רון לוי", roles: [] }],
  today: [],
};

const caller = (over: Partial<PhoneCaller>): PhoneCaller => ({
  kind: "unknown",
  phone: "0529998888",
  name: null,
  clientIds: [],
  clientNames: [],
  campaignerId: null,
  ...over,
});

Deno.test("the team hears the org brief and is greeted by first name", () => {
  const setup = callSetup({
    orgName: "MarketingCaptain",
    caller: caller({ kind: "staff", name: "רון לוי" }),
    policy: null,
    brief,
    pronunciations: ["- AIOS ← אֵיי-אַיי-או-אֶס"],
  });
  assertStringIncludes(setup.prompt, "- סוכנות דורון אקו: אקו, M&M");
  assertStringIncludes(setup.prompt, "- AIOS ← אֵיי-אַיי-או-אֶס");
  assertEquals(setup.firstMessage, "היי רון, כאן כרמן. מה צריך?");
});

Deno.test("a client gets only the policy, never other clients' names", () => {
  const setup = callSetup({
    orgName: "MarketingCaptain",
    caller: caller({ kind: "client", clientNames: ["אקו"] }),
    policy: DEFAULT_CALLER_POLICIES.client,
    brief: null,
    pronunciations: [],
  });
  assertStringIncludes(setup.prompt, "איש קשר של הלקוח אקו");
  assertStringIncludes(setup.prompt, "- מחירים, הצעות מחיר ותשלומים");
  assertStringIncludes(setup.prompt, "leave_message");
  assertEquals(setup.prompt.includes("M&M"), false);
  assertEquals(
    setup.firstMessage,
    "שלום, הגעתם לMarketingCaptain, מדברת כרמן. איך אפשר לעזור?",
  );
});

Deno.test("an unknown caller's actions follow the policy switches", () => {
  const open = callSetup({
    orgName: "X",
    caller: caller({}),
    policy: DEFAULT_CALLER_POLICIES.unknown,
    brief: null,
    pronunciations: [],
  }).prompt;
  assertStringIncludes(open, "לקביעת פגישה");
  const closed = callSetup({
    orgName: "X",
    caller: caller({}),
    policy: {
      ...DEFAULT_CALLER_POLICIES.unknown,
      mayTakeMessage: false,
      mayBookMeeting: false,
    },
    brief: null,
    pronunciations: [],
  }).prompt;
  assertEquals(closed.includes("leave_message"), false);
  assertEquals(closed.includes("לקביעת פגישה"), false);
});
