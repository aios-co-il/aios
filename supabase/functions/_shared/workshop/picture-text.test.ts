import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  PICTURE_TEXT_RULE,
  STILL_NO_TEXT,
  pictureField,
  stillNoText,
} from "./picture-text.ts";
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

describe("picture-text", () => {
  it("appends the rule to a field's description", () => {
    assertStrictEquals(pictureField("תמונה."), `תמונה. ${PICTURE_TEXT_RULE}`);
  });

  it("keeps the no-text rule and adds no place for text", () => {
    assertMatch(STILL_NO_TEXT, /No text on the image/);
    assertMatch(STILL_NO_TEXT, /no signs, plaques, banners/);
  });

  // Staging, 5 Nov: glowing nodes came back labeled "madix" and "salles".
  it("forbids letters, labels and UI text, and unlabels nodes, charts and screens", () => {
    assertMatch(STILL_NO_TEXT, /no letters, no words, no numbers, no labels/);
    assertMatch(STILL_NO_TEXT, /no UI text/);
    assertStrictEquals(stillNoText("a woman at a cafe"), STILL_NO_TEXT);
    for (const visual of [
      "five glowing nodes",
      "a rising line chart on a dark screen",
      "a dashboard",
    ]) {
      assertMatch(stillNoText(visual), /pure unlabeled shapes/);
    }
    assertMatch(PICTURE_TEXT_RULE, /תוויות/);
  });

  // Staging, 2 Nov: Carmen described an end-card picture with a gold plaque for the offer.
  it("is in every picture description Carmen writes", () => {
    const pictures = WORKSHOP_TOOLS.flatMap((tool) =>
      fieldDescriptions(tool.parameters as Schema, "visual_prompt"),
    );
    assertStrictEquals(pictures.length >= 2, true);
    for (const description of pictures) {
      assertMatch(description, /בלי מקום לטקסט/);
    }
  });
});
