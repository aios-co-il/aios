import { assertStringIncludes } from "jsr:@std/assert@1";
import { userAddressLine } from "../_shared/carmen/user-address.ts";
import { sessionInstructions } from "./session-context.ts";
import { BUILTIN_PERSONAS } from "../_shared/carmen/personas.ts";

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
          persona: null,
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
        persona: null,
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
        persona: null,
      },
      "",
    );
    assertStringIncludes(text, "=== השיחה האחרונה ביניכם (פ.ד פסגות) ===");
    assertStringIncludes(text, "- המשתמש: מה העלות לליד במטא?");
  });

  await t.step("speaks as the character the caller picked", () => {
    const text = sessionInstructions(
      {
        agent: null,
        pronunciations: [],
        orgBrief: null,
        lastConversation: null,
        pulseBrief: null,
        persona: BUILTIN_PERSONAS.minime,
      },
      "",
    );
    assertStringIncludes(text, 'כ"מיני מי"');
    assertStringIncludes(text, "אני מיני מי");
  });
});
