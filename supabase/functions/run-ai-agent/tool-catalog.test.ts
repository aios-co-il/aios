import { assertEquals } from "jsr:@std/assert@1";
import { ALL_TOOLS } from "./tool-catalog.ts";
import { WORKSHOP_TOOLS } from "../_shared/workshop-tools.ts";
import { leadCreationTools, leadMutationTools } from "./lead-tool-schemas.ts";

Deno.test(
  "catalog preserves every schema and its develop ordering",
  async () => {
    assertEquals(ALL_TOOLS.length, 239);
    // Captured from the original develop catalog before extraction (2fe5ef954), then recaptured
    // when the landing page kind added its two tools and its kind to workshop_start_project
    // (AIO-607). Includes descriptions, parameters, required fields, and object-key ordering.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(ALL_TOOLS)),
    );
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    assertEquals(
      hex,
      "d898de9a932771e9b21d0d85cf34b4525ea8fef49c5ee92e0615ef7f7e31505c",
    );
  },
);

Deno.test("catalog retains lead slots and the workshop tail", () => {
  assertEquals(ALL_TOOLS.slice(0, leadCreationTools.length), leadCreationTools);
  const leadIndex = ALL_TOOLS.findIndex((tool) => tool.name === "update_lead");
  assertEquals(ALL_TOOLS[leadIndex - 1].name, "set_campaign_table_active");
  assertEquals(ALL_TOOLS.slice(leadIndex, leadIndex + 2), leadMutationTools);
  assertEquals(ALL_TOOLS[leadIndex + 2].name, "update_task");
  assertEquals(ALL_TOOLS.slice(-WORKSHOP_TOOLS.length), WORKSHOP_TOOLS);
});
