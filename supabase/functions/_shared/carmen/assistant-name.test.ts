import { assertEquals } from "jsr:@std/assert@1";
import { orgAssistantName, personalAssistantName } from "./assistant-name.ts";
import { isCarmenAgentRow } from "./brain-access.ts";

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

Deno.test("isCarmenAgentRow finds Carmen after a rename", () => {
  assertEquals(isCarmenAgentRow({ is_carmen: true, name: "מיני מי" }), true);
  assertEquals(isCarmenAgentRow({ is_carmen: false, name: "כרמן" }), true);
  assertEquals(isCarmenAgentRow({ is_carmen: false, name: "מיני מי" }), false);
  assertEquals(isCarmenAgentRow(null), false);
});
