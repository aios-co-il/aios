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
import { connectedGreetings } from "./greetings.ts";

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
          speaker: null,
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
        speaker: null,
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
        speaker: null,
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
        speaker: {
          key: "minime",
          persona: BUILTIN_PERSONAS.minime,
          chosenBy: "user",
          gender: "female",
        },
      },
      "",
    );
    assertStringIncludes(text, 'הדמות שהמשתמש בחר עבורך היא "מיני מי"');
    assertStringIncludes(text, "אני מיני מי");
  });
});

/** A session with nothing loaded but the Mini Me in `gender`, or Carmen for null. */
function withMiniMe(gender: "male" | "female" | null): SessionContext {
  return {
    agent: null,
    pronunciations: [],
    orgBrief: null,
    lastConversation: null,
    pulseBrief: null,
    speaker: gender
      ? {
          key: "minime",
          persona: BUILTIN_PERSONAS.minime,
          chosenBy: "organization",
          gender,
        }
      : null,
  };
}

Deno.test("a male character speaks of himself in the masculine", () => {
  const male = sessionInstructions(withMiniMe("male"), "");
  const female = sessionInstructions(withMiniMe("female"), "");
  const carmen = sessionInstructions(withMiniMe(null), "");

  assertStringIncludes(male, "דבר על עצמך בלשון זכר");
  assertStringIncludes(male, 'הדמות שהארגון בחר עבורך היא "מיני מי"');
  assertNotMatch(female, /דבר על עצמך בלשון זכר/);
  assertNotMatch(carmen, /דבר על עצמך בלשון זכר/);
});

Deno.test("the greeting is said by the session's character", () => {
  const miniMe = withMiniMe("male");
  const miniMeLines = connectedGreetings(miniMe.speaker);
  const carmenLines = connectedGreetings(null);

  for (let i = 0; i < 50; i++) {
    assert(miniMeLines.includes(sessionGreeting(miniMe)));
    assert(carmenLines.includes(sessionGreeting(withMiniMe(null))));
  }
});
