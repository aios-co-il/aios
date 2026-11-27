import {
  assert,
  assertNotMatch,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { userAddressLine } from "../_shared/carmen/user-address.ts";
import {
  type SessionContext,
  sessionGreeting,
  sessionInstructions,
} from "./session-context.ts";
import { BUILTIN_PERSONAS } from "../_shared/carmen/personas.ts";
import { CARMEN_GREETER, connectedGreetings } from "./greetings.ts";

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
          gender: "female",
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
        gender: "female",
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
        gender: "female",
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
        gender: "female",
      },
      "",
    );
    assertStringIncludes(text, 'כ"מיני מי"');
    assertStringIncludes(text, "אני מיני מי");
  });
});

/** A session with nothing loaded but the character. */
function withCharacter(
  persona: SessionContext["persona"],
  gender: SessionContext["gender"],
): SessionContext {
  return {
    agent: null,
    pronunciations: [],
    orgBrief: null,
    lastConversation: null,
    pulseBrief: null,
    persona,
    gender,
  };
}

Deno.test("a male character speaks of himself in the masculine", () => {
  const male = sessionInstructions(
    withCharacter(BUILTIN_PERSONAS.minime, "male"),
    "",
  );
  const female = sessionInstructions(
    withCharacter(BUILTIN_PERSONAS.minime, "female"),
    "",
  );
  const carmen = sessionInstructions(withCharacter(null, "female"), "");

  assertStringIncludes(male, "דבר על עצמך בלשון זכר");
  assertNotMatch(female, /בלשון זכר \("אני בודק"/);
  assertNotMatch(carmen, /בלשון זכר \("אני בודק"/);
});

Deno.test("the greeting is said by the session's character", () => {
  const miniMe = withCharacter(BUILTIN_PERSONAS.minime, "male");
  const miniMeLines = connectedGreetings({ name: "מיני מי", gender: "male" });
  const carmenLines = connectedGreetings(CARMEN_GREETER);

  for (let i = 0; i < 50; i++) {
    assert(miniMeLines.includes(sessionGreeting(miniMe)));
    assert(
      carmenLines.includes(sessionGreeting(withCharacter(null, "female"))),
    );
  }
});
