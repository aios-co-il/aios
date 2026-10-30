import { assertEquals } from "jsr:@std/assert@1";

import { parseTargetInput } from "./parse-target-input.ts";

Deno.test("a target request defaults the kind to the goal's first", () => {
  assertEquals(
    parseTargetInput({
      client_id: " client-1 ",
      platform: "google",
      goal: "ecommerce",
      value: "3",
      campaign_id: "",
    }),
    {
      clientId: "client-1",
      platform: "google",
      goal: "ecommerce",
      kind: "roas",
      value: 3,
      campaignId: null,
    },
  );
});

Deno.test("the first wrong argument is named", () => {
  const base = { client_id: "c", platform: "meta", goal: "leads", value: 5 };
  assertEquals(parseTargetInput({ ...base, client_id: "" }), {
    error: "client_id נדרש",
  });
  assertEquals(parseTargetInput({ ...base, platform: "tiktok" }), {
    error: "platform חייב להיות meta או google",
  });
  assertEquals(parseTargetInput({ ...base, goal: "engagement" }), {
    error: "goal חייב להיות leads או ecommerce",
  });
  assertEquals(parseTargetInput({ ...base, kind: "roas" }), {
    error: "סוג יעד roas לא מתאים למטרה leads (אפשר: cpl)",
  });
  assertEquals(parseTargetInput({ ...base, value: 0 }), {
    error: "value חייב להיות מספר חיובי",
  });
});
