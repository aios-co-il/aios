import { expect, test } from "vitest";
import {
  buildFinishedAdLock,
  buildNoGlyphLock,
  wrapCreativeImagePrompt,
} from "./creativeImagePrompt.ts";

test("no-glyph lock forbids baked Hebrew and English on the PNG", () => {
  const lock = buildNoGlyphLock();
  expect(lock).toMatch(/ZERO GLYPHS/);
  expect(lock).toMatch(/Not Hebrew/);
  expect(lock).toMatch(/garbles Hebrew/);
  expect(lock).toMatch(/Do NOT reserve a top headline strip/);
  expect(lock).not.toMatch(/REGENERATE/);
});

test("regenerate lock tells the model not to paint replacement words", () => {
  const lock = buildNoGlyphLock({ regenerate: true });
  expect(lock).toMatch(/REGENERATE/);
  expect(lock).toMatch(/letter-empty/);
  expect(lock).toMatch(/gibberish/);
});

test("default wrap is a finished Hebrew ad, not a letter-empty plate", () => {
  const lock = buildFinishedAdLock();
  expect(lock).toMatch(/FINISHED HEBREW AD/);
  expect(lock).toMatch(/Paint the quoted Hebrew/);
  expect(lock).toMatch(/APPROVED CONCEPT/);
  expect(lock).toMatch(/right-to-left/i);
  expect(lock).not.toMatch(/ZERO GLYPHS/);
  const wrapped = wrapCreativeImagePrompt("STAGE THIS IDEA");
  expect(wrapped).toMatch(/^FINISHED HEBREW AD/);
  expect(wrapped).toMatch(/STAGE THIS IDEA/);
  expect(wrapped).not.toMatch(/ZERO GLYPHS/);
});

test("live-text wrap keeps the no-glyph lock at both ends", () => {
  const wrapped = wrapCreativeImagePrompt("STAGE THIS IDEA", {
    liveTextLayers: true,
    regenerate: true,
  });
  expect(wrapped).toMatch(/^ZERO GLYPHS/);
  expect(wrapped).toMatch(/STAGE THIS IDEA/);
  expect(wrapped).toMatch(/REGENERATE[\s\S]*STAGE THIS IDEA[\s\S]*REGENERATE/);
});

test("inpaint wrap does not add a finished-ad or no-glyph lock", () => {
  const wrapped = wrapCreativeImagePrompt("INPAINT / ERASE. Delete פרומו", {
    inpaint: true,
  });
  expect(wrapped).toBe("INPAINT / ERASE. Delete פרומו");
  expect(wrapped).not.toMatch(/FINISHED HEBREW AD/);
  expect(wrapped).not.toMatch(/ZERO GLYPHS/);
});

test("concept-led prompts stay first after wrapping", () => {
  const wrapped = wrapCreativeImagePrompt(
    "MUST FOLLOW THIS APPROVED VISUAL CONCEPT\nBig idea: empty pocket",
  );
  expect(wrapped).toMatch(/^MUST FOLLOW THIS APPROVED VISUAL CONCEPT/);
  expect(wrapped).toMatch(/FINISHED HEBREW AD/);
});
