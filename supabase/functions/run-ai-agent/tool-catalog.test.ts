import { assertEquals } from "jsr:@std/assert@1";
import { ALL_TOOLS } from "./tool-catalog.ts";
import { WORKSHOP_TOOLS } from "../_shared/workshop-tools.ts";
import { leadCreationTools, leadMutationTools } from "./lead-tool-schemas.ts";

Deno.test(
  "catalog preserves every schema and its develop ordering",
  async () => {
    assertEquals(ALL_TOOLS.length, 240);
    // Captured from the original develop catalog before extraction (2fe5ef954), then recaptured
    // when the landing page kind added its two tools and its kind to workshop_start_project
    // (AIO-607), and when workshop_import_file let a direct brain put its files on the board.
    // Includes descriptions, parameters, required fields, and object-key ordering.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(ALL_TOOLS)),
    );
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    assertEquals(
      hex,
      "64027d8593bd8d9f161682b147b48d64b5123f3d821d5d74d3c35496fdbe6ddd",
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
