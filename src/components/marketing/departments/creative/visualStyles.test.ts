import { expect, test } from "vitest";
import { pickNextVariationStyle } from "./designedLayers.ts";
import {
  CREATIVE_VISUAL_STYLES,
  DEFAULT_VISUAL_STYLE_ID,
  buildVisualStyleLock,
  isVisualStyleId,
  stylesInGroup,
} from "./visualStyles.ts";

test("default style is adaptive; the ten boards stay optional", () => {
  expect(DEFAULT_VISUAL_STYLE_ID).toBe("adaptive");
  expect(stylesInGroup("auto").map((item) => item.id)).toStrictEqual([
    "adaptive",
  ]);
  const reference = stylesInGroup("reference").map((item) => item.id);
  expect(reference).toStrictEqual([
    "swiss",
    "industrial",
    "mediterranean",
    "kinetic",
    "glass",
    "collage",
    "bauhaus",
    "cinematic",
    "holographic",
    "organic",
  ]);
});

test("legacy style ids still resolve so old projects keep working", () => {
  for (const id of [
    "adaptive",
    "photoreal",
    "animation",
    "illustration",
    "popart",
    "render3d",
    "editorial",
    "ugc",
    "watercolor",
    "comic",
  ]) {
    expect(isVisualStyleId(id)).toBe(true);
  }
});

test("collage lock is not overridden by a global anti-collage rule", () => {
  const lock = buildVisualStyleLock({}, { styleId: "collage" });
  expect(lock).toMatch(/analog mixed-media collage/i);
  expect(lock).not.toMatch(/Forbidden:.*collage/i);
});

test("style locks are treatment only and never require a travel cliché", () => {
  for (const styleId of [
    "swiss",
    "kinetic",
    "organic",
    "bauhaus",
    "cinematic",
    "holographic",
  ] as const) {
    const lock = buildVisualStyleLock({}, { styleId });
    expect(lock).toMatch(/THIS copy/i);
    expect(lock).toMatch(/IRON RULE/i);
    expect(lock).toMatch(/style is costume and lighting only/i);
    expect(lock).toMatch(/SELECTED STYLE/i);
    expect(lock).toMatch(/APPLY that TECHNIQUE/i);
    expect(lock).toMatch(/BRAND COLOR LOCK/i);
    expect(lock).not.toMatch(/destination coast/i);
  }
  expect(buildVisualStyleLock({}, { styleId: "organic" })).toMatch(
    /ONLY if the copy is about a place/i,
  );
  expect(buildVisualStyleLock({}, { styleId: "bauhaus" })).toMatch(
    /never a default airplane wing/i,
  );
  expect(buildVisualStyleLock({}, { styleId: "kinetic" })).toMatch(
    /not a random streaking car/i,
  );
});

test("new variations stay adaptive instead of cycling the style boards", () => {
  const next = pickNextVariationStyle(["swiss", "industrial"]);
  expect(next.id).toBe("adaptive");
  expect(next.group).toBe("auto");
});

test("a user-selected named style is applied, not treated as optional", () => {
  const lock = buildVisualStyleLock({}, { styleId: "collage" });
  expect(lock).toMatch(/SELECTED STYLE/i);
  expect(lock).toMatch(/APPLY that TECHNIQUE/i);
  expect(lock).toMatch(/Do not reprint/i);
  expect(lock).toMatch(/analog mixed-media collage/i);
  expect(lock).toMatch(/NEW board/i);
  expect(lock).not.toMatch(/OPTIONAL COSTUME/i);
});

test("adaptive lock does not apply a named style-board recipe", () => {
  const lock = buildVisualStyleLock({}, { styleId: "adaptive" });
  expect(lock).toMatch(/invent a treatment from this copy/i);
  expect(lock).not.toMatch(/Swiss \/ international commercial/i);
  expect(lock).not.toMatch(/pink-purple-cyan/i);
});
