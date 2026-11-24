import { assertEquals } from "jsr:@std/assert@1";
import { ALL_TOOLS } from "./tool-catalog.ts";
import { WORKSHOP_TOOLS } from "../_shared/workshop-tools.ts";
import { leadCreationTools, leadMutationTools } from "./lead-tool-schemas.ts";
import { seoTools } from "./tool-schemas/seo.ts";
import { seoActionTools } from "./tool-schemas/seo-actions.ts";

Deno.test(
  "catalog preserves every schema and its develop ordering",
  async () => {
    assertEquals(ALL_TOOLS.length, 251);
    // Captured from the original develop catalog before extraction (2fe5ef954), then recaptured
    // when the landing page kind added its two tools and its kind to workshop_start_project
    // (AIO-607), then workshop_import_landing_page, when workshop_import_file let a direct
    // brain put its files on the board, when the five read-only SEO tools joined before the
    // workshop tail, when the five approval-gated SEO actions followed them, and when
    // create_agent_task said its repeating schedules are read in Israel time.
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
      "aae2a3d0ab468fac0fad0c32bfaa347602655a18abc5690bf23ae6ccf0f71541",
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
  const seoEnd = ALL_TOOLS.length - WORKSHOP_TOOLS.length;
  const seo = [...seoTools, ...seoActionTools];
  assertEquals(ALL_TOOLS.slice(seoEnd - seo.length, seoEnd), seo);
});
