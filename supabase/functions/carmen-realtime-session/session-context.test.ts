import { assertStringIncludes } from "jsr:@std/assert@1";
import { userAddressLine } from "../_shared/carmen/user-address.ts";
import { sessionInstructions } from "./session-context.ts";

Deno.test("sessionInstructions", async (t) => {
  await t.step(
    "carries the caller's address line for both voice providers",
    () => {
      const text = sessionInstructions(
        {
          agent: null,
          pronunciations: [],
          orgBrief: null,
          lastConversation: null,
          pulseBrief: null,
        },
        userAddressLine("דוד", "male"),
      );
      assertStringIncludes(text, "דוד");
      assertStringIncludes(text, "לשון זכר");
    },
  );

  await t.step("keeps the pronunciations next to it", () => {
    const text = sessionInstructions(
      {
        agent: null,
        pronunciations: [{ term: "כרמן", spoken: "קַרְמֶן" }],
        orgBrief: null,
        lastConversation: null,
        pulseBrief: null,
      },
      userAddressLine(null, null),
    );
    assertStringIncludes(text, "קַרְמֶן");
    assertStringIncludes(text, "לשון רבים");
  });

  await t.step("recalls the last conversation", () => {
    const text = sessionInstructions(
      {
        agent: null,
        pronunciations: [],
        orgBrief: null,
        lastConversation: {
          title: "פ.ד פסגות",
          updatedAt: "2026-11-08T17:19:09Z",
          turns: [{ role: "user", content: "מה העלות לליד במטא?" }],
        },
        pulseBrief: null,
      },
      "",
    );
    assertStringIncludes(text, "=== השיחה האחרונה ביניכם (פ.ד פסגות) ===");
    assertStringIncludes(text, "- המשתמש: מה העלות לליד במטא?");
  });
});
