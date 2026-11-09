import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { leadCreationTools, leadMutationTools } from "./lead-tool-schemas.ts";

Deno.test(
  "lead schemas preserve the complete develop tool contract",
  async () => {
    const tools = [...leadCreationTools, ...leadMutationTools];
    assertEquals(
      tools.map((tool) => tool.name),
      [
        "create_lead",
        "list_leads",
        "update_lead_status",
        "add_lead_update",
        "update_lead",
        "delete_lead",
      ],
    );
    // Golden digest of the original schemas at develop 2fe5ef954, including text,
    // property order, required fields, and optional-field omission.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(tools)),
    );
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    assertEquals(
      hex,
      "5f552c9de23309ba8f3f52a61455fe29e5e052d6a9ee8b7672feab1ce7d76965",
    );
  },
);

Deno.test("lead schema groups retain their original catalog positions", () => {
  const source = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
  assertMatch(
    source,
    /const ALL_TOOLS = \[\s*\.\.\.leadCreationTools,\s*\/\/ TASKS/,
  );
  assertMatch(
    source,
    /required: \["active"\],[\s\S]*?\.\.\.leadMutationTools,\s*\/\/ TASKS - full CRUD/,
  );
  for (const tool of [...leadCreationTools, ...leadMutationTools]) {
    assertEquals(source.includes(`name: "${tool.name}"`), false);
  }
});
