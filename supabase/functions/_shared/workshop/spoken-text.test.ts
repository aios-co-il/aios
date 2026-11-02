import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { SPOKEN_TEXT_RULE } from "./spoken-text.ts";
import { WORKSHOP_TOOLS } from "./tool-definitions.ts";

const SPOKEN = new Set(["voiceover_text", "voiceover", "dialogue"]);

/** Every parameter that holds what the film says, in every workshop tool. */
function spokenFields(node: unknown, path: string, out: [string, string][]) {
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const child = value as { description?: unknown };
    if (SPOKEN.has(key) && child && typeof child === "object")
      out.push([`${path}.${key}`, String(child.description ?? "")]);
    spokenFields(value, `${path}.${key}`, out);
  }
  return out;
}

Deno.test(
  "every spoken-text field tells Carmen to fix pronunciation in Hebrew, never in Latin letters",
  () => {
    const fields = WORKSHOP_TOOLS.flatMap((tool) =>
      spokenFields(tool.parameters, tool.name, []),
    );
    // workshop_storyboard, workshop_update_scene and workshop_edit_from_assets each have both.
    assert(fields.length >= 6, `found ${fields.length} spoken-text fields`);
    for (const [path, description] of fields)
      assertStringIncludes(description, SPOKEN_TEXT_RULE, path);
  },
);
