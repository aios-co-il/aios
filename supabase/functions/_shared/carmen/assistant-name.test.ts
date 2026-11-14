import { assertEquals } from "jsr:@std/assert@1";
import { orgAssistantName, personalAssistantName } from "./assistant-name.ts";

Deno.test("orgAssistantName", async (t) => {
  await t.step("uses the display name the owner set", () => {
    assertEquals(
      orgAssistantName({
        name: "כרמן",
        metadata: { visual_identity: { displayName: " מיני מי " } },
      }),
      "מיני מי",
    );
  });

  await t.step(
    "uses the agent's own name when it is not a Carmen variant",
    () => {
      assertEquals(
        orgAssistantName({ name: "מיני מי", metadata: {} }),
        "מיני מי",
      );
    },
  );

  await t.step(
    "keeps Carmen when the display name is just the default Carmen name",
    () => {
      // The profile saves the agent's name as its display name until the owner changes it.
      assertEquals(
        orgAssistantName({
          name: "Carmen",
          metadata: { visual_identity: { displayName: "Carmen" } },
        }),
        "כרמן",
      );
    },
  );

  await t.step("falls back to Carmen", () => {
    assertEquals(
      orgAssistantName({ name: "Carmen AI", metadata: null }),
      "כרמן",
    );
    assertEquals(orgAssistantName(null), "כרמן");
    assertEquals(
      orgAssistantName({
        name: "כרמן",
        metadata: { visual_identity: { displayName: "  " } },
      }),
      "כרמן",
    );
  });
});

Deno.test("personalAssistantName prefers the user's character", () => {
  assertEquals(personalAssistantName("AIOS", "מיני מי"), "AIOS");
  assertEquals(personalAssistantName(null, "מיני מי"), "מיני מי");
  assertEquals(personalAssistantName(" ", "כרמן"), "כרמן");
});
