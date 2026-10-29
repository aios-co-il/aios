import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { EDIT_TOOL } from "./edit-tool.ts";
import { MOTION_TEXT_RULE, motionField } from "./motion-text.ts";
import { WORKSHOP_TOOLS } from "./tool-definitions.ts";

type Schema = {
  description?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
};

/** Every description of a field named `name` in a tool's parameters, at any depth. */
function fieldDescriptions(schema: Schema | undefined, name: string): string[] {
  if (!schema) {
    return [];
  }
  const own = Object.entries(schema.properties ?? {}).flatMap(
    ([key, field]) => [
      ...(key === name ? [String(field.description)] : []),
      ...fieldDescriptions(field, name),
    ],
  );
  return [...own, ...fieldDescriptions(schema.items, name)];
}

describe("motion-text", () => {
  it("appends the rule to a field's description", () => {
    assertStrictEquals(motionField("זז."), `זז. ${MOTION_TEXT_RULE}`);
  });

  // Staging, 2 Nov: Carmen asked the video engine for "Hebrew overlay text floating in the water".
  it("is in every motion field Carmen fills", () => {
    const motion = WORKSHOP_TOOLS.flatMap((tool) =>
      fieldDescriptions(tool.parameters as Schema, "motion_prompt"),
    );
    assertStrictEquals(motion.length >= 2, true);
    for (const description of motion) {
      assertMatch(description, /בלי טקסט/);
    }
    assertMatch(
      String(
        (EDIT_TOOL.parameters.properties as Record<string, Schema>).motion
          .description,
      ),
      /בלי טקסט/,
    );
  });
});
